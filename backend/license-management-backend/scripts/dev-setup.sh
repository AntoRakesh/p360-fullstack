#!/usr/bin/env bash
# One-time local dev setup. Generates keys and stores them with `dotnet user-secrets`
# (outside the repo). Never put these values in appsettings*.json.
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_USER="${1:-admin}"
read -rsp "Password for first admin '$ADMIN_USER' (min 12 chars): " ADMIN_PW; echo
[ ${#ADMIN_PW} -ge 12 ] || { echo "Password too short"; exit 1; }

KEYS=$(dotnet run --no-launch-profile --project src/Issuer.Api -- keygen)
PRIV=$(echo "$KEYS" | sed -n 's/^ISSUER_SIGNING_KEY=//p')
PUB=$(echo "$KEYS" | sed -n 's/^ISSUER_PUBLIC_KEY=//p')
[ -n "$PRIV" ] && [ -n "$PUB" ] || { echo "keygen failed"; exit 1; }
JWT=$(head -c 48 /dev/urandom | base64 | tr -d '\n')

dotnet user-secrets --project src/Issuer.Api set "Issuer:SigningKey" "$PRIV" >/dev/null
dotnet user-secrets --project src/Issuer.Api set "Issuer:Jwt:Key" "$JWT" >/dev/null
dotnet user-secrets --project src/Issuer.Api set "Issuer:AdminSeed:Username" "$ADMIN_USER" >/dev/null
dotnet user-secrets --project src/Issuer.Api set "Issuer:AdminSeed:Password" "$ADMIN_PW" >/dev/null

echo "Issuer secrets stored in user-secrets."
echo
echo "Issuer public key (put in Enforcer:PublicKeys of every customer install):"
echo "  $PUB"
echo "$PUB" > issuer-public-key.txt
echo "Also written to issuer-public-key.txt"
echo
echo "After the first successful login, remove the seed password:"
echo "  dotnet user-secrets --project src/Issuer.Api remove Issuer:AdminSeed:Password"
