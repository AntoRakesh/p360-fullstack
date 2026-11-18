# Frontend

Two independent Angular apps, each with its own `package.json` and `node_modules`.

```
frontend/
├── p360/                 People360 app
└── license-management/   License Management app
```

## Run

```bash
# People360
cd p360 && npm install && npm start                      # http://localhost:4200

# License Management (different port so both can run together)
cd license-management && npm install && npm start -- --port 4201   # http://localhost:4201
```

## Build

```bash
cd p360 && npm run build                 # p360/dist/
cd license-management && npm run build   # license-management/dist/
```
