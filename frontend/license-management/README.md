# License Management — Admin Panel

Angular 22 (standalone, zoneless, signals, Reactive Forms) vendor console for issuing People360 licenses.
Talks to `backend/license-management-backend/src/Issuer.Api`. Contract: `backend/license-management-backend/docs/API.md`.

## Run

```bash
npm install
npm start            # http://localhost:4201, proxies /api -> http://localhost:5080 (proxy.conf.json)
npm run build        # dist/license-management
npx ng test --watch=false
```

## Layout

```
src/app/
  core/       models.ts (mirrors API.md), api.service, auth.service, auth.interceptor, auth.guard, format helpers
  layout/     shell (sidebar + topbar)
  shared/     badge, days-left, dialog, icon
  features/
    login/          password -> TOTP (QR enrollment on first login)
    dashboard/      counts by state/tier, expiring in 30 days, recent audit
    entitlements/   list, create (tier picker + module picker + .actreq import), detail (renew/suspend/resume/revoke, .entl download, install key)
    audit/          append-only audit log with before/after JSON
```

The route guard is UX only. All enforcement happens in the Issuer API (JWT + `LicenseAdmin` role + TOTP).
