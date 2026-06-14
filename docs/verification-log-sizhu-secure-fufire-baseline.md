# Verification Log — sizhu-secure-fufire-baseline (T8)

Feature: `sizhu-secure-fufire-baseline` · Branch: `feat/sizhu-secure-fufire-baseline` · PR #4
Generated: 2026-06-14 · Mode: CORE · Model: Opus (session)
HEAD: a113746 (T1–T7 + review fixes + dep advisory fix)

This is the **T8 verification log** + the **Gate A** record (Phase 3, hermetic). It aggregates the
mandatory baseline commands, the negative/boundary evidence, the Reality Ledger, and the honest
skip-if-unavailable items. "Tests green" ≠ "the assembled system delivers the user's value" — the
Reality Ledger below keeps that distinction explicit.

## Gate A — hermetic verification battery (2026-06-14T01:58Z)

| Check | Command | Result |
|---|---|---|
| Typecheck / lint | `npm run lint` (`tsc --noEmit`) | **PASS** (exit 0) |
| Build (deploy path) | `npm run build` (vite client → dist/ + esbuild server → dist/server.cjs) | **PASS** (exit 0; both artifacts produced; 5 pre-existing `import.meta` CJS warnings, benign — see note) |
| Unit + integration | `npm test` (vitest) | **PASS** — 163 tests / 20 files green |
| Dependency audit | `npm audit` | **PASS** — 0 vulnerabilities (esbuild/vite advisory cleared via override + es2022 target) |

### Skip-if-unavailable (CORE mode — honest, not silently passed)
- **e2e:** ABSENT. No `test:e2e` suite exists (documented MISSING in the PRD/sprint plan). API-level
  behavior is covered by supertest against the real `createApp()` composition root (security.matrix,
  fufire.ssrf, operational) — that is the highest-fidelity boundary available without a browser/live stack.
- **coverage threshold:** ABSENT. No coverage gate configured; not introduced this run.
- **mutation framework:** ABSENT. No Stryker/mutation tooling. Mutation testing was done **manually
  per-increment** with documented RED-on-revert proofs (idempotency determinism, SSRF sanitizer,
  wired-in-prod routing, validate-dispatch classification, _failure PII guard) — recorded in the
  per-increment reviews and commit messages.
- **import.meta build warnings:** pre-existing (`src/lib/app/appMode.ts`); in the CJS server bundle
  `import.meta` resolves to `{}` and `getAppMode()` correctly falls through to `process.env.APP_MODE`.
  Server-side mode resolution works; benign. Not introduced by this run.

## Negative / boundary evidence (failure modes turned into tests, not prose)
- 401/403 without auth; admin-role + AAL2 on sensitive routes — `security.matrix.routes.test.ts`.
- SSRF: body cannot steer outbound URL/header/secret; proxy removed (fetch-spy) — `fufire.ssrf.routes.test.ts`.
- FuFire request bodies match the authoritative contract, asserted from builder output (3 mutations bite) — `fufire.requestBuilders.test.ts`.
- No invented data: missing source → `PROMPT_VARIABLE_SOURCE_MISSING` + render-block; 0,0-location guard; day-pillar `unverified` surfaced — `fufire.responseInterpreter.test.ts`.
- Single-coordinate FuFire input → controlled `NO_GEOCODER_CONFIGURED` (not a malformed outbound call) — `fufire.testrun.validation.test.ts`.
- OpenRouter is the only default gateway, server-side; wired into the real runner (sentinel-config proves routing, not pass-through) — `openrouter.gateway.test.ts`, `modelGateway.openRouter.test.ts`, `modelGateway.wiredInProd.test.ts`.
- Production persistence fails closed (`SUPABASE_NOT_CONFIGURED`), no silent mock/localStorage; carve-out reads fail-safe — `persistence.boundary.test.ts`, `persistence.boundary.carveout.test.ts`, `config.appmode.consistency.test.ts`.
- Gelato: each branch returns its specific error_code; no `mock_success` outside DEMO_LOCAL; deterministic idempotency key (RED on Date.now); `_failure` branches carry no raw PII — `pod.dispatch.branches.test.ts`, `no-fake-success.mode.test.ts`, `pod.idempotency.test.ts`, `pod.failure.sanitization.test.ts`.
- No secret in any bundle / response / sanitized metadata — `bundle.secret-hygiene.test.ts` + secret-hygiene assertions across suites.

## Reality Ledger (per-REQ evidence-class — see docs/reality/sizhu-secure-fufire-baseline.evidence.jsonl)

| REQ | evidence-class | wired-in-prod? | RED-for-confidence? |
|---|---|---|---|
| REQ-A-001 (SSRF removed) | real-boundary-smoke | yes | green |
| REQ-O-001 (health/readiness) | real-boundary-smoke | yes | green |
| REQ-S-001 (default-deny) | real-boundary-smoke | yes | green |
| REQ-S-002 (role+MFA) | real-boundary-smoke | yes | green |
| REQ-F-001 (request builders) | unit-only | yes | green |
| REQ-F-002 (bazi+wuxing interpret) | integration-fake | **NO** (Gate C/D: interpreter built+sample-verified but ZERO prod importers — not on any live path; wiring deferred) | **RED** (not wired-in-prod + integration-fake, no live FuFire call) |
| REQ-F-003 (prompt mapping) | integration-fake | **NO** (same — renderPromptTemplate not invoked on any live path) | **RED** (not wired-in-prod + integration-fake) |
| REQ-A-002 (OpenRouter gateway) | integration-fake | yes | RED-for-confidence (model slugs unconfirmed vs live catalog; no live call) |
| REQ-D-001 (persistence boundary) | integration | yes | green (block-not-fake by design) |
| REQ-O-002 (Gelato safety+idempotency) | integration | yes | green (no live Gelato by design — deferred non-goal) |

**Honest confidence statement:** REQ-F-002/F-003 + the OpenRouter call path are verified only against
real captured samples / config, NOT a live FuFire/OpenRouter network call — they are
RED-for-confidence until a live-boundary smoke exists. bazi_trace + chronometry response-mapping are
deferred/render-blocked (no samples). Real Gelato dispatch + real Supabase persistence are
user-confirmed deferred non-goals. None of these is reported as "done"; each is surfaced verbatim.

## PRIL gate evidence (executable)
- `plumbline-context-check` → PASS (Canvas/PRD/Vision/Traceability all confirmed).
- `plumbline-scope-check` → PASS (all changed files within the user-confirmed Allowed change scope).
- `plumbline-reality-check --min-evidence integration` → PASS.
- `plumbline-redact --mode check` on the evidence ledger → PASS.
- Full Stop-hook simulation (scope+context+reality) → no block.

## Phase-3 gate outcomes (2026-06-14)
- **Gate A** (hermetic): CLEARED — see battery above.
- **Gate B** (security): pass-with-notes. No High/Critical. Important: FuFire test-run echoed raw
  birth PII in `sanitizedRequestMetadata` (fufireDataService.ts:159) — **FIXED** (now non-PII
  diagnostic; guard test `fufire.testrun.sanitization.test.ts`, mutation-verified RED on revert).
- **Gate C** (production-validator): pass-with-notes. All 10 in-scope REQ verified; REQ-F-002/F-003/
  A-002 = pass-red-confidence (integration-fake, no live call). Important: **REQ-F-002/F-003
  wired-in-prod over-stated yes→corrected to NO** (interpreter has zero production importers).
- **Gate D** (product-owner judgment): pass-with-notes — "builds the right thing"; same wired-in-prod
  over-statement surfaced (now corrected); RED-for-confidence items honestly carried, none laundered.
- **Gate E** (True-Line): PASS — line intact end-to-end; all 6 Canvas fields on all rows; no non-goal
  violated; RED ceilings surfaced verbatim.

## Open items routed to the USER ACCEPTANCE GATE
1. **REQ-F-002/F-003 wired-in-prod = NO** (corrected). The bazi+wuxing interpreter is built +
   sample-verified but not composed into a live path (executeTestRun returns the raw FuFire response
   unmapped). SCOPE DECISION for the user: wire it into executeTestRun now, or accept it as a
   built-but-unwired primitive with wiring deferred (REQ-F-002/F-003 then NOT fully done).
2. **FuFire test-run top-level `input` echo** (result.input returned to the admin): debatable —
   admin's own data, synchronous, not logged, not in a "sanitized"-named field. User decision: leave
   (test-console shows submitted input) or PII-strip the echo too.

## Status
Gates A–E cleared (B/C/D pass-with-notes, E pass; the two Important findings fixed/corrected).
Next: human USER ACCEPTANCE GATE with the two open items above.
