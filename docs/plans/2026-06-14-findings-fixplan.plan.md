# Fixplan — all open findings (sizhu-secure-fufire-baseline)

Status: DRAFT (plan only — not started)
Date: 2026-06-14 · Feature: sizhu-secure-fufire-baseline
Sources: verification log (Gate A–E + Live-smoke addendum), Stryker spike, live-smoke F-LIVE-1/2,
Reality Ledger carve-outs.

## Goal
Close every open finding from the secure-FuFire baseline + the north-star slice #1 with concrete,
independently-executable tasks — each with its own tests + acceptance evidence — without laundering
any RED item green. Product-semantic decisions are isolated as explicit USER-decision tasks.

## Non-goals
- Building the full north-star pipeline (image swarm, Gelato live, Etsy ingest, Supabase persistence)
  — those are separate slices; only the findings that block or mislead are in scope here.
- Flipping any Reality-Ledger class without its paired evidence + (for upgrades) USER confirmation.

## Preconditions and known gaps
- Secrets present in local `.env` (`FUFIRE_API_KEY`, `FUFIRE_BASE_URL`, `OPENROUTER_API_KEY`).
- Live network egress to api.fufire.space + openrouter.ai from the run host.
- USER decisions required for FX4 (dominant convention), FX5 (guard removal), FX8 (input-echo PII).
- No new runtime provider dependency may be added (canvas constraint). Dev/test deps OK.

---

## Findings → tasks

### FX1 — Secret-ref env-name correctness + harmonization  (F-LIVE-2)
- Finding: FuFire key must live under `SECRET_REF_FUFIRE_API_KEY` (indirect default); local `.env`
  used `FUFIRE_API_KEY` → bridged for the smoke only. On Railway, `/api/readiness` = 503 until the
  canonical var is set. OpenRouter has the INVERSE default (`OPENROUTER_API_KEY` direct), but
  `.env.example` ships `OPENROUTER_API_KEY_SECRET_REF=SECRET_REF_OPENROUTER_API_KEY`, so the same trap
  reappears on a deploy that copies that line. The two providers' defaults are inconsistent.
- REQ: REQ-O-001, REQ-A-002, REQ-F-002.
- Files: `docs/deployment/railway.md` (document the exact canonical var names per provider),
  `.env.example` (FuFire clarified already 2026-06-14; mirror the same clarity for OpenRouter),
  optionally `src/lib/apiConnections/dataRequestConfig.ts` + `src/lib/modelGateway/openRouterGateway.ts`
  (harmonize the default secret-ref convention — pick ONE: indirect-by-default for both, or direct).
- Tests: `server/tests/operational.routes.test.ts` — add a case asserting readiness reports
  NOT_READY when the FuFire key sits under the WRONG var and READY only under the secret-ref name
  (RED-on-revert proof for the indirection).
- Acceptance: a deployed `/api/readiness` returns READY with the documented var names; the new
  readiness test goes RED if the secret-ref resolution regresses.
- Rollback: docs + test only (+ optional config harmonization behind no behaviour change for the
  current local setup); revert the edits.

### FX2 — OpenRouter live QA-gate smoke  (REQ-A-002 → production-verified)
- Finding: REQ-A-002 is RED-for-confidence — gateway built, model slugs marked unverified vs the live
  catalog, NO live call. Key already in `.env`.
- REQ: REQ-A-002.
- Files: `scripts/smoke/openrouter-live-smoke.ts` (new; mirror the FuFire smoke pattern — real call,
  host-only logging, secret-hygiene self-check, contract/capability assertion), `package.json`
  (`smoke:openrouter`), `docs/reality/*.evidence.jsonl` (USER-gated flip after a real run).
- Pre-check (anti-konfabulation): confirm OpenRouter key resolves locally (default `OPENROUTER_API_KEY`)
  AND verify the default model slugs exist in the live `/models` catalog — drift here is the whole point.
- Tests: dry-run with a stubbed fetch (PASS) + a slug-drift injection (RED). The real run is opt-in.
- Acceptance: real OpenRouter call returns a completion for the default QA-gate slug; default slugs
  confirmed against the live catalog; USER confirms `integration-fake → production-verified`.
- Rollback: additive (script + npm + samples); delete to revert. No product-code change.

### FX3 — Wire the day-pillar caveat onto the live path  (REQ-F-002 caveat half)
- Finding: `interpretFufireResponse` (surfaces the provider day-pillar `anchor_verification` caveat
  verbatim) has ZERO production callers — `executeTestRun` calls only `resolvePromptVariables`. The
  caveat IS in live bazi data but never surfaced (lens-4 refute).
- REQ: REQ-F-002 (AC-F-002e), REQ-F-003 (AC-F-003c).
- Files: `server/services/fufireDataService.ts` (call `interpretFufireResponse` per successful op
  after the fetch loop; attach its caveats/issues to the result, ADDITIVE — never relabel), the
  `FuFireTestRunResult` type (add a `responseCaveats`/`interpretation` field).
- Tests: `server/tests/fufire.testrun.*.test.ts` — assert the live/sample bazi run surfaces
  `day-pillar anchor_verification: <value>` on the result; mutation RED-on-revert (drop the wiring →
  caveat disappears → test RED). Pairs with a wired-in-prod importer grep (P1).
- Acceptance: the caveat appears on the executeTestRun result; importer grep shows
  `interpretFufireResponse` has ≥1 production caller → its wired-in-prod flips NO→yes (earned).
- Rollback: additive field + one call site; revert the call + field.

### FX4 — dominant_element dominance convention  (USER DECISION → REQ-F-002)
- Finding: `dominant_element` stays RED-for-confidence — the wuxing top-level value is the WESTERN
  (geocentric) dominance; the located/EASTERN dominance needs the fusion endpoint. The product
  convention is undecided (contract: "Decide the convention in prompt design — do not invent").
- REQ: REQ-F-002 (AC-F-002a/f), REQ-F-003.
- Decision (USER): (a) use western (wuxing, already live) and document it as the chosen meaning, or
  (b) use eastern/located (requires FX9b fusion integration), or (c) carry both with distinct prompt
  variables.
- Files (after decision): `server/services/fufireResponseInterpreter.ts` (label/source per decision),
  prompt-template design docs.
- Tests: assert the chosen source path + label; if (c), assert both vars resolve independently.
- Acceptance: decision recorded; interpreter binds per the decision; `dominant_element` (or its
  renamed successors) leaves RED with USER confirmation.
- Rollback: revert the interpreter label/source change.

### FX5 — Retire the now-theater 0,0-trap guard  (decision-gated on FX4)
- Finding: AC-F-002f's 0,0-trap premise is empirically false for the western vector (location-invariant
  by design). The guard (`fufireResponseInterpreter.ts:247` `wuxingMatchesSubject`) is harmless but
  not load-bearing.
- REQ: REQ-F-002 (AC-F-002f — to be amended).
- Files: `server/services/fufireResponseInterpreter.ts` (remove/replace the location guard for the
  western field; KEEP a guard if FX4 chooses eastern/located, where location IS load-bearing),
  `server/tests/fufire.responseInterpreter.test.ts` (update the 0,0 cases), PRD/AC text for AC-F-002f.
- Tests: replace the 0,0-block assertions with the FX4-correct behaviour; mutation proof on whatever
  guard remains.
- Acceptance: interpreter behaviour matches the FX4 decision; no dead guard claimed as protection; AC
  text updated honestly (the old premise documented as corrected).
- Rollback: the guard is small + pure; revert the edit + tests.
- NOTE: do NOT do FX5 before FX4 — the right guard depends on the chosen dominance.

### FX6 — Extend Stryker to the other critical pure modules
- Finding: only `fufireRequestBuilders.ts` is mutation-hardened (94.74%). Spike rec #1: cover the
  curated critical list.
- REQ: cross-cutting (REQ-F-002, REQ-O-002, REQ-S-002, REQ-F-001).
- Files: `stryker.config.json` (add the module list), new value/branch tests per module, append
  scores to `metrics/mutation-baseline.json`.
- Targets (priority): `server/lib/jwt.ts` (security-critical HS256 verify), `server/services/
  podDispatchService.ts` (deriveIdempotencyKey + _failure sanitization), `server/services/
  fufireResponseInterpreter.ts`, `server/services/fufireOperations.ts`,
  `server/services/birthInputNormalizer.ts`.
- Tests: per module, raise survivors into value/branch assertions (the requestBuilders playbook);
  document equivalent mutants, never fake-kill.
- Acceptance: each target module has a recorded mutation score + a survivor analysis; an independent
  reviewer confirms HONEST (no inflation). jwt.ts especially must be high (security floor).
- Rollback: test-only additions + config; revert.

### FX7 — Resolve the qs DoS audit (2 moderate, Stryker deps)
- Finding: adopting Stryker took npm audit 0 → 2 moderate (`qs` DoS GHSA-q8mj-m7cp-5q26, dev/build-time).
- REQ: REQ-S-002 (supply-chain hygiene).
- Files: `package.json`/`package-lock.json` (npm `overrides` to a patched `qs`, mirroring the prior
  esbuild override pattern), or document an accepted-risk note if no compatible patch exists.
- Tests: `npm audit` returns 0 (or the accepted-risk note is recorded + the advisory is dev-only,
  proven by `npm audit --omit=dev` = 0).
- Acceptance: `npm audit` 0 OR a recorded, justified accepted-risk with the dev-only proof; build green.
- Rollback: remove the override; revert.

### FX8 — FuFire test-run top-level `input` echo  (USER DECISION → PII)
- Finding: `executeTestRun` returns `result.input` (the admin's submitted birth data) verbatim. Open
  item from Gate review — admin's own data, synchronous, not logged, not in a `sanitized`-named field.
- REQ: REQ-F-002 (PII discipline).
- Decision (USER): leave (the test console shows what was submitted) OR PII-strip the echo.
- Files (if strip): `server/services/fufireDataService.ts` (`FuFireTestRunResult.input`),
  `src/components/FuFireTestConsole.tsx` (if it depends on the echo).
- Tests: if strip — guard test asserting no raw birth date/name in the result.input (or its removal);
  mutation RED-on-revert.
- Acceptance: decision recorded; if stripped, guard test green + console still functional.
- Rollback: revert the field change.

### FX9 — F-003 render-half wiring (north-star dependency)
- Finding: `renderPromptTemplate` (F-003 render half) has zero prod callers — its only consumer is
  the north-star prompt-render pipeline (image-gen uses MOCK personalization in DEMO_LOCAL).
- REQ: REQ-F-003.
- Sub-tasks: FX9a wire `renderPromptTemplate` into the real prompt-build path that feeds image-gen
  (depends on FX4 vars); FX9b (optional) integrate the fusion endpoint for eastern/located dominance
  if FX4 chose it.
- Files: `src/lib/workflow/runner.ts` (real prompt build from FuFire vars), interpreter,
  fufireDataService (fusion op if FX9b).
- Tests: render-block when a required var is missing (already covered) + a wired-in-prod importer
  grep; live/sample end-to-end prompt render.
- Acceptance: `renderPromptTemplate` has ≥1 production caller → F-003 wired-in-prod NO→yes (earned).
- Rollback: larger — gate behind a flag; revert the runner wiring.
- NOTE: this is north-star-scoped; sequence after FX2/FX3/FX4.

### FX10 — PRIL hook path-drift (infra, low)
- Finding: the Plumbline Stop-hook hardcodes repo-relative `config/claude/bin`; the install is global,
  bridged by gitignored shims. Brittle across machines.
- REQ: governance infra (not a product REQ).
- Files: the hook/shim wiring (gitignored, local infra — out of the product repo's committed scope).
- Tests: a dry-run of the Stop-hook resolves the global CLIs without the repo-relative shim.
- Acceptance: hook runs on a fresh clone without manual shim creation.
- Rollback: keep the shims.

---

## Suggested execution order
1. **FX1** (prod-blocking config) · **FX7** (audit hygiene) — fast, unblock deploy + clean audit.
2. **FX3** (cheap honest caveat wiring) · **FX2** (OpenRouter live smoke — next confidence slice).
3. **FX6** (mutation discipline on jwt/idempotency/interpreter) · **FX8** (small PII decision).
4. **FX4** (USER dominance decision) → then **FX5** + **FX9** (depend on FX4).
5. **FX10** (infra, opportunistic).

## Cross-cutting risks & rollback
- **No-laundering:** every RED→green flip in FX2/FX3/FX4/FX9 needs paired live/importer evidence + (for
  upgrades) USER confirmation; adversarially verify high-stakes flips (as done for slice #1).
- **Secret hygiene:** all live smokes (FX2) reuse the host-only-logging + secret-hygiene self-check
  pattern from `scripts/smoke/fufire-live-smoke.ts`.
- **Scope:** FX5/FX9 touch interpreter/runner PRODUCT code → each is its own reviewed slice
  (code-reviewer + security + watcher), never bundled.
- **Rollback:** FX1/FX2/FX3/FX6/FX7/FX8 are additive or single-call-site → trivially revertible;
  FX4/FX5/FX9 are behaviour changes → gate behind flags / isolate per slice.
