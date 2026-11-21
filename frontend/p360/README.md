# People360 — Frontend

Angular 22 app, split into **one library per backend microservice**. All data is hardcoded for now;
each library will call its own service through the API gateway once the backend exists.

## Run

```bash
npm install
npm start                  # http://localhost:4200
npm run build              # checks library boundaries, then builds to dist/people360
npm run check:boundaries   # boundary check only
npx ng test --watch=false
```

## Layout

```
projects/
  shell/              the app: layout, sidebar, login, placeholder page, routes (merges every library)
  shared/             UI kit, icons, theme, app state, module catalog (modules.ts),
                      shared demo data (data/), shared visuals (visuals/), service contract (service.ts)
  platform-admin/     1  Administration & Configuration
  people-identity/    2  People & Identity, Contractor & Vendor
  workforce-time/     3  Time & Attendance, Shift & Workforce Scheduling, Leave & Absence
  access-visitor/     4  Physical Access Control, Visitor Management
  device-location/    5  Real-Time Location (RTLS), Device & Edge Management        (add-on)
  safety-ops/         6  Emergency & Mustering, Safety & Wellbeing, Patrol & Guard
  workplace-ops/      7  Tasks, Meal & Canteen, Workplace & Facility, Training & Compliance
  automation/         8  Workflow & Automation, Integrations & API Hub
  analytics-reports/  9  Command Center, Reports & Analytics, Customer & Visitor Analytics
  digital-twin/       10 Digital Twin & Spatial Intelligence                          (add-on)
  ai/                 11 AI & People Intelligence                                     (add-on)
  licensing/          12 Licensing & Billing: LicenseService, license guard, "not licensed" page
```

Each service library has `src/index.ts` exporting:

- `SERVICE` — key, title, gateway prefix (`/api/<service>`) and the module paths it owns
- `PAGES` — lazy page loaders, key `module-path/submodule-path`

The shell merges all `PAGES` into routes. A submodule without a page shows the placeholder page.

Import aliases: `@p360/shared/<file>`, `@p360/licensing`, `@p360/<service>` (see `tsconfig.json`).

## Boundary rules (enforced by `tools/check-boundaries.mjs`)

- A service library imports only itself, `@p360/shared` and `@p360/licensing`.
- `shared` imports nothing but itself.
- Only `shell` imports service libraries.
- Relative imports never leave their library.

Data another service owns (for example the people list used by attendance and access) lives in
`shared/src/data` for now. Once the backend exists, read it from the owning service through the gateway instead.

## Licensing

`LicenseService` (in `licensing/`) holds the subscription: plan + add-ons. It's hardcoded and kept in
localStorage (`p360.license`). Add-on modules that aren't licensed are dimmed with a lock in the sidebar,
and their routes redirect to `/not-licensed`. Change the plan or add-ons under
Administration → Subscription & Licensing. Later it will load from `/api/licensing` through the gateway.
The route guard only affects the UI; the gateway must do the real check.

## Adding a page

1. Create the component in the owning library, e.g. `projects/workforce-time/src/leave/my-page.ts`.
2. Add it to that library's `PAGES` in `src/index.ts`, under its `module-path/submodule-path` key.

## Theme colors

`python3 tools/themify.py projects` converts raw hex colors into theme variables and regenerates
`projects/shell/src/theme-palette.scss`.
