#!/usr/bin/env bash
# End-to-end smoke test over real HTTP: Issuer.Api (5080) + Enforcer.Api (5090) on throwaway
# MongoDB databases. Generates its own keys and admin; touches nothing else.
# Needs: dotnet 10, python3 (+ pymongo for cleanup), curl, local mongod.
set -uo pipefail
cd "$(dirname "$0")/.."
W=$(mktemp -d); RUN=$RANDOM
IDB="p360_e2e_issuer_$RUN"; EDB="p360_e2e_enforcer_$RUN"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; PASS=$((PASS+1)); else echo "  FAIL $1 (expected '$3', got '$2')"; FAIL=$((FAIL+1)); fi; }
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
totp() { python3 - "$1" "$2" <<'EOF'
import sys,hmac,hashlib,base64,struct,time
k=base64.b32decode(sys.argv[1]);c=int(time.time())//30+int(sys.argv[2])
h=hmac.new(k,struct.pack(">Q",c),hashlib.sha1).digest();o=h[-1]&15
print("%06d"%((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000))
EOF
}

dotnet build LicenseManagement.slnx -v q >/dev/null || exit 1
KEYS=$(dotnet run --no-build --no-launch-profile --project src/Issuer.Api -- keygen)
PRIV=$(echo "$KEYS" | sed -n 's/^ISSUER_SIGNING_KEY=//p'); PUB=$(echo "$KEYS" | sed -n 's/^ISSUER_PUBLIC_KEY=//p')

start_issuer() {
  Issuer__SigningKey="$PRIV" Issuer__Jwt__Key="e2e-jwt-key-0123456789-0123456789-abc" \
  Issuer__AdminSeed__Username=admin Issuer__AdminSeed__Password="e2e-password-123" \
  ConnectionStrings__IssuerDb="mongodb://localhost:27017/$IDB" Issuer__Smtp__PickupDirectory="$W/mail" \
  ASPNETCORE_ENVIRONMENT=Development dotnet run --no-build --project src/Issuer.Api > "$W/issuer.log" 2>&1 &
  echo $! > "$W/issuer.pid"
}
start_enforcer() { # $1 = install credential (optional)
  Enforcer__SubscriberCode=E2E-0001 Enforcer__PublicKeys__0="$PUB" Enforcer__StateDirectory="$W/state" \
  LocalAdmin__ApiKey=local-admin-e2e ConnectionStrings__EnforcerDb="mongodb://localhost:27017/$EDB" \
  Enforcer__RemoteCheckIn__IssuerUrl=http://localhost:5080 Enforcer__RemoteCheckIn__Credential="${1:-}" \
  ASPNETCORE_ENVIRONMENT=Development dotnet run --no-build --project src/Enforcer.Api > "$W/enforcer.log" 2>&1 &
  echo $! > "$W/enforcer.pid"
}
wait_up() { for _ in $(seq 1 40); do curl -sf "localhost:$1/health" >/dev/null && return 0; sleep 0.5; done; echo "port $1 did not start"; return 1; }
cleanup() {
  kill "$(cat "$W/issuer.pid" 2>/dev/null)" "$(cat "$W/enforcer.pid" 2>/dev/null)" 2>/dev/null
  python3 -c "import pymongo;c=pymongo.MongoClient();c.drop_database('$IDB');c.drop_database('$EDB')" 2>/dev/null
  rm -rf "$W"
}
trap cleanup EXIT

start_issuer; start_enforcer; wait_up 5080 && wait_up 5090 || { tail -20 "$W"/*.log; exit 1; }
LA='X-Local-Admin: local-admin-e2e'

echo "Issuer auth"
check "admin endpoint without token" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5080/api/entitlements)" 401
L=$(curl -s localhost:5080/api/auth/login -H 'content-type: application/json' -d '{"username":"admin","password":"e2e-password-123"}')
check "first login asks for TOTP enrollment" "$(echo "$L" | j "d['enrollRequired']")" True
SEC=$(echo "$L" | j "d['secret']"); MT=$(echo "$L" | j "d['mfaToken']")
TOK=$(curl -s localhost:5080/api/auth/mfa -H 'content-type: application/json' -d "{\"mfaToken\":\"$MT\",\"code\":\"$(totp "$SEC" 0)\"}" | j "d['accessToken']")
A="Authorization: Bearer $TOK"
check "admin token works" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5080/api/catalog -H "$A")" 200

echo "Issue license bound to this machine"
curl -s localhost:5090/api/license/activation-request -o "$W/req.actreq"
FP=$(curl -s localhost:5080/api/activation/parse -H "$A" -F "file=@$W/req.actreq" | j "d['hostFingerprint']")
check "activation request parsed" "${FP:0:4}" hf1_
E=$(curl -s localhost:5080/api/entitlements -H "$A" -H 'content-type: application/json' -d "{\"subscriberCode\":\"E2E-0001\",\"customerName\":\"E2E Corp\",\"contactEmail\":\"it@e2e.example\",\"tier\":\"Essential\",\"modules\":[{\"moduleKey\":\"time-attendance\"}],\"capacity\":{\"connected\":{\"quantity\":100}},\"validFrom\":\"2026-01-01T00:00:00Z\",\"validUntil\":\"2030-01-01T00:00:00Z\",\"hostingMode\":\"OnPrem\",\"hostFingerprint\":\"$FP\"}")
ID=$(echo "$E" | j "d['id']")
check "created revision 1" "$(echo "$E" | j "d['revision']")" 1
check "connected only -> registered 50" "$(echo "$E" | j "d['capacity']['registered']['quantity']")" 50
curl -s "localhost:5080/api/entitlements/$ID/file" -H "$A" -o "$W/r1.entl"

echo "Enforcer"
check "gate blocks with no license" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/modules/time-attendance/ping)" 403
check "import r1" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/license/import -H "$LA" -F "file=@$W/r1.entl")" 200
check "licensed module allowed" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/modules/time-attendance/ping)" 200
check "unticked core module blocked" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/modules/people-identity/ping)" 403
check "unlicensed module blocked" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/modules/digital-twin/ping)" 403
python3 - "$W" <<'EOF'
import json,base64,sys
w=sys.argv[1];e=json.load(open(w+'/r1.entl'));p=json.loads(base64.b64decode(e['payload']))
p['validUntil']='2099-01-01T00:00:00Z';p['revision']=99
e['payload']=base64.b64encode(json.dumps(p).encode()).decode();json.dump(e,open(w+'/forged.entl','w'))
EOF
check "forged file rejected" "$(curl -s localhost:5090/api/license/import -H "$LA" -F "file=@$W/forged.entl" | j "d['code']")" InvalidSignature
check "import without local admin key" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/license/import -F "file=@$W/r1.entl")" 401

echo "Renew + rollback"
R=$(curl -s "localhost:5080/api/entitlements/$ID/renew" -H "$A" -H 'content-type: application/json' -d '{"validUntil":"2031-01-01T00:00:00Z"}')
RID=$(echo "$R" | j "d['id']")
check "renew gives revision 2" "$(echo "$R" | j "d['revision']")" 2
check "old row superseded" "$(curl -s "localhost:5080/api/entitlements/$ID" -H "$A" | j "d['state']")" Superseded
curl -s "localhost:5080/api/entitlements/$RID/file" -H "$A" -o "$W/r2.entl"
check "import r2" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5090/api/license/import -H "$LA" -F "file=@$W/r2.entl")" 200
check "re-import r1 rejected" "$(curl -s localhost:5090/api/license/import -H "$LA" -F "file=@$W/r1.entl" | j "d['code']")" Rollback

echo "Remote check-in + suspend"
KEY=$(curl -s -X POST "localhost:5080/api/entitlements/$RID/install-key" -H "$A" | j "d['apiKey']")
kill "$(cat "$W/enforcer.pid")"; sleep 1; start_enforcer "$KEY"; wait_up 5090
check "check-in ok" "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:5090/api/license/checkin -H "$LA")" 200
curl -s "localhost:5080/api/entitlements/$RID/suspend" -H "$A" -H 'content-type: application/json' -d '{"reason":"unpaid invoice"}' >/dev/null
curl -s -o /dev/null -X POST localhost:5090/api/license/checkin -H "$LA"
check "suspended at vendor, blocked at customer" "$(curl -s localhost:5090/api/modules/time-attendance/ping | j "d['code']")" RemoteSuspended
check "check-in with wrong key" "$(curl -s -o /dev/null -w '%{http_code}' localhost:5080/api/checkin/E2E-0001 -H 'X-Install-Key: p360ik_wrong' -H 'content-type: application/json' -d '{"revision":2}')" 401

echo "Audit + mail"
ACTIONS=$(curl -s "localhost:5080/api/audit?subscriberCode=E2E-0001" -H "$A" | j "','.join(sorted({a['action'] for a in d['items']}))")
check "audit trail" "$ACTIONS" "credential.issue,entitlement.create,entitlement.download,entitlement.renew,entitlement.supersede,entitlement.suspend"
check "license mails written" "$(ls "$W/mail" | wc -l)" 2

echo; echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
