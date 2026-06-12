# Railway Deployment Guide

This guide provides instructions to deploy this full-stack Vite & Express service to Railway.

## Custom Domain Target
The intended public domain is: `sizhu.fufire.space`

## Environment Variables

Configure these variables in your Railway project to ensure exact production settings:

```
APP_MODE=CONFIG_REQUIRED
PUBLIC_APP_BASE_URL=https://sizhu.fufire.space
ALLOWED_ORIGINS=https://sizhu.fufire.space,http://localhost:5173,http://localhost:3000
FUFIRE_BASE_URL=https://api.fufire.space
FUFIRE_API_KEY_SECRET_REF=SECRET_REF_FUFIRE_API_KEY
FUFIRE_AUTH_HEADER_NAME=X-API-Key
FUFIRE_TIMEOUT_MS=15000
FUFIRE_RETRY_COUNT=1
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_SECRET_REF=SECRET_REF_SUPABASE_SERVICE_ROLE
RAILWAY_PUBLIC_DOMAIN=sizhu.fufire.space
GEMINI_API_KEY=your_gemini_key
APP_URL=https://sizhu.fufire.space
```

### Secret Handling Rules
- Database credentials and Third-party API keys (like `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_SECRET_REF`) must never be exposed or prefixed with `VITE_`.
- Update your Railway specific environment variables in the variables tab and NEVER commit them via `.env`.

## Build and Start Commands

Railway automatically detects `package.json` scripts:

- **Build Command**: `npm run build`
  - Runs `vite build` followed by `esbuild` to compile `server/index.ts`.
- **Start Command**: `npm run start`
  - Runs `node dist/server.cjs`.

## Expected Port Behavior
Railway automatically injects the `PORT` environment variable. Our Express app binds to `process.env.PORT || 3000`. You do not need to expose ports manually.

## Health and Readiness URLs
Configure Railway Healthchecks to use the following paths to ensure zero-downtime routing:

- **Health Check URL**: `https://sizhu.fufire.space/api/health`
  - Validates basic Express container liveness.
- **Readiness URL**: `https://sizhu.fufire.space/api/readiness`
  - Prevents traffic routing until the server confirms the presence of essential secrets (`FUFIRE_API_KEY_SECRET_REF`, `SUPABASE_SERVICE_ROLE_SECRET_REF`).

## DNS Setup Checklist
Use this manual checklist to configure your custom domain:

- [ ] Obtain the Railway provided `CNAME` assigned to your environment (e.g. `example.up.railway.app`).
- [ ] Go to your DNS provider for the `fufire.space` domain.
- [ ] Add a `CNAME` record targeting `sizhu` mapped to the Railway host URL.
- [ ] Verify TLS/SSL certificate generation in the Railway networking settings.
- [ ] Wait for propagation before assuming the domain is active.

## Rollback Notes
If a deployment fails the readiness check, the instance will be marked unhealthy. Railway will continue routing traffic to the previously healthy deployment.
Check the Railway logs to identify missing secrets or start command failures if rollback occurs repeatedly.
