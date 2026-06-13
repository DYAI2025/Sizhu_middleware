# Traceability Matrix: sizhu-secure-fufire-baseline

Status: confirmed
Confirmed by user: yes
Confirmation date: 2026-06-13
Owner: requirements-analyst
PRD: docs/prd/sizhu-secure-fufire-baseline.prd.md
Canvas: docs/canvas/sizhu-secure-fufire-baseline.canvas.md
Request contract: docs/contracts/fufire-api-reference.md
Real samples: docs/contracts/fufire-samples/{bazi,wuxing}.response.json
Branch: feat/sizhu-secure-fufire-baseline

> One row per in-scope REQ. `wired-in-prod?` = is there a test proving the capability is
> reachable through the **production composition root** (`createApp()` in
> `server/index.ts`), not just a hand-built harness? (yes/no/planned).
> `evidence-class` (Reality Ledger) ∈ {unit-fake, integration-fake, real-boundary-smoke,
> production-verified}. Any I/O/remote/UI feature still at `*-fake` is **RED**.
> `canvas-risk-status` ∈ {aligned, value-risk, non-goal-violation, risk-introduced, blocked}.
> All `canvas-link` = docs/canvas/sizhu-secure-fufire-baseline.canvas.md.

## Legend / shared canvas values

- **canvas-problem (P1)**: body-controlled `POST /api/fufire/*` is an SSRF/config-bypass
  primitive (canvas §1.1).
- **canvas-problem (P2)**: wrong FuFire request schemas → personalization not guaranteed
  non-invented (canvas §1.2).
- **canvas-target-user (U-op)**: SizhuAtelier operator/admin (configures, triggers test-runs,
  releases fulfillment) (canvas §2).
- **canvas-target-user (U-end)**: Etsy buyer who expects correct, real-birth-data BaZi/Wu-Xing
  personalization (canvas §2).
- **canvas-value (V-sec)**: operator triggers FuFire securely/reproducibly; path/baseUrl/
  header/secret server-fixed; sensitive actions need role+MFA (canvas §4).
- **canvas-value (V-nofake)**: end customer gets only FuFirE-grounded personalization;
  missing/bad fields block render or controlled-error (canvas §4).
- **canvas-value (V-calc)**: deterministic chart *calculation* is verifiable; FuFirE
  *interpretation* is never "verified truth" (claim-discipline, canvas §4/§7).
- **canvas-value (V-arch)**: OpenRouter as sole default gateway simplifies secret mgmt
  (canvas §4).
- **canvas-success (S-auth)**: health 200 no-auth; test-run 401/403 no-auth (canvas §5).
- **canvas-success (S-builder)**: request bodies match documented schemas in unit tests
  (canvas §5).
- **canvas-success (S-ssrf)**: generic proxy removed; baseUrl/path/secret payloads
  rejected/ignored (canvas §5).
- **canvas-success (S-router)**: OpenRouter default; no forced Gemini/OpenAI secrets (canvas §5).
- **canvas-success (S-persist)**: production mode does not silently use mock/localStorage
  (canvas §5).
- **canvas-success (S-gelato)**: no Gelato fake success outside DEMO_LOCAL (canvas §5).
- **canvas-success (S-green)**: lint/build/test stay green w/ verification log (canvas §5/§9).

## Matrix

| REQ-ID | requirement | acceptance-test(s) | task(s) | evidence | wired-in-prod? | evidence-class | canvas-link | canvas-problem | canvas-target-user | canvas-value-claim | canvas-success-signal | canvas-risk-status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-S-001 | Protect all admin/provider APIs server-side | AC-S-001a (health 200 no-auth), AC-S-001b (default-deny 401), AC-S-001c (sensitive 401 no-auth) | T1, T2 | supertest vs `createApp()` for /api/health 200 + unlisted/test-run 401 `AUTH_REQUIRED` | yes | real-boundary-smoke | canvas | P1 | U-op | V-sec | S-auth | aligned |
| REQ-S-002 | Email-verified admin role + MFA/AAL2 for sensitive actions | AC-S-002a (401 invalid / 403 EMAIL_VERIFICATION_REQUIRED), AC-S-002b (403 ADMIN_ROLE_REQUIRED), AC-S-002c (403 MFA_REQUIRED_FOR_ACTION / aal2 pass), AC-S-002d (no service-role key in bundle) | T2 | JWT/AAL fixtures + supertest vs `createApp()`; grep frontend bundle | yes | real-boundary-smoke | canvas | P1 | U-op | V-sec | S-auth | aligned |
| REQ-F-001 | Build FuFire request bodies from normalized birth input (server-side) | AC-F-001a (chronometry nested birth.*), AC-F-001b (bazi/trace flat ISO date), AC-F-001c (wuxing flat, lat/lon required), AC-F-001d (default-noon), AC-F-001e (NO_GEOCODER_CONFIGURED), AC-F-001f (asserted from output), AC-F-001g (no secret in metadata) | T3 | server/tests/fufire.requestBuilders.test.ts (8/8; bodies asserted from builder output vs authoritative contract; 3 mutations bite); builders wired into executeTestRun (reachable via /api/data-requests/fufire/test-run) | yes | unit-only (request-side `belegt` vs authoritative contract; pure builders, no live call) | canvas | P2 | U-op, U-end | V-nofake, V-calc | S-builder | aligned |
| REQ-F-002 | Interpret FuFire responses without guessing (bazi + wuxing) | AC-F-002a (paths in order, matched recorded), AC-F-002b (PROMPT_VARIABLE_SOURCE_MISSING), AC-F-002c (sanitized, no secret), AC-F-002d (deferred ops render-block), AC-F-002e (day-anchor unverified surfaced) | T4 | server/tests/fufire.responseInterpreter.test.ts (11/11; resolve animal/element/birth_year/dominant_element vs REAL samples; missing-field→PROMPT_VARIABLE_SOURCE_MISSING; 0,0-guard; day-pillar unverified surfaced; 3 mutations bite) | yes | integration-fake (real captured samples, NOT a live call — best achievable this run; RED-for-confidence until live) | canvas | P2 | U-end | V-nofake, V-calc | S-builder | value-risk (interpretation not "verified truth"; day-pillar anchor engine-flagged unverified — surfaced, not laundered) |
| REQ-F-003 | Render prompt templates from safe prompt variables only (bazi + wuxing) | AC-F-003a (only mapped vars), AC-F-003b (missing var blocks render), AC-F-003c (no deterministic fortune claims) | T4 | server/tests/fufire.responseInterpreter.test.ts (render-block on missing var; only-mapped-vars; no fortune claims; single-pass render = no template injection) | yes | integration-fake (real samples) | canvas | P2 | U-end | V-nofake, V-calc | S-builder | aligned (animal convention RESOLVED locale-driven de→Pferd/en→Horse; never mixed) |
| REQ-A-001 | Remove arbitrary client-controlled FuFire proxy (SSRF/config-bypass) | AC-A-001a (proxy removed), AC-A-001b (body cannot steer URL/secret), AC-A-001c (server owns config), AC-A-001d (FUFIRE_OPERATION_NOT_ALLOWED), AC-A-001e (dead classifier entry removed) | T1 | supertest vs `createApp()`: `POST /api/fufire/*` no longer fetches; fuFireConfig/fufirePath/baseUrl/apiKeySecretRef ignored/rejected; grep/checklist | yes | real-boundary-smoke | canvas | P1 | U-op | V-sec | S-ssrf | aligned (FIX = REMOVE the primitive, NOT re-auth) |
| REQ-A-002 | OpenRouter is the only default model gateway | AC-A-002a (OPENROUTER_* default server-side), AC-A-002b (no forced Gemini/OpenAI defaults — grep), AC-A-002c (UI says Model Gateway/OpenRouter), AC-A-002d (MODEL_CAPABILITY_MISMATCH) | T5 + T5b | src/tests/openrouter.gateway.test.ts (3/3, greps real .env.example) + src/tests/modelGateway.openRouter.test.ts (capability-mismatch + server-side key) + src/tests/modelGateway.wiredInProd.test.ts (5/5; drives REAL WorkflowRunner w/ spy; sentinel-config proves routing not pass-through; mutation-verified RED on revert) | yes | integration-fake (real runner composition via spy + .env real-boundary-smoke; no live OpenRouter call) | canvas | P2 | U-op | V-arch | S-router | aligned (AC-A-002a/b/c/d delivered; runtime wired-in-prod=YES after T5b scope-ext; model slugs carried `unverified` — confirm vs live catalog pre-prod) |
| REQ-D-001 | Supabase is the production persistence boundary (block, do not fake) | AC-D-001a (SUPABASE_NOT_CONFIGURED in prod), AC-D-001b (no silent localStorage in prod paths), AC-D-001c (DEMO_LOCAL explicit) | T6 | mode-boundary tests; grep for localStorage in production-mode paths | planned | unit-fake (boundary guard only; NO real persistence this run by design) | canvas | P1 | U-op | V-sec | S-persist | aligned (real persistence is a deferred non-goal; only the guard is built) |
| REQ-O-001 | Keep health public + readiness truthful | AC-O-001a (health public 200), AC-O-001b (readiness 503 NOT_READY w/ missing[]), AC-O-001c (static not behind CORS; unknown origin no 500) | T1 (incl. Sprint-0) | supertest vs `createApp()` for /api/health + /api/readiness; CORS/static behavior | yes | real-boundary-smoke | canvas | P1 | U-op | V-sec | S-auth, S-green | aligned |
| REQ-O-002 | Gelato dispatch safe, explicit, idempotency-ready | AC-O-002a (disabled/MISSING_POD_CONTRACT controlled), AC-O-002b (no fake success outside DEMO_LOCAL), AC-O-002c (idempotency key generated + sanitized-logged) | T7 | dispatch tests: disabled provider, missing contract, missing mapping, no AAL2, no fake success; idempotency-key presence | planned | unit-fake (test double; no real Gelato call — real order creation is a deferred non-goal) | canvas | P1 | U-op, U-end | V-sec | S-gelato | aligned (no real dispatch this run) |

## Partly deferred (in-scope REQ, render-blocked sub-scope)

| REQ-ID (sub) | requirement | acceptance-test(s) | task(s) | evidence | wired-in-prod? | evidence-class | canvas-link | canvas-risk-status |
|---|---|---|---|---|---|---|---|---|
| REQ-F-002 / F-003 (bazi_trace) | Response-mapping for bazi_trace | AC-F-002d render-block test | T4 | no real sample → mapping render-blocks; PROMPT_VARIABLE_SOURCE_MISSING | n/a | unverified (no real sample; render-blocked) | canvas | blocked (deferred; NOT a working premise) |
| REQ-F-002 / F-003 (chronometry/resolve) | Response-mapping for chronometry/resolve | AC-F-002d render-block test | T4 | no real sample → mapping render-blocks | n/a | unverified (no real sample; render-blocked) | canvas | blocked (deferred; NOT a working premise) |

## Reality-Ledger notes (must not be laundered)

- **REQ-F-002/F-003 (bazi+wuxing) ceiling = `integration-fake` this run.** Tests use the
  REAL captured samples (`bazi.response.json`, `wuxing.response.json`) — real data, but
  **not a live FuFire call**. This is RED until a live-boundary smoke exists, and is the
  honest best achievable without live network this run.
- **REQ-S-001/002, REQ-A-001, REQ-O-001 target = `real-boundary-smoke`** via supertest
  against `createApp()` (the production composition root), not a hand-built harness.
- **REQ-F-001 = `unit-fake`** but the request side is `belegt` against the authoritative
  contract; mocked fetch asserts method/header/body.
- **Day-pillar anchor caveat (REQ-F-002).** The bazi sample's
  `derivation_trace.day.day_anchor_evidence.anchor_verification == "unverified"` — the
  engine flags the day-pillar anchor as unverified. "Deterministic + verifiable chart math"
  holds for year/month/time resolution; the day pillar carries a provider-declared
  unverified anchor. Surface it; never label it "verified."
- **Claim-discipline.** No row's evidence may certify FuFirE *interpretation* as "verified
  truth"; only chart *calculation* correctness may be certified (and not the day anchor).

## Open items feeding the matrix (see PRD §9)

- OPEN QUESTION: animal convention EN `chinese.year.animal` vs DE `pillars.year.tier`
  (affects REQ-F-003).
- OPEN QUESTION: `POST /api/fulfillment/pod/validate-dispatch` is currently `session`-only
  (not in `SENSITIVE_API_ROUTES`); should it be `sensitive`? (affects REQ-O-002 + security
  matrix).
- ASSUMPTION: `test:api`/`test:e2e` scripts do not exist; add only if tests implemented.
- ASSUMPTION: Supabase Auth is the auth provider (carried from sprint plan).
- MISSING (deployment, non-blocking for code): Railway env values, Supabase first-owner
  user ID, final auth-key setup.
- No open BLOCKER for this run (deferral resolved the samples blocker, not weakening).
