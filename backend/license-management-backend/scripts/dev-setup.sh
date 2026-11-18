#!/usr/bin/env bash
# One-time local dev setup. Generates keys and stores them with `dotnet user-secrets`
# (outside the repo). Never put these values in appsettings*.json.
#
#   ./scripts/dev-setup.sh [username]                       asks for the password
#   ADMIN_PASSWORD='...' ./scripts/dev-setup.sh [username]  non-interactive
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_USER="${1:-admin}"
ADMIN_PW="${ADMIN_PASSWORD:-}"
if [ -z "$ADMIN_PW" ]; then
  if [ ! -t 0 ]; then
    echo "No terminal to ask for a password. Run it in a normal terminal, or pass ADMIN_PASSWORD='...'."
    exit 1
  fi
  read -rsp "Password for first admin '$ADMIN_USER' (min 12 chars): " ADMIN_PW; echo
fi
[ ${#ADMIN_PW} -ge 12 ] || { echo "Password must be at least 12 characters."; exit 1; }

if dotnet user-secrets --project src/Issuer.Api list 2>/dev/null | grep -q '^Issuer:SigningKey'; then
  echo "Signing key already set. Keeping it (replacing it would invalidate every license issued so far)."
else
  KEYS=$(dotnet run --no-launch-profile --project src/Issuer.Api -- keygen)
  PRIV=$(echo "$KEYS" | sed -n 's/^ISSUER_SIGNING_KEY=//p')
  PUB=$(echo "$KEYS" | sed -n 's/^ISSUER_PUBLIC_KEY=//p')
  [ -n "$PRIV" ] && [ -n "$PUB" ] || { echo "keygen failed"; exit 1; }
  dotnet user-secrets --project src/Issuer.Api set "Issuer:SigningKey" "$PRIV" >/dev/null
  echo "$PUB" > issuer-public-key.txt
  echo "Issuer public key (Enforcer:PublicKeys of every customer install), saved to issuer-public-key.txt:"
  echo "  $PUB"
fi

JWT=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
dotnet user-secrets --project src/Issuer.Api set "Issuer:Jwt:Key" "$JWT" >/dev/null
dotnet user-secrets --project src/Issuer.Api set "Issuer:AdminSeed:Username" "$ADMIN_USER" >/dev/null
dotnet user-secrets --project src/Issuer.Api set "Issuer:AdminSeed:Password" "$ADMIN_PW" >/dev/null

echo
echo "Done. Start the API:  dotnet run --project src/Issuer.Api"
echo "Admin '$ADMIN_USER' is created on first start (only when no admin exists yet)."
echo "Admin already exists? Apply this password with:  dotnet run --project src/Issuer.Api -- reset-admin"
echo "After your first successful login, remove the seed password:"
echo "  dotnet user-secrets --project src/Issuer.Api remove Issuer:AdminSeed:Password"
