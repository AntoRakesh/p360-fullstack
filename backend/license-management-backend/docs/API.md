# Issuer API contract

Shared contract between `frontend/license-management` (Angular admin panel) and
`backend/license-management-backend/src/Issuer.Api`.

- Dev URL: `http://localhost:5080`. Angular dev server (port 4201) proxies `/api` there.
- JSON uses camelCase. Dates are ISO-8601 UTC strings. Enums are strings.
- Every endpoint needs `Authorization: Bearer <jwt>` with role `LicenseAdmin`,
  except the ones marked **anonymous** or **customer**.
- Errors: RFC 7807 problem JSON `{ title, status, detail }`.

## Enums

```
EntitlementState = "Live" | "Suspended" | "Revoked" | "Expired" | "Superseded"
Tier            = "Essential" | "Professional" | "Enterprise"
HostingMode     = "Cloud" | "OnPrem" | "Split"
Inclusion       = "Included" | "AddOn" | "None"
AnalyticsLevel  = "Basic" | "Full"
ApiAccess       = "Limited" | "Full"
```

## Types

```ts
interface ModuleGrant {
  moduleKey: string;            // p360 module path, e.g. "time-attendance"
  seatLimit?: number | null;    // null = no per-module limit
  moduleValidUntil?: string | null;
  deviceKinds?: string[] | null;
}

interface Features {
  analyticsLevel: AnalyticsLevel;   // Basic = standard dashboards only (no custom builder, no AI insights)
  apiAccess: ApiAccess;             // Limited = read-only + daily call cap
  apiDailyCallLimit?: number | null;// Limited default 1000, null = unlimited
  apiReadOnly: boolean;
  maxSites?: number | null;         // Essential default 1, null = unlimited
}

interface Entitlement {
  id: string;
  subscriberCode: string;       // stable customer/install code, e.g. "ACME-7F3K2Q"
  customerName: string;
  contactEmail: string;
  revision: number;             // 1, 2, 3 … renew = new row with revision+1
  state: EntitlementState;
  tier: Tier;
  modules: ModuleGrant[];       // final list, tier pre-fill + add-ons
  features: Features;
  seatLimit: number;            // total people
  deviceLimit?: number | null;
  validFrom: string;
  validUntil: string;
  minBuild?: string | null;
  maxBuild?: string | null;
  hostingMode: HostingMode;
  hostFingerprint?: string | null;
  issuedAt: string;
  issuedBy: string;             // admin username, from JWT
  lastPingAt?: string | null;
  lastCheckinAt?: string | null;
  installKeyPrefix?: string | null;
  notes?: string | null;
  stateReason?: string | null;
}

interface EntitlementInput {   // create
  subscriberCode?: string | null; // blank = generated
  customerName: string;
  contactEmail: string;
  tier: Tier;
  modules: ModuleGrant[];
  features: Features;
  seatLimit: number;
  deviceLimit?: number | null;
  validFrom: string;
  validUntil: string;
  minBuild?: string | null;
  maxBuild?: string | null;
  hostingMode: HostingMode;
  hostFingerprint?: string | null;
  notes?: string | null;
}

interface RenewInput {          // every field optional except validUntil; omitted = copy previous
  validUntil: string;
  tier?: Tier; modules?: ModuleGrant[]; features?: Features;
  seatLimit?: number; deviceLimit?: number | null;
  hostFingerprint?: string | null; notes?: string | null;
}

interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; }

interface AuditEvent {
  id: string; who: string; action: string; entitlementId?: string | null;
  subscriberCode?: string | null; before?: unknown; after?: unknown; at: string; ip?: string | null;
}
```

## Auth (anonymous)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | `{ mfaToken, enrollRequired: boolean, otpauthUri?: string, secret?: string }` |
| POST | `/api/auth/mfa` | `{ mfaToken, code }` | `{ accessToken, expiresAt, user: { username, roles: string[] } }` |
| GET | `/api/auth/me` (admin) | – | `{ username, roles }` |

First login of a seeded admin returns `enrollRequired: true` with `otpauthUri` (show as QR) and `secret`.
The first valid code confirms enrollment. `mfaToken` lives 5 minutes. Access token lives 1 hour.

## Catalog

| GET | `/api/catalog` | → `{ modules: CatalogModule[], tiers: TierDef[] }` |
|---|---|---|

```ts
interface CatalogModule { key: string; title: string; group: string; core: boolean; }
interface TierDef { tier: Tier; title: string; inclusion: Record<string, Inclusion>; features: Features; }
```

## Entitlements

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/dashboard` | – | `{ byState: Record<state,number>, byTier: Record<tier,number>, expiringSoon: Entitlement[], recentAudit: AuditEvent[] }` |
| GET | `/api/entitlements?search=&state=&tier=&hostingMode=&page=1&pageSize=20` | – | `Paged<Entitlement>` (current revision per subscriber) |
| GET | `/api/entitlements/{id}` | – | `Entitlement` |
| GET | `/api/entitlements/history/{subscriberCode}` | – | `Entitlement[]` newest first |
| POST | `/api/entitlements` | `EntitlementInput` | `Entitlement` (201) |
| POST | `/api/entitlements/{id}/renew` | `RenewInput` | new `Entitlement` (201). Old row becomes `Superseded`. Signed file emailed to `contactEmail`. |
| POST | `/api/entitlements/{id}/suspend` | `{ reason }` | `Entitlement` |
| POST | `/api/entitlements/{id}/resume` | `{ reason }` | `Entitlement` |
| POST | `/api/entitlements/{id}/revoke` | `{ reason }` | `Entitlement` |
| GET | `/api/entitlements/{id}/file` | – | `application/octet-stream`, `<subscriberCode>-r<revision>.entl` |
| POST | `/api/entitlements/{id}/install-key` | – | `{ apiKey, keyPrefix }` raw key shown once, only hash stored |
| POST | `/api/activation/parse` | multipart `file` (.actreq) | `{ subscriberCode?, hostFingerprint, productBuild, hostname, requestedAt }` |
| GET | `/api/audit?subscriberCode=&action=&page=1&pageSize=50` | – | `Paged<AuditEvent>` |

## Customer endpoints

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/ping/{subscriberCode}` | **customer** header `X-Service-Token` | `{ build }` | `{ state, revision, latestRevision, validUntil, serverTime, receipt }` |
| POST | `/api/checkin/{subscriberCode}` | **customer** header `X-Install-Key` | `{ revision, hostFingerprint, build }` | `{ state, latestRevision, validUntil, serverTime, receipt }` |

`receipt` is a signed envelope `{ v, kid, payload, sig }` over a `CheckinReceipt`. The Enforcer stores it as
proof of contact; editing the stored check-in time breaks the signature and locks the install.
Install key (OnPrem) vs service token (Cloud/Split) is chosen by the entitlement's `hostingMode`.
