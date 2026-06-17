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
| REQ-F-002 | Interpret FuFire responses without guessing (bazi + wuxing) | AC-F-002a (paths in order, matched recorded), AC-F-002b (PROMPT_VARIABLE_SOURCE_MISSING), AC-F-002c (sanitized, no secret), AC-F-002d (deferred ops render-block), AC-F-002e (day-anchor unverified surfaced) | T4 | server/tests/fufire.responseInterpreter.test.ts (11/11; resolve animal/element/birth_year/dominant_element vs REAL samples; missing-field→PROMPT_VARIABLE_SOURCE_MISSING; 0,0-guard; day-pillar unverified surfaced; 3 mutations bite) + server/tests/fufire.testrun.mapping.test.ts (9/9; resolvePromptVariables invoked on the REAL executeTestRun path with mocked-HTTP real samples; mutation RED-on-revert) | yes — EARNED (T9, user option-A): resolvePromptVariables is now the interpreter's only production importer (fufireDataService.ts), CALLED on the composed path POST /api/data-requests/fufire/test-run → createApp → executeTestRun → resolvePromptVariables; result.promptVariables on the wire. NO→yes flip per Gate C/D + code-review APPROVE + security PASS + watcher. | integration-fake (real captured samples, NOT a live FuFire call) | canvas | P2 | U-end | V-nofake, V-calc | S-builder | aligned (interpretation not "verified truth"; day-pillar unverified surfaced; map-half wired-in-prod=yes; live-call ceiling = integration-fake) |
| REQ-F-003 | Render prompt templates from safe prompt variables only (bazi + wuxing) | AC-F-003a (only mapped vars), AC-F-003b (missing var blocks render), AC-F-003c (no deterministic fortune claims) | T4 | server/tests/fufire.responseInterpreter.test.ts (render-block on missing var; only-mapped-vars; no fortune claims; single-pass render = no template injection) | NO — the F-002 MAP half (resolvePromptVariables) is now wired (T9); but renderPromptTemplate (the F-003 RENDER half) STILL has ZERO production importers — its only live consumer would be the north-star prompt-render pipeline (the WorkflowRunner image-gen path uses renderPrompt with MOCK personalization in DEMO_LOCAL, not renderPromptTemplate from real FuFire vars). Render-wiring deferred (built primitive). Watcher 2026-06-14: do NOT flip yes on the strength of the F-002 wiring. | integration-fake (real samples) | canvas | P2 | U-end | V-nofake, V-calc | S-builder | value-risk (built primitive; render half wired-in-prod=NO — live consumer is north-star; map-half value delivered via the test-run console) |
| REQ-A-001 | Remove arbitrary client-controlled FuFire proxy (SSRF/config-bypass) | AC-A-001a (proxy removed), AC-A-001b (body cannot steer URL/secret), AC-A-001c (server owns config), AC-A-001d (FUFIRE_OPERATION_NOT_ALLOWED), AC-A-001e (dead classifier entry removed) | T1 | supertest vs `createApp()`: `POST /api/fufire/*` no longer fetches; fuFireConfig/fufirePath/baseUrl/apiKeySecretRef ignored/rejected; grep/checklist | yes | real-boundary-smoke | canvas | P1 | U-op | V-sec | S-ssrf | aligned (FIX = REMOVE the primitive, NOT re-auth) |
| REQ-A-002 | OpenRouter is the only default model gateway | AC-A-002a (OPENROUTER_* default server-side), AC-A-002b (no forced Gemini/OpenAI defaults — grep), AC-A-002c (UI says Model Gateway/OpenRouter), AC-A-002d (MODEL_CAPABILITY_MISMATCH) | T5 + T5b | src/tests/openrouter.gateway.test.ts (3/3, greps real .env.example) + src/tests/modelGateway.openRouter.test.ts (capability-mismatch + server-side key) + src/tests/modelGateway.wiredInProd.test.ts (5/5; drives REAL WorkflowRunner w/ spy; sentinel-config proves routing not pass-through; mutation-verified RED on revert) | yes | integration-fake (real runner composition via spy + .env real-boundary-smoke; no live OpenRouter call) | canvas | P2 | U-op | V-arch | S-router | aligned (AC-A-002a/b/c/d delivered; runtime wired-in-prod=YES after T5b scope-ext; model slugs carried `unverified` — confirm vs live catalog pre-prod) |
| REQ-D-001 | Supabase is the production persistence boundary (block, do not fake) | AC-D-001a (SUPABASE_NOT_CONFIGURED in prod), AC-D-001b (no silent localStorage in prod paths), AC-D-001c (DEMO_LOCAL explicit) | T6 | src/tests/persistence.boundary.test.ts + persistence.boundary.carveout.test.ts + server/tests/config.appmode.consistency.test.ts (30 green; drive the REAL appServices facade + real Supabase stub repos + real getAppMode; non-DEMO → SUPABASE_NOT_CONFIGURED, no Local repo, carve-out reads fail-safe to Observer/non-LIVE) | yes | integration (real composition-root facade + shipped stubs, no fake substitute; no live backend BY DESIGN — REQ is block-not-fake) | canvas | P1 | U-op | V-sec | S-persist | aligned (real persistence is a deferred non-goal; only the guard is built; carve-out on 2 non-throwing reads documented + pinned) |
| REQ-O-001 | Keep health public + readiness truthful | AC-O-001a (health public 200), AC-O-001b (readiness 503 NOT_READY w/ missing[]), AC-O-001c (static not behind CORS; unknown origin no 500) | T1 (incl. Sprint-0) | supertest vs `createApp()` for /api/health + /api/readiness; CORS/static behavior | yes | real-boundary-smoke | canvas | P1 | U-op | V-sec | S-auth, S-green | aligned |
| REQ-O-002 | Gelato dispatch safe, explicit, idempotency-ready | AC-O-002a (disabled/MISSING_POD_CONTRACT controlled), AC-O-002b (no fake success outside DEMO_LOCAL), AC-O-002c (idempotency key generated + sanitized-logged) | T7 | server/tests/pod.dispatch.branches.test.ts + no-fake-success.mode.test.ts + pod.idempotency.test.ts (24 green; drive the REAL PodDispatchService + real getGelatoFulfillmentConfig + real getAppMode: each branch returns its specific error_code; no mock_success outside DEMO_LOCAL; deterministic sha256 idempotency key at the would-dispatch point — determinism mutation-verified RED on Date.now revert; key+log+metadata carry no apiKey/PII — incl. the 5 _failure branches now sanitized to {workflowRunId,artifactId}, guarded by pod.failure.sanitization.test.ts) | yes | integration (real service + real config getter + real mode; no live Gelato BY DESIGN — MISSING_POD_CONTRACT blocks; real order creation deferred non-goal) | canvas | P1 | U-op, U-end | V-sec | S-gelato | aligned (no real dispatch this run; idempotency-ready scaffolding in place, retry-safe; _failure PII echo closed per holistic review) |

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

---

# Traceability Matrix: sizhu-agent-safe-ops

Status: ready-for-user-confirmation
Confirmed by user: no
Feature Slug: sizhu-agent-safe-ops
PRD: docs/prd/sizhu-agent-safe-ops.prd.md
Vision: docs/vision/sizhu-agent-safe-ops.vision.md
Canvas: docs/canvas/sizhu-agent-safe-ops.canvas.md

> Zweiter Feature-Block in dieser Datei (Umbrella-Intake A/B/C). Der obige
> `sizhu-secure-fufire-baseline`-Block bleibt unverändert und bestätigt.

| Trace ID | Vision Item ID | Canvas Item ID | Requirement ID | Acceptance Criteria ID | Evidence Needed | Status | Source Type |
|---|---|---|---|---|---|---|---|
| TRC-001 | VIS-002 | CAN-001 | REQ-001 | AC-001, AC-002, AC-004 | EV-001 | ready | EXPLICIT |
| TRC-002 | VIS-006 | CAN-005 | REQ-002 | AC-003 | EV-002 | ready | EXPLICIT |
| TRC-003 | VIS-006 | CAN-001 | REQ-003 | AC-005 | EV-003 | ready | EXPLICIT |
| TRC-004 | VIS-002 | CAN-004 | REQ-004 | AC-006 | EV-004 | ready | EXPLICIT |
| TRC-005 | VIS-004 | CAN-005 | REQ-005 | AC-007 | EV-005 | ready | EXPLICIT |
| TRC-006 | VIS-006 | CAN-005 | REQ-006 | AC-008 | EV-006 | ready | EXPLICIT |
| TRC-007 | VIS-003 | CAN-005 | REQ-007 | AC-009 | EV-007 | open-question | EXPLICIT |
| TRC-008 | VIS-006 | CAN-010 | REQ-008 | AC-010 | EV-008 | ready | EXPLICIT |
| TRC-009 | VIS-003 | CAN-005 | REQ-009 | AC-011 | EV-009 | ready | EXPLICIT |
| TRC-010 | VIS-006 | CAN-005 | REQ-010 | AC-012 | EV-010 | ready | EXPLICIT |
| TRC-011 | VIS-003 | CAN-005 | REQ-011 | AC-013 | EV-011 | ready | EXPLICIT |

## Coverage (sizhu-agent-safe-ops)

Alle 11 Requirements (REQ-001..011) sind an Vision, Canvas, Acceptance Criteria und Evidence gebunden — keine verwaiste Anforderung. `TRC-007` ist an OQ-002 (stdio entfernen vs. generieren) gekoppelt; das blockiert die Planung nicht, sondern wird im Run entschieden. Kein offener BLOCKER.

## User Confirmation (sizhu-agent-safe-ops)

The assistant must not confirm this matrix. Bestätigung erfolgt durch den Nutzer (Confirmation-Block im Chat).
