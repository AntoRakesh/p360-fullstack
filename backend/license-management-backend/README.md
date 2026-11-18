# License Management — backend

.NET 10 + MongoDB. Vendor side issues signed licenses; customer side enforces them.

```
src/
  Licensing.Contracts/  shared models, tier catalog (p360 module keys), envelope format
  Issuer.Api/           vendor: admin API (JWT + TOTP), signing, renew, audit, expiry sweep   :5080
  Enforcer.Core/        library inside every p360 service: verify, gate middleware, clock guard
  Enforcer.Api/         customer install: import .entl, status, .actreq, check-in            :5090
tests/
  Enforcer.Tests/       every bypass attempt from the threat model (no DB needed)
  Issuer.Tests/         auth on every admin endpoint, renew, check-in (uses local MongoDB)
scripts/
  dev-setup.sh          generate keys + first admin into dotnet user-secrets
  e2e-smoke.sh          full flow over HTTP on throwaway databases
docs/API.md             contract shared with frontend/license-management
```

## Run (dev)

```bash
./scripts/dev-setup.sh admin                 # once: keys + admin password into user-secrets
dotnet run --project src/Issuer.Api          # http://localhost:5080
cd ../../frontend/license-management && npm start   # http://localhost:4201
```

First login shows a QR code. Scan it with an authenticator app. Then remove the seed password:
`dotnet user-secrets --project src/Issuer.Api remove Issuer:AdminSeed:Password`

Forgot the password or lost the authenticator? Set a new seed password (`./scripts/dev-setup.sh`), then
`dotnet run --project src/Issuer.Api -- reset-admin`. It resets the password and TOTP; the API can keep running.

Tests: `dotnet test LicenseManagement.slnx` and `./scripts/e2e-smoke.sh`.

## Tiers

`ProductCatalog` in `Licensing.Contracts/Catalog.cs`. Essential / Professional / Enterprise from the tier sheet.
"Optional" = add-on. The license grants modules only (no seat, device or feature limits). The signed file carries
the final module list, so editing the catalog never changes licenses already issued.

## License lifecycle

| Action | What happens |
|---|---|
| Create | Revision 1, signed `.entl` stored on the row, emailed to `contactEmail` |
| Renew | New row revision+1 (new signed file, emailed). Old row → `Superseded`. Terms never edited in place |
| Suspend / Resume / Revoke | State change + reason. Reaches the customer at next check-in / ping |
| Expiry | Background sweep sets `Expired`; customer gate blocks on `validUntil` by itself anyway |
| Every write | Append-only `auditEvents` row (who, action, before, after, at, ip) |

Customer renewal = customer contacts vendor → admin clicks Renew → customer imports new file.
Customer can never produce a valid file: only the Issuer holds the private key.

## Threat model

| Attack | Defense |
|---|---|
| Call admin API to extend own license | Every endpoint needs JWT with `LicenseAdmin` (fallback policy) + TOTP at login. IP allowlist `Issuer:AdminAllowedNetworks`, rate limits. Keep Issuer on VPN/internal network |
| Edit / forge `.entl` | Ed25519 signature over exact payload bytes; JSON parsed only after verify |
| Edit license DB fields (`status`, `expiryDate`, `lastCheckinAt`) | Gate decides from signed file + signed Issuer receipt only. Local state has MAC; check-in time comes from signed receipt |
| Re-import older file | Highest revision kept in file store **and** Mongo; highest wins |
| Copy to other machine | `hostFingerprint` (hash of machine-id); OnPrem must be bound |
| Set clock back | Clock high-water persisted; going back > 10 min locks. Issuer receipts push the high-water forward |
| Just keep using after expiry | Gate checks `validUntil` on every request; no heartbeat needed |
| Split mode pointing license DB at local copy | Startup + gate fail if license DB host is localhost/private network |

Known limits (by design, document to customers): a fully offline install learns about suspend/revoke
only via a new file; wiping **all** local state stores and the DB resets rollback history (license then
has to be re-imported, and with check-in enabled the Issuer receipt shows the newer revision).

## Secrets

Never in appsettings. Production: environment variables or vault.
`Issuer__SigningKey`, `Issuer__Jwt__Key`, `ConnectionStrings__IssuerDb`, SMTP password.
Enforcer ships only the public key (`Enforcer__PublicKeys__0`).
Restrict the Mongo user for `auditEvents` to insert+find to make append-only enforceable at DB level.

## Adding the gate to a p360 service

```csharp
builder.Services.AddLicenseEnforcer(builder.Configuration);   // reads "Enforcer" section
app.UseRouting();
app.UseLicenseGate();   // 403 "License expired — contact your vendor to renew."
```
Module is taken from `/api/{moduleKey}/...` (p360 module path). Override `ModuleKeyResolver` for other routes.
