# Multi-Factor Authentication (MFA / 2FA)

The SIZHU admin console uses **Supabase Auth MFA** with **TOTP** (authenticator
apps such as Google Authenticator, 1Password, Authy). MFA raises the session's
Authenticator Assurance Level (AAL) from `aal1` (password only) to `aal2`
(second factor verified). Sensitive backend actions require `aal2` when
`MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true`.

## Concepts

| Term | Meaning |
| --- | --- |
| `aal1` | Authenticated with one factor (password / magic link). |
| `aal2` | A verified second factor was presented this session. |
| Factor | An enrolled authenticator (TOTP). A user may have several. |
| Enroll | Register a new TOTP factor (scan QR, verify a code). |
| Challenge | Present a code to step a session up to `aal2`. |

## Frontend flow

All MFA UI lives in `src/components/auth/` and talks to Supabase via
`src/lib/auth/authState.ts` (which only uses the public anon key).

### 1. Enroll (`MfaSetupView.tsx`)
- `enrollTotp()` → `supabase.auth.mfa.enroll({ factorType: 'totp' })`.
- The view renders the returned **QR code** and **secret**.
- The user scans it and enters a 6-digit code.
- `verifyTotpEnrollment()` → `mfa.challengeAndVerify()` confirms and activates
  the factor; the session steps up toward `aal2`.

### 2. Challenge / step-up (`MfaChallengeView.tsx`)
- Shown when a logged-in admin is at `aal1` but already has a verified factor.
- `challengeTotp()` → `mfa.challengeAndVerify()` raises the session to `aal2`.

### 3. Manage (`AccountSecurityView.tsx` — the Admin Security panel)
- Lists factors (`mfa.listFactors()`).
- Enroll an additional TOTP factor.
- **Unenroll** a factor only **after** a fresh MFA confirmation
  (`mfa.challengeAndVerify()` then `mfa.unenroll()`).
- Shows live auth state: logged in, email verified, role, AAL, MFA enrolled.

`ProtectedRoute.tsx` orchestrates which screen is shown:

```
not ready            → spinner
supabase unconfigured→ render app (demo; APIs still gated server-side)
not logged in        → LoginView
email not verified   → LoginView (EMAIL_VERIFICATION_REQUIRED)
aal1 + has factor    → MfaChallengeView
aal1 + no factor     → MfaSetupView
otherwise            → app
```

## Server-side enforcement

The frontend cannot grant access. The server independently checks the `aal`
claim in the verified JWT:

- `server/middleware/requireMfa.ts` (and the `checkMfa` used by `apiGuard`)
  rejects sensitive requests with **403 `MFA_REQUIRED_FOR_ACTION`** unless
  `aal === "aal2"`, whenever `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true`.

This means even a hand-crafted request with a valid `aal1` token cannot perform
FuFire/OpenRouter/provider/secret/POD actions.

## Which actions require MFA

See [`admin-routes.md`](./admin-routes.md). In short: FuFire test-run, model
gateway / OpenRouter calls, workflow generate / quality gates / final approval,
POD dispatch, config writes, and secret-reference checks.

## Testing MFA locally

1. Configure Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_JWT_SECRET`) and enable TOTP in the Supabase dashboard
   (Authentication → Providers → MFA).
2. Set `ADMIN_EMAIL_ALLOWLIST` to your email and `VITE_*` equivalents.
3. Log in, verify email, open **Admin Security**, enroll TOTP.
4. Sign out and back in: you should be challenged for the 6-digit code before
   sensitive actions succeed.

Automated server tests assert the policy without a live Supabase project by
minting signed test tokens (`server/tests/auth.routes.test.ts`):
- admin `aal1` → `MFA_REQUIRED_FOR_ACTION`
- admin `aal2` → allowed
- with `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=false`, admin `aal1` is allowed.
