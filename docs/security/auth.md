# Authentication & Authorization

Iteration 8 adds a real server-side authentication and authorization layer in
front of the SIZHU admin console (`https://sizhu.fufire.space`). Authentication
is backed by **Supabase Auth**; authorization (admin role + MFA) is enforced by
Express middleware on the server. The React UI mirrors this state but is **not**
the security boundary.

## TL;DR

- Login uses Supabase Auth (email + password, magic link, or sign-up).
- A **verified email** is required before any admin access.
- **MFA (TOTP)** is required for sensitive actions when
  `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true`.
- Every `/api/*` route is protected by default. Only `/api/health` and static
  assets are public.
- The frontend only ever uses the **public anon key**. The service-role key and
  JWT secret are **server-only**.

## How a request is authorized

```
Authorization: Bearer <supabase_access_token>
        │
        ▼
  apiGuard (server/middleware/auth.ts)  ── mounted on /api
        │
        ├─ classifyApiRoute(method, path) → public | session | sensitive
        │
        ├─ public     → allow
        │
        ├─ session    → requireAuth (valid token + verified email)
        │
        └─ sensitive  → requireAuth + requireRole(admin) + requireMfa(aal2)
```

The token is verified locally (HS256) using `SUPABASE_JWT_SECRET`
(`server/lib/jwt.ts`) — no network round-trip and no service-role key required.
The verified claims are mapped to an `AuthUser`
(`server/services/authUserService.ts`):

| Claim source | Field | Meaning |
| --- | --- | --- |
| `sub` | `sub` | Supabase user id |
| `email` | `email` | user email |
| `email_confirmed_at` / `user_metadata.email_verified` | `emailVerified` | verified-email indicator |
| `aal` | `aal` | `aal1` (password only) or `aal2` (MFA satisfied) |
| `ADMIN_EMAIL_ALLOWLIST` | `role` | `owner` if allowlisted, else `null` |

## Error responses

| Condition | HTTP | `error_code` |
| --- | --- | --- |
| Missing `Authorization` header | 401 | `AUTH_REQUIRED` |
| Malformed / expired / wrong-secret token | 401 | `INVALID_AUTH_TOKEN` |
| Verified token, unconfirmed email | 403 | `EMAIL_VERIFICATION_REQUIRED` |
| Authenticated, not an admin | 403 | `ADMIN_ROLE_REQUIRED` |
| Admin at `aal1` on a sensitive route (MFA on) | 403 | `MFA_REQUIRED_FOR_ACTION` |

Example bodies:

```json
{ "status": "UNAUTHORIZED", "color": "red",  "error_code": "AUTH_REQUIRED",          "message": "Login required." }
{ "status": "MFA_REQUIRED", "color": "blue", "error_code": "MFA_REQUIRED_FOR_ACTION", "message": "This action requires a verified second factor." }
{ "status": "FORBIDDEN",    "color": "red",  "error_code": "ADMIN_ROLE_REQUIRED",     "message": "Admin role required." }
```

## Where Supabase keys live

| Key | Where it lives | Frontend-visible? |
| --- | --- | --- |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | client + server | **Yes** (public, safe) |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | client + server | **Yes** (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **No — never** |
| `SUPABASE_JWT_SECRET` | server only | **No — never** |

Only variables prefixed with `VITE_` are bundled into the browser app. The
service-role key and JWT secret must never receive a `VITE_` prefix.

## Feature flags

| Variable | Default | Effect |
| --- | --- | --- |
| `AUTH_REQUIRED` | `true` (fail-closed) | When `true`, all non-public `/api` routes require a valid session. |
| `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS` | `true` | When `true`, sensitive routes require `aal2`. |

## Adding the first admin

1. Set `ADMIN_EMAIL_ALLOWLIST=you@example.com` on the server (Railway).
2. Optionally set `VITE_ADMIN_EMAIL_ALLOWLIST=you@example.com` so the UI shows
   the expected role (display only).
3. Sign up / log in with that email through the login screen.
4. Verify your email.
5. Enroll TOTP MFA (see [`mfa.md`](./mfa.md)).

Any email **not** in the allowlist authenticates but receives no admin role and
is rejected with `ADMIN_ROLE_REQUIRED` on sensitive routes.

### Future migration path

The allowlist is the MVP. The same `resolveRole()` surface can later be backed
by an `admin_users` table with roles `owner | admin | operator | viewer` without
changing any middleware or route wiring.

## Testing

See [`admin-routes.md`](./admin-routes.md) for the full route inventory and the
automated route-security tests (`server/tests/auth.routes.test.ts`).
