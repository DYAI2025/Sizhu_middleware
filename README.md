# Sizhu Middleware

Express/Vite middleware for the SIZHU/Bazodiac/FuFire integration layer. The app exposes protected admin endpoints for FuFire data requests, prompt-variable interpretation, configuration/readiness checks, and a guarded POD/Gelato fulfillment boundary.

> Status: live-operation candidate, not production-complete. FuFire data requests are wired behind auth and readiness checks. POD dispatch is intentionally blocked at the safe adapter boundary until the Gelato order-creation contract is implemented.

## What this service does

- Serves a React/Vite frontend and an Express API from one Node service.
- Provides public health probing via `GET /api/health`.
- Protects all other `/api/*` routes with a default-deny auth guard.
- Verifies Supabase-style HS256 access tokens using `SUPABASE_JWT_SECRET`.
- Restricts sensitive routes to allowlisted admin/operator users and MFA `aal2` by default.
- Executes FuFire test runs through server-owned operation names only.
- Blocks client-controlled outbound URL/header/secret steering fields.
- Resolves FuFire prompt variables only from real upstream response bodies; unresolved values are flagged instead of guessed.
- Exposes POD/Gelato readiness and dispatch endpoints, but real dispatch currently returns `MISSING_POD_CONTRACT` unless mock/demo mode is active.

## Tech stack

- Node.js + TypeScript
- Express 4
- Vite 6
- React 19
- Vitest + Supertest
- Stryker mutation testing
- Supabase JWT compatibility
- FuFire upstream API integration
- POD/Gelato integration boundary

## Repository structure

```text
.
├── package.json
├── vite.config.ts
├── tsconfig.json
├── server/
│   ├── index.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── lib/
│   │   └── jwt.ts
│   ├── services/
│   │   ├── authUserService.ts
│   │   ├── fufireDataService.ts
│   │   ├── fufireOperations.ts
│   │   ├── fufireRequestBuilders.ts
│   │   ├── fufireResponseInterpreter.ts
│   │   └── podDispatchService.ts
│   └── tests/
└── src/
    └── lib/
        ├── apiConnections/
        │   ├── dataRequestConfig.ts
        │   ├── fulfillmentConfig.ts
        │   └── types.ts
        └── app/
            └── appMode.ts
```

## Prerequisites

- Node.js 22 LTS or compatible modern Node runtime
- npm
- A Supabase project or compatible HS256 JWT issuer
- FuFire API base URL and API key
- For production: HTTPS reverse proxy/platform such as Railway, Render, Fly.io, or equivalent

## Installation

```bash
git clone https://github.com/DYAI2025/Sizhu_middleware.git
cd Sizhu_middleware
npm install
```

## Environment configuration

Create a local `.env` file for server runtime configuration.

```bash
cp .env.example .env
```

If `.env.example` does not exist yet, create `.env` manually from this template:

```env
# Runtime
NODE_ENV=development
PORT=3000
APP_MODE=CONFIG_REQUIRED
VITE_APP_MODE=CONFIG_REQUIRED

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Auth / Supabase
AUTH_REQUIRED=true
MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=replace-with-your-supabase-jwt-secret
ADMIN_EMAIL_ALLOWLIST=admin@example.com

# Readiness secret-reference pattern
SUPABASE_SERVICE_ROLE_SECRET_REF=SECRET_REF_SUPABASE_SERVICE_ROLE
SECRET_REF_SUPABASE_SERVICE_ROLE=replace-with-service-role-key-if-needed

# FuFire
FUFIRE_BASE_URL=https://api.fufire.space
FUFIRE_AUTH_HEADER_NAME=X-API-Key
FUFIRE_API_KEY_SECRET_REF=SECRET_REF_FUFIRE_API_KEY
SECRET_REF_FUFIRE_API_KEY=replace-with-fufire-api-key
FUFIRE_TIMEOUT_MS=15000
FUFIRE_RETRY_COUNT=1

# POD / Gelato boundary
POD_ENABLED=false
POD_DISPATCH_MODE=disabled
POD_BASE_URL=https://api.gelato.com
SECRET_REF_GELATO_API_KEY=replace-only-when-real-adapter-contract-exists
```

### Important environment notes

1. `AUTH_REQUIRED` defaults effectively to `true`. Do not set it to `false` outside local development.
2. `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS` defaults effectively to `true`. Keep it enabled for live admin operations.
3. `APP_MODE` defaults to `DEMO_LOCAL` when unset. For any live environment, set it explicitly to `CONFIG_REQUIRED`, `SUPABASE_READY`, or `PRODUCTION`.
4. `FUFIRE_BASE_URL` must be explicitly set for readiness, even though the code has a default base URL.
5. FuFire and Supabase service keys are read through secret-reference environment variables. Example: `FUFIRE_API_KEY_SECRET_REF=SECRET_REF_FUFIRE_API_KEY` means the actual key must be in `SECRET_REF_FUFIRE_API_KEY`.
6. POD/Gelato dispatch is not production-ready until the missing order-creation contract is implemented.

## Local development

```bash
npm run dev
```

Default development entrypoint:

```text
tsx server/index.ts
```

Open:

```text
http://localhost:3000
```

The server listens on `0.0.0.0` and reads `PORT` from the environment.

## Build

```bash
npm run build
```

The build command performs two steps:

```bash
vite build
esbuild server/index.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs
```

## Production start

```bash
NODE_ENV=production npm start
```

Production start runs:

```bash
node dist/server.cjs
```

In production mode, Express serves static files from `dist/` and falls back to `dist/index.html` for SPA routes.

## Health and readiness

### Public health

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{ "status": "ok" }
```

### Protected readiness

`GET /api/readiness` requires a valid bearer token unless `AUTH_REQUIRED=false`.

```bash
curl \
  -H "Authorization: Bearer <supabase-access-token>" \
  http://localhost:3000/api/readiness
```

Expected live-ready response:

```json
{ "status": "READY" }
```

If configuration is incomplete, the endpoint returns HTTP 503:

```json
{
  "status": "NOT_READY",
  "missing": ["SECRET_REF_FUFIRE_API_KEY", "SECRET_REF_SUPABASE_SERVICE_ROLE", "FUFIRE_BASE_URL", "SUPABASE_URL"]
}
```

## API overview

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Public liveness probe |

### Protected read routes

Require a valid authenticated session.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/readiness` | Checks minimum live configuration |
| GET | `/api/config/*` | Returns non-secret config snapshot |
| GET | `/api/secret-references/status` | Reports whether configured secret refs are present, without exposing values |
| GET | `/api/gateway-issues` | Currently returns an empty issue list |
| GET | `/api/workflows/*` | Currently returns an empty workflow list |
| GET | `/api/fulfillment/readiness` | Checks POD dispatch readiness |

### Sensitive routes

Require valid session, verified email, allowlisted admin/operator role, and MFA `aal2` unless MFA is disabled.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/data-requests/fufire/test-run` | Executes allowed FuFire test-run operations |
| POST | `/api/fulfillment/pod/validate-dispatch` | Validates dispatch input shape |
| POST | `/api/fulfillment/pod/dispatch` | POD dispatch boundary; real dispatch not implemented yet |
| POST | `/api/secret-references/check` | Checks one secret ref presence without returning the secret |

## FuFire test-run example

```bash
curl -X POST http://localhost:3000/api/data-requests/fufire/test-run \
  -H "Authorization: Bearer <supabase-admin-aal2-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "birthDate": "1990-01-01",
    "birthTime": "12:30",
    "birthTimeKnown": true,
    "manualLat": 52.52,
    "manualLon": 13.405,
    "manualTimezone": "Europe/Berlin",
    "requestedOperations": ["bazi", "wuxing", "fusion"],
    "locale": "de"
  }'
```

Allowed FuFire operations:

```text
chronometry, bazi, baziTrace, wuxing, fusion
```

Disallowed operations return `FUFIRE_OPERATION_NOT_ALLOWED` and are not dispatched.

## Security model

The middleware is default-deny for `/api/*`:

- `/api/health` is public.
- All other API routes require a valid bearer token by default.
- Sensitive routes additionally require:
  - verified email,
  - allowlisted admin/operator role,
  - MFA `aal2` when enabled.

Admin role resolution currently uses:

```env
ADMIN_EMAIL_ALLOWLIST=admin@example.com,operator@example.com
```

This is acceptable for a small MVP, but should be migrated to a database-backed role table before broader live operation.

## Testing

Run all tests:

```bash
npm test
```

Type-check / lint:

```bash
npm run lint
```

Mutation testing:

```bash
npm run test:mutation
```

Live smoke scripts:

```bash
npm run smoke:fufire
npm run probe:fufire-location
npm run smoke:openrouter
```

Only run live smoke tests when the required credentials and upstream endpoints are configured.

## Deployment guide

### Generic Node host

1. Set all production environment variables in the host secret manager.
2. Set `NODE_ENV=production`.
3. Set `APP_MODE=CONFIG_REQUIRED`, `SUPABASE_READY`, or `PRODUCTION` explicitly.
4. Set `PORT` according to the platform requirement.
5. Run the build command:

   ```bash
   npm run build
   ```

6. Start the server:

   ```bash
   npm start
   ```

7. Verify public health:

   ```bash
   curl https://your-domain.example/api/health
   ```

8. Verify protected readiness with a valid token:

   ```bash
   curl -H "Authorization: Bearer <token>" https://your-domain.example/api/readiness
   ```

### Railway-oriented setup

Railway usually detects Node projects automatically. Use:

```text
Build Command: npm run build
Start Command: npm start
```

Required Railway variables:

```env
NODE_ENV=production
PORT=${{PORT}}
APP_MODE=CONFIG_REQUIRED
AUTH_REQUIRED=true
MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true
ALLOWED_ORIGINS=https://your-public-domain.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=...
SUPABASE_SERVICE_ROLE_SECRET_REF=SECRET_REF_SUPABASE_SERVICE_ROLE
SECRET_REF_SUPABASE_SERVICE_ROLE=...
ADMIN_EMAIL_ALLOWLIST=admin@example.com
FUFIRE_BASE_URL=https://api.fufire.space
FUFIRE_API_KEY_SECRET_REF=SECRET_REF_FUFIRE_API_KEY
SECRET_REF_FUFIRE_API_KEY=...
POD_ENABLED=false
POD_DISPATCH_MODE=disabled
```

After deploy:

```bash
curl https://your-railway-domain.up.railway.app/api/health
curl -H "Authorization: Bearer <token>" https://your-railway-domain.up.railway.app/api/readiness
```

## Live-operation checklist

Before calling the service live-ready, verify:

- [ ] `npm install` completes cleanly.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `NODE_ENV=production npm start` starts `dist/server.cjs` successfully.
- [ ] `/api/health` returns HTTP 200.
- [ ] `/api/readiness` returns `READY` with a real authenticated token.
- [ ] Unauthorized `/api/readiness` returns `AUTH_REQUIRED`.
- [ ] Non-admin sensitive requests return `ADMIN_ROLE_REQUIRED`.
- [ ] Admin without MFA returns `MFA_REQUIRED_FOR_ACTION` when MFA is enabled.
- [ ] FuFire test-run works against the real upstream API with a known safe test payload.
- [ ] No secret value appears in API responses or logs.
- [ ] `APP_MODE` is not left unset in production.
- [ ] POD/Gelato remains disabled unless the real order contract is implemented and tested.

## Known live-operation gaps

1. **No committed deployment manifest detected**
   - Add `railway.json`, `Dockerfile`, or equivalent platform config if deterministic deploy behavior is required.

2. **POD/Gelato real dispatch is intentionally incomplete**
   - `MISSING_POD_CONTRACT` is the correct safe result until the real order schema and adapter are implemented.

3. **Admin role model is allowlist-based**
   - Move to a persistent role/permission table before multi-admin production use.

4. **Runtime evidence is required**
   - Repository tests are valuable, but production readiness still requires real build/start/readiness/smoke evidence from the target host.

## Troubleshooting

### `/api/readiness` returns `NOT_READY`

Check that these are set:

```env
SUPABASE_URL
FUFIRE_BASE_URL
SECRET_REF_FUFIRE_API_KEY
SECRET_REF_SUPABASE_SERVICE_ROLE
```

Also verify that `FUFIRE_API_KEY_SECRET_REF` and `SUPABASE_SERVICE_ROLE_SECRET_REF` point to the correct secret-ref variable names.

### All protected routes return `INVALID_AUTH_TOKEN`

Check:

```env
SUPABASE_JWT_SECRET
```

The token must be signed with the same HS256 secret expected by the server.

### Sensitive route returns `ADMIN_ROLE_REQUIRED`

Add the user's email to:

```env
ADMIN_EMAIL_ALLOWLIST=user@example.com
```

### Sensitive route returns `MFA_REQUIRED_FOR_ACTION`

Use a token with `aal=aal2` or disable MFA only in local development:

```env
MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=false
```

### FuFire request returns `NO_GEOCODER_CONFIGURED`

The current implementation has no geocoder. Provide both manual coordinates and, for chronometry, manual timezone:

```json
{
  "manualLat": 52.52,
  "manualLon": 13.405,
  "manualTimezone": "Europe/Berlin"
}
```

### POD dispatch returns `MISSING_POD_CONTRACT`

This is expected. The real Gelato order-creation adapter is not implemented yet. Do not treat this as a deploy failure unless real POD dispatch is part of the release scope.

## Production safety warning

Do not set these in production:

```env
AUTH_REQUIRED=false
MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=false
APP_MODE=DEMO_LOCAL
POD_DISPATCH_MODE=order
```

`POD_DISPATCH_MODE=order` should only be enabled after the real Gelato contract, idempotency behavior, request sanitization, and real-boundary smoke tests are complete.
