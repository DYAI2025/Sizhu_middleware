# Admin Route Protection Inventory

All routes are gated by `apiGuard` (`server/middleware/auth.ts`), mounted once on
`/api`. Classification is **default-deny**: any route that is not explicitly
public or sensitive still requires a valid session. New routes are therefore
protected automatically — a route can never become public by accident.

## Public (no auth)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Liveness probe. Always 200. |
| GET | `/` | SPA entry (static). |
| GET | `/assets/*` | Built static assets. |
| GET | `/login` | SPA route (served by static/SPA fallback). |
| GET | `/auth/callback` | Supabase OAuth/magic-link landing (SPA). |

`apiGuard` is mounted only on `/api`, so static and SPA paths are never gated by
the API auth layer.

## Protected reads (valid Supabase session required)

Requires a valid token **and** a verified email. No role/MFA escalation.

| Method | Path |
| --- | --- |
| GET | `/api/readiness` |
| GET | `/api/config/*` |
| GET | `/api/secret-references/status` |
| GET | `/api/gateway-issues` |
| GET | `/api/workflows/*` |
| GET | `/api/fulfillment/readiness` |

## Sensitive (session + verified email + admin role + MFA `aal2`)

Requires a valid session, verified email, an admin-capable role
(`owner`/`admin`/`operator`), and `aal2` when
`MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true`.

| Method | Path | Capability |
| --- | --- | --- |
| POST | `/api/data-requests/fufire/test-run` | FuFire calls |
| POST | `/api/fufire/*` | FuFire proxy |
| POST | `/api/model-gateway/*` | OpenRouter / model gateway calls |
| POST | `/api/workflows/:id/generate` | Generation |
| POST | `/api/workflows/:id/quality-gate-1` | Quality gate |
| POST | `/api/workflows/:id/quality-gate-2` | Quality gate |
| POST | `/api/workflows/:id/approve-final-artifact` | Final approval |
| POST | `/api/fulfillment/pod/dispatch` | Gelato / POD dispatch |
| POST | `/api/config/*` | Provider / config writes |
| POST | `/api/secret-references/check` | Secret checks |

Anything else under `/api/*` falls through to the **session** class (login
required) by default.

## Enforcement order

1. `/api/health` is registered before `apiGuard` → stays public.
2. `apiGuard` runs for every other `/api` request:
   - `public` → allow.
   - `AUTH_REQUIRED!=true` → attach context best-effort, allow (dev escape hatch).
   - otherwise → `authenticateRequest` (401 `AUTH_REQUIRED` / 401
     `INVALID_AUTH_TOKEN` / 403 `EMAIL_VERIFICATION_REQUIRED`).
   - `sensitive` → also `checkAdminRole` (403 `ADMIN_ROLE_REQUIRED`) and
     `checkMfa` (403 `MFA_REQUIRED_FOR_ACTION`).

## Standalone middleware

`apiGuard` is the single source of truth, but the same checks are exported as
composable Express middleware for any future per-route wiring:

- `server/middleware/requireAuth.ts` — valid session + verified email.
- `server/middleware/requireRole.ts` — admin-capable role.
- `server/middleware/requireMfa.ts` — `aal2` when MFA is required.

## Automated route-security tests

`server/tests/auth.routes.test.ts` (supertest) covers:

- `/api/health` is public and returns 200.
- Static asset paths are not gated by the API auth layer.
- `/api/readiness` rejects unauthenticated requests when `AUTH_REQUIRED=true`.
- FuFire test-run: rejects unauthenticated, non-admin, admin `aal1` (MFA),
  unverified email; allows admin `aal2`.
- Gelato/POD dispatch: requires auth, role and MFA.
- Missing `Authorization` → `AUTH_REQUIRED`.
- Invalid / wrong-secret token → `INVALID_AUTH_TOKEN`.
- Non-allowlisted email → `ADMIN_ROLE_REQUIRED`.
- Unknown `/api` route still requires a session (default-deny).
- Responses never contain the JWT secret or service-role key.
- Flag behavior: `AUTH_REQUIRED=false` and
  `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=false`.

`src/tests/auth.frontend.test.ts` asserts no frontend auth file references a
service-role key or the JWT secret, and that the Supabase client uses only the
public anon key.

## Railway environment variable checklist

Set these on the Railway service (Variables tab). Server-only secrets must
**not** use a `VITE_` prefix.

Server (private):
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- [ ] `SUPABASE_JWT_SECRET` (server-only; HS256 token verification)
- [ ] `AUTH_REQUIRED=true`
- [ ] `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true`
- [ ] `ADMIN_EMAIL_ALLOWLIST=you@example.com`

Frontend (public, `VITE_`-prefixed, built into the bundle):
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_ADMIN_EMAIL_ALLOWLIST` (display only)

After setting variables, redeploy so the Vite build picks up the `VITE_*`
values.
