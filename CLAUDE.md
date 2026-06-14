# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Sizhu API" (internal codename **Bazzi Middleware Console**) — an admin console for running automated, astrology-personalized print-on-demand (POD) workflows for Etsy/Eatsy shops. A workflow takes customer birth data, resolves Chinese-metaphysics personalization (BaZi / Wuxing / zodiac) via the **FuFire** API, generates a swarm of candidate images, screens them through an LLM **quality gate**, and dispatches an accepted artifact to a POD provider (**Gelato**). Deployed on Railway at `sizhu.fufire.space`.

## Commands

```bash
npm run dev      # tsx server/index.ts — see "single-server model" below. NOT `vite`.
npm run build    # vite build (client → dist/) + esbuild bundles server → dist/server.cjs
npm run start    # node dist/server.cjs (production: Express serves static dist/ + /api)
npm run lint     # tsc --noEmit (type-check only; there is no ESLint despite eslint-disable comments)
npm run test     # vitest run

# single test file / by name:
npx vitest run server/tests/auth.routes.test.ts
npx vitest run -t "rejects admin users at aal1"
```

There is no `vitest.config`; defaults apply. Tests live in `src/tests/` (frontend) and `server/tests/` (API).

## Single-server model (non-obvious)

There is **one** Express server for both dev and prod — Vite is never run standalone.
`server/index.ts` → `startServer()` mounts Vite as **middleware** (`middlewareMode`, SPA) in dev, or serves the built `dist/` statically in prod, and in both cases mounts the `/api` routes. So `npm run dev` gives you HMR *and* the real API on a single port (`PORT`, default 3000 dev / 8080 in `createApp`).

`createApp()` is exported separately and is import-safe: `startServer()` only runs when `process.env.VITEST !== "true"`, so tests import `createApp` and drive it with supertest without binding a port.

## Architecture

### Mode-switched data layer
`getAppMode()` (`src/lib/app/appMode.ts`) reads `VITE_APP_MODE` / `APP_MODE` → one of `DEMO_LOCAL | CONFIG_REQUIRED | SUPABASE_READY | PRODUCTION`, defaulting to **`DEMO_LOCAL`**.

`src/lib/app/appServices.ts` is the single facade everything goes through. Its getters return, **per mode**:
- `DEMO_LOCAL`: `Local*` repositories (localStorage-backed) + a client-side `WorkflowRunner` wired to `Mock*` providers. The entire generate → QA → escalate → POD pipeline runs **in the browser** against mocks; nothing touches Supabase or the network.
- anything else: `Supabase*` repositories — currently in `supabaseRepository.stub.ts` and the runner stub, which **throw "Supabase integration is offline"**.

Bringing up a real backend = implement `src/lib/repositories/supabaseRepository.stub.ts` against the contracts in `repositories/interfaces.ts`. `supabase-schema.sql` holds the Postgres + RLS schema (roles, permissions, RLS policies) for that path.

### Workflow engine (`src/lib/workflow/`)
`WorkflowRunner.run()` is the pipeline core and uses constructor **dependency injection** for all repos + providers — swap behavior by implementing `providers/interfaces.ts` and `repositories/interfaces.ts`, not by editing the runner. Flow: personalization lookup → iteration loop (generate candidates → QA score; on failure retry with the *fallback* provider/model) up to `maxRejectedBeforeEscalation`. On an accepted candidate the run goes to `pod_ready` and **stops — there is no auto-dispatch**; `dispatchManualApproval()` is the explicit POD trigger. On exhaustion it goes to `escalated` (email via `EscalationService`). `WorkflowStateMachine` enforces terminal states and `assertDispatchAllowed()` blocks POD submission unless the artifact is QA-`accepted` or human-approved.

### Type homes (watch this)
Types come from two places that both funnel through `src/lib/domain/models.ts` (a re-export barrel):
- `src/types.ts` — UI/runtime types (`WorkflowRun`, `ImageArtifact`, `PromptTemplate`, the `*Config` types, RBAC types).
- `src/lib/domain/types.ts` — the "db-mapped entities" reference; note it aliases `Product = ShopProduct` and `Role = AppRole`.

Imports across the codebase mix `'@/types'`-style and `'../domain/models'`. When adding/changing a field, find which home owns the type first. `src/mockStorage.ts` is marked **LEGACY — do not import in UI**.

## Security model (server) — most important to get right

All authn/authz is enforced **server-side**; the React `ProtectedRoute` + `authState` only mirror it for UX and are **not** a security boundary.

- `app.use("/api", apiGuard)` is a **single default-deny gate** mounted before every API route (`server/middleware/auth.ts`). `/api/health` is registered *before* it and stays public.
- `classifyApiRoute()` buckets each request into `public | session | sensitive`. **The default is `session`**, so any new or unlisted `/api/*` route requires a valid session automatically (there's a test asserting this). `sensitive` routes are an explicit regex allowlist in `SENSITIVE_API_ROUTES` — **adding a new privileged endpoint means adding its pattern there**, or it will only get session-level protection.
  - `session` = valid token + verified email.
  - `sensitive` = session + admin role (`owner`/`admin`/`operator`) + MFA (`aal2`).
- Tokens are **Supabase access tokens verified locally** (dependency-free HS256 in `server/lib/jwt.ts`, rejects any alg ≠ HS256 including `none`, uses `timingSafeEqual`) against `SUPABASE_JWT_SECRET`. No network round-trip, no service-role key needed to verify. `authUserService.verifyAccessToken()` maps claims → `AuthUser`; role is resolved from `ADMIN_EMAIL_ALLOWLIST` (allowlisted email → `owner`, else `null`).
- Feature flags `AUTH_REQUIRED` and `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS` are read **at request time, not import time** (so tests toggle them via env). Both **fail closed** (default `true`).
- Standalone `requireAuth` / `requireRole` / `requireMfa` middlewares exist for composition, but live wiring uses the one `apiGuard`.
- **Key hygiene (enforced by tests):** the frontend uses *only* the public anon key. Variables are bundled into the browser only with the `VITE_` prefix, so `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` must **never** get a `VITE_` prefix. `server/tests/auth.routes.test.ts` asserts no secret value appears in any API response and guards every route class against auth/role/MFA regressions — treat it as the canonical security spec.

### Secret-reference indirection
Provider configs never hold API keys. They store a **secret reference name** (e.g. `SECRET_REF_FUFIRE_API_KEY`) and code reads `process.env[secretRef]`. Status endpoints report `present: boolean` for a ref and never echo the value.

## Deployment (Railway)

Build `npm run build`, start `npm run start`; binds `0.0.0.0:$PORT`. Health check `/api/health` (liveness). Readiness `/api/readiness` returns `503 NOT_READY` until required secrets (`FUFIRE_API_KEY_SECRET_REF`, `SUPABASE_SERVICE_ROLE_SECRET_REF`, `FUFIRE_BASE_URL`, `SUPABASE_URL`) are present — by design it is **never green just because mock mode works**. See `docs/deployment/railway.md`; auth/MFA/route details in `docs/security/`.

## Verification conventions (adopted from the sizhu-secure-fufire-baseline retro, 2026-06-14)

These are project rules learned the hard way — every "looks-done" defect in that build was caught one gate too late because each increment was checked against its own author-written evidence.

- **P1 — wired-in-prod means an importer, not a test.** Before claiming a capability is `wired-in-prod`, prove its symbol has ≥1 **production** importer reachable from the `createApp()` composition root (a `grep` for non-test importers). A module that passes its unit tests but has zero production callers is a built-but-dead primitive — `wired-in-prod = no`, never yes. (Origin: the FuFire response interpreter was marked wired-in-prod=yes with zero importers.)
- **P2 — a negative/safety claim ships with its guard test in the same commit.** Any "carries no PII", "no fake success", "no secret echoed" claim in the reality ledger / traceability must be paired with a test (named in the claim) that goes RED if the claim were false. No paired guard test ⇒ do not record the claim. (Origin: a "no PII" claim stood over `sanitizedRequestMetadata: { input }` echoing birth data — on two paths.)
- **P4 — every behaviour-change ships a RED-on-revert mutation proof.** Revert the new guard to its pre-fix form, confirm the test goes RED, restore, and note it in the commit body. This is what turns a green-but-useless test into a trustworthy one.
  - **Stryker is now adopted** (`npm run test:mutation`, opt-in, on the curated critical modules in `stryker.config.json`). The mutation score is the objective anti-tautology oracle — a tautological test cannot raise it. Use it to *measure* the proof, not just assert it. Per-module before/after lives in `metrics/mutation-baseline.json`. New critical pure modules should get a kill-test + be added to the `mutate` list.
  - **RESTORE without losing work (learned 2026-06-14, hit twice):** to do the manual revert, **commit the slice first** (or revert a *copy* of the module / use a throwaway), then restore from the commit/copy. **Never `git checkout <file>` on an uncommitted branch** — it deletes the whole slice, not just the mutation, forcing a full re-apply.
- **P5 (planning note) — scope pre-declares artifact classes, not just code paths.** When confirming an Allowed-change-scope, include the process/verification artifacts a verified increment necessarily produces (`docs/verification*.md`, `docs/reality/*.evidence.jsonl`, the traceability matrix) and the build/config files a dep/boundary task touches (`vite.config.ts`, `package.json`, `.gitignore`) — as a **named** allowlist, never a wildcard.
- **P6 — the secret-ref indirection is a deployment trap; guard it with a readiness test.** Provider keys are read by INDIRECTION: `process.env[ process.env.<PROVIDER>_API_KEY_SECRET_REF || "<DEFAULT_REF>" ]`. The actual key must live under the var the ref *names*, NOT under the bare `<PROVIDER>_API_KEY`. **The defaults are asymmetric** (FuFire default ref = `SECRET_REF_FUFIRE_API_KEY` → indirect; OpenRouter default ref = `OPENROUTER_API_KEY` → direct) — easy to mis-wire on Railway. Document the exact var names per provider in `docs/deployment/railway.md`, and keep the readiness guard test (`server/tests/operational.routes.test.ts`: key under the wrong var → 503 NOT_READY) green. (Origin: F-LIVE-2 — the live `.env` had the FuFire key under `FUFIRE_API_KEY`; the smoke caught it, clean unit tests never would.)
- **P7 — live-evidence slice: when the code path exists but has only sample/mock evidence, build a real-boundary smoke, don't re-write the path.** A RED-for-confidence ledger item usually needs *evidence*, not code. Build a flag-gated smoke under `scripts/smoke/` that hits the real boundary with the real secret, plus: a **contract-drift guard** (FAIL LOUD if the live response shape diverges from what the interpreter assumes), a **secret-hygiene self-check** (assert the resolved key never appears in output; log host only), and a **dry-run + inject-drift** mode proving the guard bites. Then **adversarially verify** the PASS (independent lenses / a discriminating probe) before flipping the Reality Ledger — a single green smoke hides defects (Origin: the FuFire smoke PASSED but adversarial lenses refuted 2; a location probe falsified AC-F-002f's premise; the OpenRouter smoke caught a stale model slug). Only the USER flips not-real→real.
- **P8 — orchestration hygiene.** (a) **Never trust an agent's self-report of repo state** (e.g. "the file already existed") — verify with `git status` / the objective oracle (Stryker score, importer grep). (b) Use a **`-F -` heredoc** for any commit/merge message containing backticks; backticks inside a double-quoted `git -m "…"` trigger shell command-substitution and silently drop words.
