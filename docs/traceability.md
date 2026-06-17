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
---

# Traceability Matrix: sizhu-live-generate-qa-loop (Slice A)

Status: user-confirmed (User, 2026-06-15 — at the USER GATE after Phase 0.7 remediation; Council + spec-auditor + watcher gate-fixes applied)
Confirmed by user: yes
Owner: requirements-analyst
PRD: docs/prd/sizhu-live-generate-qa-loop.prd.md
Canvas: docs/canvas/sizhu-live-generate-qa-loop.canvas.md (Status: user-confirmed, re-confirmed after Council 2026-06-15)
Branch: feat/sizhu-live-generate-qa-loop
Date: 2026-06-15

> One row per top-level REQ. `wired-in-prod?` = is the capability reachable through the
> **production composition root** (`createApp()` in `server/index.ts`) via the new
> `POST /api/workflows/:id/run`, proven by a non-test importer (P1)? (yes/no/planned).
> `evidence-class` (Reality Ledger) ∈ {unit-fake, integration-fake, real-boundary-smoke,
> production-verified}. For to-build REQs the cell shows the **TARGET** class (most target
> `real-boundary-smoke` via the P7 live-loop smoke, REQ-LGQ-008); `evidence` = "TO BUILD"
> until the build writes actuals. `canvas-risk-status` ∈ {aligned, value-risk,
> non-goal-violation, risk-introduced, blocked}.
> All `canvas-link` = docs/canvas/sizhu-live-generate-qa-loop.canvas.md.

## Legend / shared canvas values

- **canvas-problem (P-loop)**: the generate→QA→escalate loop has never produced a REAL
  generated image scored by a REAL vision model — only mocks (offline SVG + mock scores);
  no real `ImageGenerationProvider`/`QualityGateProvider` exists (canvas §1).
- **canvas-target-user (U-op)**: POD shop operator/admin of the Bazzi console; configures
  quality gates, runs/observes workflows (canvas §2). End Etsy buyer is OUT of scope this
  slice (no real customer data/order/money).
- **canvas-value (V-real)**: the loop runs against REAL OpenRouter models so accept/escalate
  reflects real model behavior — first real link of the north-star pipeline (canvas §4).
- **canvas-value (V-nofake)**: no fake-success; a divergent real response FAILS LOUD, never
  fakes an accepted candidate (canvas §4 #2).
- **canvas-value (V-approval)**: human-approval-before-live-dispatch invariant PRESERVED —
  this slice adds NO dispatch leg; run stops at `pod_ready` (canvas §4 #3).
- **canvas-value (V-nopii)**: no birth-data PII crosses the OpenRouter boundary or any
  log/error/metadata surface (canvas §4 #4, A4 hard constraint).
- **canvas-value (V-cap)**: HARD per-run cost/quantity cap (both max-images AND $ ceiling),
  server-enforced, derived from config worst-case (canvas §4 #5, R3+A3).
- **canvas-value (V-prov)**: artifact provenance (model + prompt-vars + QA-score) + per-run
  cost/rejection telemetry recorded (canvas §4 #6, C2).
- **canvas-success (S-smoke)**: a flag-gated real-boundary smoke goes green — real image,
  real score, deterministic terminal state, cap bites, real cost, no PII/key leak
  (canvas §5, RESOLVED — this IS the success signal; NOT a console UI).

## Matrix

| REQ-ID | requirement | acceptance-test(s) | task(s) | evidence | wired-in-prod? | evidence-class (TARGET) | canvas-link | canvas-problem | canvas-target-user | canvas-value-claim | canvas-success-signal | canvas-risk-status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-LGQ-001 | Real `ImageGenerationProvider` (OpenRouter image call; ephemeral base64; seam-compatible; mock preserved) | AC-LGQ-001a (real POST /v1/chat/completions, base64 data URI), AC-LGQ-001b (seam-compatible drop-in), AC-LGQ-001c (mock still used in DEMO_LOCAL), AC-LGQ-001d (ephemeral, no Supabase) | T-LGQ-2, T-LGQ-3 | TO BUILD (unit/contract = unit-fake mocked HTTP; promoted only by the REQ-LGQ-008 live smoke) | planned (via T-LGQ-7 endpoint) | real-boundary-smoke | canvas | P-loop | U-op | V-real | S-smoke | aligned |
| REQ-LGQ-002 | Real `QualityGateProvider` (OpenRouter vision scoring; no silent vanish; image→score proven) | AC-LGQ-002a (real vision call, status from minScore), AC-LGQ-002b (seam-compatible), AC-LGQ-002c (no vanish/no fake accept), AC-LGQ-002d (image→score path proven, retires R9 ungeprüft) | T-LGQ-2, T-LGQ-4 | TO BUILD | planned (via T-LGQ-7 endpoint) | real-boundary-smoke | canvas | P-loop | U-op | V-real, V-nofake | S-smoke | aligned (R9 image→score = ungeprüft until smoke proves it; NOT a premise) |
| REQ-LGQ-003 | Server-side run endpoint `POST /api/workflows/:id/run` (sensitive; runs runner server-side; no dispatch leg) | AC-LGQ-003a (server-side run, client never sees key), AC-LGQ-003b (classified sensitive, pattern added), AC-LGQ-003c (401/403 default-deny matrix), AC-LGQ-003d (stops at pod_ready, no dispatch) | T-LGQ-6, T-LGQ-7, T-LGQ-8 | TO BUILD (auth matrix via supertest vs createApp = real-boundary-smoke; run via live smoke) | planned → yes (T-LGQ-8 importer check) | real-boundary-smoke | canvas | P-loop | U-op | V-real, V-approval | S-smoke | aligned (R1/R2 RESOLVED; dispatch invariant preserved by adding no dispatch leg) |
| REQ-LGQ-004 | Hard cost cap — max-image-calls AND $ ceiling, server-enforced, derived (12/$1.00 = per-product worst-case 6/$0.23 + headroom; F1-corrected, was 9/$0.35) | AC-LGQ-004a (image-count cap bites), AC-LGQ-004b ($ ceiling bites), AC-LGQ-004c (derivation justified from config), AC-LGQ-004d (RED-on-removal guard, P2/P4) | T-LGQ-1, T-LGQ-6 | TO BUILD (unit guard RED-on-revert + cap-bites in live smoke) | planned (enforced in server runner, T-LGQ-6) | real-boundary-smoke | canvas | P-loop | U-op | V-cap | S-smoke | aligned (R3+A3 RESOLVED; cap DERIVED not guessed; load-bearing money guard) |
| REQ-LGQ-005 | PII redaction at provider boundary (only rendered prompt + score criteria leave; never raw birth data) | AC-LGQ-005a (sentinel birth data absent from outbound body/header/system prompt), AC-LGQ-005b (absent from logs/errors/metadata/qaResultJson), AC-LGQ-005c (paired guard RED-on-leak, P2) | T-LGQ-3, T-LGQ-4 | TO BUILD (paired P2 guard test; outbound-body assertion in live smoke) | planned (in both real providers) | real-boundary-smoke | canvas | P-loop | U-op | V-nopii | S-smoke | aligned (A4 hard constraint; baseline P2 origin = sanitizedRequestMetadata birth-data echo) |
| REQ-LGQ-006 | Per-candidate provenance (model+prompt-vars+QA-score) + per-run cost & rejection telemetry | AC-LGQ-006a (artifact carries modelUsed + prompt-var provenance + qaScore), AC-LGQ-006b (run records summed usage.cost + rejection-rate), AC-LGQ-006c (provenance PII-safe) | T-LGQ-5 | TO BUILD (live smoke asserts non-zero real cost + provenance present) | planned (threaded via ArtifactService + run result) | real-boundary-smoke | canvas | P-loop | U-op | V-prov | S-smoke | aligned (C2; folds into value-promise #6; PII-safe per OQ-3) |
| REQ-LGQ-007 | No-fake-success / contract-drift guard (divergent/HTTP-error response FAILS LOUD) | AC-LGQ-007a (missing image/score field → controlled drift error, no synth), AC-LGQ-007b (non-2xx incl. 402 fails loud), AC-LGQ-007c (slug-drift guard reused, --inject-drift) | T-LGQ-2, T-LGQ-9 | TO BUILD (drift unit tests = integration-fake crafted responses; slug-drift + 402 in smoke) | planned (in real providers) | integration-fake → real-boundary-smoke | canvas | P-loop | U-op | V-nofake | S-smoke | aligned (R5; no-fake-success value-promise #2) |
| REQ-LGQ-008 | Wired-in-prod + flag-gated real-boundary live smoke (success signal) | AC-LGQ-008a (≥1 production importer from createApp, P1), AC-LGQ-008b (live smoke green = success signal; real image→score→terminal, cap bites, real cost, no PII/key), AC-LGQ-008c (opt-in, not CI; --dry-run), AC-LGQ-008d (readiness reflects OpenRouter key, never echoed) | T-LGQ-7, T-LGQ-8, T-LGQ-9 | TO BUILD (the smoke itself = real-boundary-smoke; importer check = unit/integration) | planned → yes (the whole point of the slice) | real-boundary-smoke | canvas | P-loop | U-op | V-real | S-smoke | aligned (P1/P7; this green smoke IS the canvas §5 success signal) |

## Reality-Ledger notes (must not be laundered)

- **All REQ-LGQ rows are TO BUILD at draft time.** `evidence-class` cells show the TARGET
  class. A row may not claim a higher class than its evidence proves; an I/O/remote feature
  whose only evidence is mocked HTTP stays `unit-fake`/`integration-fake` (RED for live
  confidence) until the REQ-LGQ-008 live smoke promotes it to `real-boundary-smoke`.
- **R9 image→score path = `ungeprüft` until proven (AC-LGQ-002d).** The real image
  generation contract is `belegt` (verified live 2026-06-15: base64 PNG data URI,
  $0.0387/image, modest max_tokens required). The vision model scoring a real image input
  is NOT yet proven end-to-end; it stays `ungeprüft` and is retired only by the live smoke —
  it may NOT be downgraded to a "documented risk" premise.
- **wired-in-prod (P1).** No REQ-LGQ row may flip `wired-in-prod=yes` until a NON-TEST
  importer reachable from `createApp()` (via `POST /api/workflows/:id/run`) is proven by grep
  (AC-LGQ-008a). Passing unit tests with zero production callers = built-but-dead = `no`.
- **Cost cap is load-bearing (P2/P4).** AC-LGQ-004d requires the cap guard to go RED when the
  cap is reverted; real money ($0.0387/image) makes this a money guard, not decoration.
- **No-PII paired guard (P2).** REQ-LGQ-005's claim ships with its sentinel-birth-data guard
  in the same commit; no guard ⇒ do not record the claim.
- **Value-promise #3 preserved structurally.** This slice adds NO dispatch leg;
  `assertDispatchAllowed` (runner.ts:352,409) is untouched; run stops at `pod_ready`.

## Open items feeding this matrix (see PRD §10)

- OQ-1: server-run input source (request-body birth data vs repo-read run/order) — touches
  REQ-LGQ-003 contract + REQ-LGQ-005 PII surface. ASK before Vision confirmation.
- OQ-2: cap-bite terminal state — reuse `escalated` vs new `cap_stopped` (NFR-4 + REQ-LGQ-004).
- OQ-3: provenance form for prompt variables — verbatim vs non-PII hash; never store
  name/date/place (REQ-LGQ-006a vs REQ-LGQ-005). ASK (touches PII acceptance criterion).
- OQ-4: cost-cap config home — env vs GenerationConfig vs new settings field (REQ-LGQ-004).
- ASSUMPTION (unconfirmed): existing `run_simulation` permission + new `sensitive` route
  classification suffice; no new `run_live` RBAC permission this slice.
- NFR-5 latency = `ungeprüft` — benchmark in build; do not assert a number.
- No open BLOCKER (canvas decisions R1/R2/R3/R8/A3/A4/C2/§5/§7 all RESOLVED).

---

# Traceability Matrix: sizhu-agent-safe-ops

Status: user-confirmed
Confirmed by user: yes
Confirmation date: 2026-06-17
Feature Slug: sizhu-agent-safe-ops
PRD: docs/prd/sizhu-agent-safe-ops.prd.md
Vision: docs/vision/sizhu-agent-safe-ops.vision.md
Canvas: docs/canvas/sizhu-agent-safe-ops.canvas.md

> **Re-baselined 2026-06-17 gegen HEAD nach dem LGQ-Merge** + **amended after the Phase 0.16
> Council** (full-schema rebuild: F1 BLOCKER fixed — the 6 mandatory Canvas fields + True-Line
> fields + `wired-in-prod?` + `evidence-class` now present on every top-level REQ).
> Namens-Hinweis: NICHT zu verwechseln mit `sizhu-live-generate-qa-loop (Slice A)` oben.
> Council decisions encoded: gate = Defense-in-Depth (REQ-001/002); Epic C (REQ-009/010/011)
> DEFERRED; Epic B = delete stdio (REQ-006/007); REQ-005 already done on the HTTP transport.

## Legend / shared values (sizhu-agent-safe-ops)

- **canvas-link** (all rows): `docs/canvas/sizhu-agent-safe-ops.canvas.md`
- **vision-link** (all rows): `docs/vision/sizhu-agent-safe-ops.vision.md`
- **canvas-problem CAN-001**: POD pipeline never e2e-tested; agent `/api`+MCP surface mixes
  real / lying (empty lists, shape-only `READY`) / un-gated elements; dispatch bypasses the gate.
- **canvas-target-user CAN-002**: Sizhu operators + remote AI agents (Claude Code, Codex, Hermes, openclaw).
- **canvas-value CAN-003**: an agent-safe, truthful ops layer — no fake success, no ungated money path, one MCP surface.
- **canvas-success CAN-009**: dispatch only with a valid (single-use, consumed) approval + gate; no fabricated empty data; one tool catalog.
- **wired-in-prod?** = a NON-TEST importer reachable from `createApp()` proves the capability on the live path (P1/P9). The gate (REQ-001) is the load-bearing P9 case: `assertDispatchAllowed` must gain a server-route caller (today it has ZERO — belegt, server/index.ts:231-234).
- **evidence-class** ∈ {unit-fake, integration-fake, real-boundary-smoke, production-verified}; cells show the **TARGET** for TO-BUILD rows.
- **value-check-id** ties each REQ to its True-Line check; **true-line-status** ∈ {aligned, value-risk, contradiction, deferred}.

### In-scope this iteration (Epic A + Epic B)

| REQ-ID | requirement (short) | acceptance-test(s) | task(s) | evidence | wired-in-prod? | evidence-class (TARGET) | canvas-problem | canvas-target-user | canvas-value-claim | canvas-success-signal | canvas-risk-status | value-check-id | true-line-status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REQ-001 | Dispatch route money-gate. sensitive/aal2 = **DONE** (auth.ts:154, caller-auth NOT the gate); TO-BUILD = approval-record consume + artifact-identity binding at the route. REQ-002 is the sole load-bearing gate. | AC-001, AC-003b, AC-004 | T-ASO-2 | TO BUILD — importer-grep (gate gains a server-route caller, P9/EV-001) + 403 supertest RED-on-revert. (sensitive-classify already belegt, not re-counted as work — spec-audit BLOCKER-2) | planned → **yes** (P9 core: route caller) | real-boundary-smoke (auth/gate via supertest vs createApp; pass-path integration) | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned | VC-001 | aligned (verify Gate E on build) |
| REQ-002 | **Sole load-bearing money gate**: persisted single-use approval-record (ApprovalRepository; binds runId+artifactId server-side; atomic consume; no sequential OR concurrent replay; dispatched-id must == approved-id) | AC-002, AC-002b, AC-003, AC-003c, AC-004 | T-ASO-1 | TO BUILD — unit: valid/tampered/expired/used/id-mismatch → correct verdict (EV-002); sequential+concurrent replay rejected (spec-audit BLOCKER-3/CONCERN-2) | planned → **yes** (consumed by REQ-001 route) | integration-fake → real-boundary-smoke | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned (narrow persistence carve-out; OQ-005 prod fail-closed) | VC-002 | aligned (verify Gate E) |
| REQ-003 | Truthful reads `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED` (no fabricated empty success) | AC-005 | T-ASO-3 | TO BUILD — route test vs createApp: no `200 {workflows:[]}`/`{issues:[]}` (EV-003) | planned → **yes** | real-boundary-smoke (supertest vs createApp) | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned (RISK-002 consumer-break: coordinate UI/MCP) | VC-003 | aligned (verify Gate E) |
| REQ-004 | `validate-dispatch` never `READY_FOR_DISPATCH` for non-accepted artifact | AC-006 | T-ASO-3 | TO BUILD — non-accepted ⇏ READY (EV-004) | planned → **yes** | real-boundary-smoke | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned | VC-004 | aligned (verify Gate E) |
| REQ-005 | `sizhu_pod_dispatch` registered only with `MCP_ENABLE_DISPATCH=true` | AC-007 | (done) | **DONE (HTTP transport)** — `mcp-server/src/server.ts:138` + smoke off→10/on→11 tools (EV-005); keep guard green | **yes** (HTTP, verified) | real-boundary-smoke (live tools/list smoke run 2026-06-15) | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned | VC-005 | aligned |
| REQ-006 | Single tool-catalog source (HTTP `mcp-server` after stdio deleted) | AC-008 | T-ASO-4 | TO BUILD — grep: no second hand-catalog after deletion (EV-006) | planned → **yes** | integration → real-boundary-smoke | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned | VC-006 | aligned (verify Gate E) |
| REQ-007 | Delete the redundant `server/mcp` stdio transport + `package.json` scripts (0 importers, ADR-0001) | AC-009 | T-ASO-4 | TO BUILD — `server/mcp` removed; importer-grep already = ZERO (belegt); build green (EV-007). **agentPolicy check (spec-audit CONCERN-3, belegt):** `server/mcp/auth/agentPolicy.ts` is stdio-only; HTTP surface forwards aal2 → `/api` apiGuard enforces; deletion widens no auth gap. | **yes** (removal verified by absence + importer-grep) | real-boundary-smoke (build/test green post-removal) | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned (attack-surface reduced) | VC-007 | aligned (verify Gate E) |
| REQ-008 | Guard test: dangerous tools (dispatch) off-by-default on the single HTTP surface, RED-on-revert | AC-010 | T-ASO-5 | TO BUILD — off-by-default test + RED-on-revert (EV-008) | planned → **yes** | unit-fake → integration | CAN-001 | CAN-002 | CAN-003 | CAN-009 | aligned | VC-008 | aligned (verify Gate E) |

### Deferred this iteration (Epic C — Backlog, NOT a working premise)

| REQ-ID | requirement | wired-in-prod? | evidence-class | canvas-risk-status | true-line-status |
|---|---|---|---|---|---|
| REQ-009 | OrderInputSchema / ProductTemplateSchema (types) | n/a | n/a (deferred) | blocked (deferred; build with a real consumer) | deferred |
| REQ-010 | Granular WorkflowState machine | n/a | n/a (deferred) | blocked (deferred; gate uses coarse stateMachine.ts) | deferred |
| REQ-011 | WorkflowEvent + Record contracts | n/a | n/a (deferred) | blocked (deferred) | deferred |

## Reality-Ledger notes (must not be laundered)

- **REQ-001 is the load-bearing P9 case.** Today `assertDispatchAllowed` has ZERO server-route
  callers (belegt: server/index.ts:231-234 → dispatchArtifact() direct). The row may NOT flip
  `wired-in-prod=yes` until an importer-grep shows the gate called on the live `/dispatch` route.
- **Spec-audit (Phase 0.7) premise corrections — must not regress:**
  - *BLOCKER-1:* the sole load-bearing money gate is **REQ-002 (approval record)**. aal2/sensitive
    is caller-auth (already at auth.ts:154 and still ungated today = C-1); `assertDispatchAllowed`
    reads `artifact.status` (a body field) = secondary shape-check. Do NOT present three co-equal
    money-path layers.
  - *BLOCKER-2:* `/dispatch` sensitive-classification is **already DONE** (auth.ts:154) — not counted
    as TO-BUILD work; only the record-consume + artifact-binding is TO-BUILD (the P9 case).
  - *BLOCKER-3:* "server state decides" (AC-002) is credited to the **approval-record leg**, never to
    `assertDispatchAllowed`. There is no RunRepository read-by-id (interfaces.ts = save-only), so the
    record's server-side (runId, artifactId) binding IS the server state; dispatched artifactId must
    equal the approved one (AC-002b).
  - *CONCERN-1 (value-truth):* in PRODUCTION (`sizhu.fufire.space`, VIS-001) dispatch is **fail-closed /
    non-functional this iteration** (prod approval store = throwing Supabase stub). Recorded plainly,
    requires explicit user acceptance at the USER GATE; never softened to "blocks safely".
- **REQ-005 is the only DONE row** (HTTP transport flag-gate, verified live 2026-06-15). All other
  in-scope rows are TO BUILD; cells show TARGET evidence-class.
- **Approval-record durability (OQ-005).** Restart-survival holds in DEMO_LOCAL (Local repo); in
  prod the Supabase stub throws ⇒ dispatch fail-closed. This is safe-by-blocking, recorded — not a
  silent in-memory shortcut (which would re-create the replay theatre the Council flagged).
- **Epic C deferral is recorded, never "done".** REQ-009/010/011 are backlog; Vision VIS-006 #4
  (granular contracts referenced by gate) is explicitly NOT delivered this iteration (PRD §Scope status).

## Coverage (sizhu-agent-safe-ops)

In-scope REQ-001..008 each bind to Vision, Canvas (all 6 mandatory fields), Acceptance Criteria,
Evidence, `wired-in-prod?`, `evidence-class`, and a True-Line check — no orphan. REQ-009/010/011
DEFERRED (Epic C backlog). **F1 BLOCKER resolved**: the matrix now carries the full required schema.
Open: OQ-005 (approval-store home — leading ASSUMPTION, confirm at Phase 0.5). No other open BLOCKER.

## Build outcome — Phase 3 (2026-06-17)

Phase 2 committed: T1 `85dc169`, T2 `10966cc`, T4 `645bd70`, T3 `cceeb34`, T6 `a0dd004`, T5 `9b614ca`.
T7 subsumed into REQ-008's already-green guard (M re-scoped 8→7). Full suite **462 passed / 0 failed /
1 skip** (the documented route-happy-path `it.skip`); tsc green. PRIL reality-check **PASS** at
`--min-evidence integration` (`docs/reality/sizhu-agent-safe-ops.evidence.jsonl`). The money path (T2/T3)
ran the full per-increment chain: code-review + security-review + Watcher.

| REQ | wired-in-prod | evidence-class | proof |
|---|---|---|---|
| REQ-001 | **yes** | real-boundary-smoke | gate @ `server/index.ts:279` (consumeApproval before dispatch); aso.dispatch.gate + aso.gate.wiredInProd green; P9 importer-grep |
| REQ-002 | **yes** | integration | LocalApprovalRepository; aso.approvalRecord 10/10; Stryker money-guards 100% killed (68.29% total — survivors are storage-env) |
| REQ-003 | **yes** | real-boundary-smoke | 501 NOT_IMPLEMENTED; aso.truthfulReads green |
| REQ-004 | **yes** | real-boundary-smoke | VALIDATION_SHAPE_ONLY (no bare READY_FOR_DISPATCH); aso.truthfulReads green |
| REQ-005 | **yes** | real-boundary-smoke | MCP_ENABLE_DISPATCH gate; live tools/list smoke 2026-06-15 |
| REQ-006 | **yes** | integration | single HTTP catalog post stdio-delete; aso.mcpCatalog 7/7 |
| REQ-007 | **yes** | real-boundary-smoke | server/mcp deleted (0 importers, CONCERN-3 cleared); tsc + suite green |
| REQ-008 | **yes** | integration | dispatch off-by-default guard; mutation-verified RED-on-revert |

Reality-Ledger caveats (carried, NOT laundered): **prod dispatch is fail-closed this iteration**
(CONCERN-1, user-accepted) — evidence is real-boundary via `createApp` + the real Local repo, NOT a
live POD/Supabase dispatch (deferred prod-store slice). **Mutation 68.29%** reflects untestable
storage-env survivors; the money-consume guards are 100% killed. Follow-ups: (a) survivor-hardening
(jsdom localStorage path), (b) un-skip aso.dispatch.gate.routes.test.ts:175 (route-happy-path) when an
approval-mint route + prod store land, (c) doc-cleanup of stale server/mcp references.

## User Confirmation (sizhu-agent-safe-ops)

The assistant must not confirm this matrix. Bestätigung erfolgt durch den Nutzer (Confirmation-Block im Chat).
