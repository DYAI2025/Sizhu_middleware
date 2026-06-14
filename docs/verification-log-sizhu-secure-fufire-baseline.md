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
| REQ-F-001 (request builders) | **real-boundary-smoke** (2026-06-14 live: built bodies → api.fufire.space HTTP 200; was unit-only) | yes | green |
| REQ-F-002 (bazi+wuxing interpret/map) | **production-verified (bazi-half: animal/element/birth_year, live call)** · dominant_element RED-for-confidence · caveat/render half wired-in-prod NO | yes (map half) | bazi-half green (live, provenance-confirmed); dominant_element RED (western-dominance / prompt-convention open); caveat half NO |
| REQ-F-003 (prompt-template render) | integration-fake | **NO** (T9 wired the F-002 map half; renderPromptTemplate still has zero prod importers — live consumer is the north-star pipeline; render-wiring deferred) | **RED** (render half not wired-in-prod; built primitive) |
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

---

## Live FuFire boundary smoke (2026-06-14, north-star slice #1)

Real authenticated calls to `api.fufire.space` via the already-wired path
(`buildBaziRequest`/`buildWuxingRequest` → `fufireDataService` live `fetch` → `resolvePromptVariables`).
Harness: `scripts/smoke/fufire-live-smoke.ts` (`npm run smoke:fufire`); evidence captured to
`docs/contracts/fufire-samples/{bazi,wuxing}.live-2026-06-14.response.json` +
`docs/reality/fufire-live-smoke-live-2026-06-14.report.json`. Subject synthetic (no PII).

**Harness result:** `✓ PASS` — readiness READY, bazi+wuxing HTTP 200, prompt variables bound
(animal=Horse, element=Metall, birth_year=1990, dominant_element=Holz), contract drift none,
secret-hygiene clean. LF3 drift guard proven (`--inject-drift` → RED).

**BUT the harness PASS was adversarially verified (4 independent lenses) and 2 REFUTED it** — the
single-harness green did not survive scrutiny. Honest outcome (NOT a clean green flip):

- **Lens: provenance — CONFIRM.** animal←chinese.year.animal, element←pillars.year.element,
  birth_year←transition.solar_year, dominant_element←wuxing.dominant_element. Each traces to a real
  live field; no defaults/guesses.
- **Lens: secret/PII — CONFIRM.** No key in any captured file or harness output; only the synthetic subject.
- **Lens: freshness — REFUTE.** The live Berlin wuxing was byte-identical to the captured 0,0 sample
  (same `wu_xing_vector`, `true_solar_time=14.4995`, `equation_of_time=-0.027`); only echoed
  `input.lat/lon` differed. A location-sensitivity probe (`npm run probe:fufire-location`, Berlin/
  Sydney/Quito, same instant) returned **identical output for all three** including `true_solar_time`.
  → **FINDING F-LIVE-1 — INVESTIGATED & RESOLVED (user chose "investigate deeper", 2026-06-14):**
  Live `wuxing` does not vary with lat/lon **or tz** (constant `true_solar_time` across 3 timezones).
  **This is NOT a bug — it is documented by-design behaviour.** The deeper probe + contract resolve it:
    - `npm run probe:fufire-location` (Berlin/Sydney/Quito, same instant): identical `wu_xing_vector`
      ⇒ location-invariant. Date probe (1990-06-15 vs 1975-11-23): vector + true_solar_time **change**
      ⇒ genuinely time-sensitive, a real engine, NOT hardcoded/cached.
    - The contract (`docs/contracts/fufire-api-reference.md`) + the fusion reference
      (`fufire-samples/fusion-and-vectormap.reference.json`) state the wuxing top-level
      `dominant_element` is the **WESTERN-vector** (geocentric, planet-rulership) dominance — which is
      location-invariant by construction. The fusion reference's `western_planets.Holz=0.6101955…`
      equals our live wuxing value exactly; its `bazi_pillars` (eastern/located) vector differs
      (dominant=Feuer). The **located/eastern** dominance is a separate **fusion** endpoint (north-star).
    Consequences:
    1. **AC-F-002f's premise was a misunderstanding** — a 0,0 `dominant_element` is NOT "wrong-location
       data" for the western vector; it is correct everywhere. The 0,0-trap guard
       (`fufireResponseInterpreter.ts:247`) is harmless but **not load-bearing** for this field
       (a candidate to simplify in a future reviewed slice; left as-is for now).
    2. **`dominant_element` stays RED-for-confidence — for a PRODUCT-SEMANTIC reason, not a technical
       one:** the western-vs-eastern dominance convention is an open prompt-design decision (contract:
       "Decide the convention in prompt design — do not invent"), and the located/eastern value needs
       the fusion endpoint. The binding itself is live-verified and faithful.
- **Lens: honest-caveat liveness — REFUTE → RESOLVED by FX3 (2026-06-14).** At verification time
  `interpretFufireResponse` (the day-pillar `anchor_verification` caveat-surfacing half) had **zero
  production callers** — `executeTestRun` called only `resolvePromptVariables`, so the `"unverified"`
  caveat (present in live bazi data) was never surfaced. **FX3 wired it**: `executeTestRun` now calls
  `interpretFufireResponse` per successful op → `result.responseInterpretation`, surfacing the caveat
  verbatim (code-reviewer SOUND, mutation RED-on-revert, importer grep confirms a prod caller). The
  REQ-F-003 **render** half (`renderPromptTemplate`) still has zero prod callers → `wired-in-prod = NO`
  (FX9/north-star).

**APPLIED reclassification (USER-confirmed "recommended honest set", 2026-06-14 — recorded in
`docs/reality/sizhu-secure-fufire-baseline.evidence.jsonl`, append-only):**
- **REQ-F-001 (request builders): `unit-only → real-boundary-smoke`** ✅. The live API accepted the
  built bazi + wuxing bodies (HTTP 200) — contract-correct against the REAL endpoint, not just unit
  assertions. (Pairs with the 94.74% mutation hardening of the same module.)
- **REQ-F-002 bazi-derived mapping (animal/element/birth_year): `integration-fake → production-verified`** ✅
  (SCOPED — see the jsonl carve-outs). Mapped from REAL live bazi with adversarially-confirmed provenance.

**Deliberately NOT upgraded (honest, carved out in the same jsonl entry):**
- **REQ-F-002 `dominant_element` / AC-F-002f:** stays RED-for-confidence — product-semantic
  (western-vs-eastern convention undecided; located dominance needs fusion), per F-LIVE-1 resolution.
- **REQ-F-002/F-003 caveat + render half (`interpretFufireResponse`/`renderPromptTemplate`):** stays
  `wired-in-prod = NO` (lens-4 confirmed zero prod callers).

**Config findings for prod/Railway (F-LIVE-2):** the service reads the FuFire key from
`process.env[SECRET_REF_FUFIRE_API_KEY]` and the base URL from `FUFIRE_BASE_URL`. The local `.env`
held the key under `FUFIRE_API_KEY` (bridged for the smoke + flagged). **On Railway the readiness
endpoint will report 503 NOT_READY unless the key is set under the secret-ref name
`SECRET_REF_FUFIRE_API_KEY`** (or `FUFIRE_API_KEY_SECRET_REF` points at the actual var). `FUFIRE_BASE_URL`
must be set (now present locally).
