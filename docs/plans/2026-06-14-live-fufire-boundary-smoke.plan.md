# Plan — Live FuFire boundary smoke (north-star slice #1)

Status: DRAFT (plan only — not started)
Date: 2026-06-14 · Feature: sizhu-secure-fufire-baseline · REQ: REQ-F-002 (and REQ-F-001 end-to-end)
Canvas: docs/canvas/sizhu-secure-fufire-baseline.canvas.md · Vision: docs/vision/sizhu-secure-fufire-baseline.vision.md

## Goal
Turn the personalization core from **sample-verified** to **production-verified**: execute the
ALREADY-WIRED FuFire call path (`buildBaziRequest`/`buildWuxingRequest` → live `fetch` in
`fufireDataService.executeTestRun` → `resolvePromptVariables`) against the **real FuFire API** with
the **real secret**, and prove the live responses still satisfy the contract our interpreter assumes.
This is the cheapest real-boundary proof and the foundation every later pipeline stage personalizes from.

This is an **evidence slice**, not a feature slice. The code path exists (`fufireDataService.ts:343`).
What is missing is a real network round-trip and the captured evidence. Per the escalation-asymmetry /
no-laundering rule, the Reality-Ledger flip REQ-F-002 `integration-fake → production-verified` may be
made ONLY after a real run returns AND the USER confirms — no agent self-upgrades it.

## Non-goals (explicit — do not build here)
- Image-generation swarm, OpenRouter QA-gate live call, Gelato live dispatch, Etsy order ingest,
  real Supabase persistence — all later slices.
- F-003 render-half wiring (`renderPromptTemplate` live consumer) — stays NO; separate slice.
- A CI-blocking automated live test (needs the real secret + network + costs a real API call) — the
  smoke is an **opt-in, manually-run** harness, not a per-commit gate (same stance as the Stryker spike).
- chronometry / baziTrace response-mapping — `resolvePromptVariables` reads only bazi + wuxing.

## Preconditions and known gaps (USER must resolve before execution)
1. **Real FuFire API key** available in the run environment under the configured secret-ref
   (`SECRET_REF_FUFIRE_API_KEY`; `dataRequestConfig.secretRef`). Never committed, never logged.
2. **Correct live base URL + auth header** — `dataRequestConfig.baseUrl` defaults to
   `https://api.fufire.space`, but the console deploy is `sizhu.fufire.space`; the FuFire *API* host
   may differ from the *console* host. CONFIRM the API base (`FUFIRE_BASE_URL`) and the auth header
   name (`config.authHeaderName`, default `X-API-Key`) against `docs/contracts/fufire-api-reference.md`
   before the run. **This is the single most likely cause of a false-negative smoke.**
3. **Known-good input + expected values.** Use a SYNTHETIC subject (no real customer PII). The Berlin
   sample (`1990-06-15T14:30`, lat 52.52, lon 13.405, Europe/Berlin) already has captured expected
   values in `docs/contracts/fufire-samples/bazi.response.json` + `wuxing.response.json` — the smoke
   compares LIVE vs those samples.
4. **Network egress** to the FuFire host from the run location.
5. Known gap: this session does NOT hold the real key. I can author the harness and DRY-RUN it (with a
   stubbed fetch returning the captured sample) to prove the harness asserts correctly; the
   production-verified flip itself requires the real call, which the user runs / supplies the secret for.

## Task list

### LF1 — Live smoke harness (server-side, bypasses HTTP auth, exercises the real service)
- REQ: REQ-F-001, REQ-F-002
- Files: `scripts/smoke/fufire-live-smoke.ts` (new)
- What: instantiate `FuFireDataService`, call `executeTestRun` with the synthetic Berlin input and
  `requestedOperations: ["bazi","wuxing"]`. Read `FUFIRE_BASE_URL` + secret-ref from the real env
  (the service already does). Print: `requests`, `responses` (raw), `promptVariables`,
  `promptVariableIssues`, `gatewayIssues`, `readinessStatus`. Exit non-zero on any gatewayIssue or on
  a contract-invariant failure (LF3). Rationale for calling the SERVICE not the HTTP route: the auth
  layer (admin+MFA+aal2) protects the route, not the class; the boundary under test is FuFire, not our
  own authn. (A deployed-route check is LF5.)
- Tests/validation: dry-run with `FUFIRE_BASE_URL` pointed at a local stub (or a fetch stub) returning
  the captured sample → harness prints + passes. Then the REAL run (user-gated).
- Acceptance evidence: console transcript of a real run showing live bazi pillars + wuxing
  dominant_element mapped into `promptVariables`, zero gatewayIssues, `readinessStatus: READY`.

### LF2 — npm script + run protocol doc
- REQ: REQ-F-002, REQ-O-001 (operational)
- Files: `package.json` (`"smoke:fufire": "tsx scripts/smoke/fufire-live-smoke.ts"`),
  `docs/verification-log-sizhu-secure-fufire-baseline.md` (append a "Live FuFire smoke" protocol).
- What: document EXACTLY how to inject the real secret (env var name, never inline), how to set
  `FUFIRE_BASE_URL`, expected output, and the pass/fail criteria. State the cost (one real API call).
- Acceptance evidence: `npm run smoke:fufire` runs the harness; doc lists the precise secret/env wiring.

### LF3 — Contract-drift guard (the real value of the slice)
- REQ: REQ-F-001, REQ-F-002 (AC-F-002: "no invented data")
- Files: assertions inside `scripts/smoke/fufire-live-smoke.ts` (+ optional shared
  `server/contracts/fufireResponseInvariants.ts` if reused by tests).
- What: assert the LIVE response carries the exact keys the interpreter reads — bazi:
  `pillars.year.{stamm,zweig,tier,element}`, `chinese.year.animal`, `transition.solar_year`,
  `derivation_trace.day.day_anchor_evidence.anchor_verification`; wuxing: `dominant_element` with the
  source coords matching the subject (the 0,0 trap is already guarded in the interpreter). On ANY
  missing/renamed key → FAIL LOUD with the drift (do NOT silently mismap). This converts "FuFire
  changed its shape" from a silent personalization corruption into a loud, actionable failure.
- Acceptance evidence: deliberately break one expected key in the dry-run stub → harness exits non-zero
  naming the drifted path (RED proof the guard bites), then restore.

### LF4 — Capture live sample + Reality-Ledger flip (USER-gated)
- REQ: REQ-F-002
- Files: `docs/contracts/fufire-samples/bazi.live-2026-06-14.response.json` +
  `wuxing.live-2026-06-14.response.json` (new, synthetic subject only — no PII),
  `docs/reality/sizhu-secure-fufire-baseline.evidence.jsonl` + the Reality Ledger table in the
  verification log.
- What: after a SUCCESSFUL real run, save the live responses as dated samples; THEN (and only then,
  with USER confirmation) flip REQ-F-002 `integration-fake → production-verified`, `wired-in-prod: yes`
  stays, RED-for-confidence → green. If the live run reveals drift (LF3 fails), do the opposite: record
  the drift honestly and spawn a fix slice — never launder a failed smoke into a pass.
- Acceptance evidence: dated live sample committed; ledger row updated with the real-run reference;
  USER confirmation recorded.

### LF5 — (Optional) deployed-artifact check
- REQ: REQ-O-001, REQ-S-002
- Files: `docs/verification-log-...md` (append).
- What: per the global "verify the deployed artifact, not just local + tests" rule — hit the REAL
  Railway `/api` test-run endpoint with a real admin+MFA (aal2) session token and confirm the assembled,
  deployed system (real injected secret/env) returns the same live personalization. Catches config/env
  wiring bugs invisible to a local harness.
- Acceptance evidence: deployed-endpoint transcript (token redacted) with READY + mapped variables.

## Risks and rollback
- **Base-URL / auth-header mismatch** (highest risk) → false-negative smoke. Mitigation: LF preconditions
  #2; confirm against the contract doc first; the harness prints the resolved URL (host only, no secret).
- **Secret hygiene** — the key must never be logged or echoed. The service already sanitizes
  (`sanitizedRequestMetadata` carries no key; `bundle.secret-hygiene.test.ts` guards bundles). The
  harness must print the resolved URL host only, never headers. Add an explicit "no secret in output"
  self-check.
- **Rate limiting / 401 / timeout** — surfaced as the existing controlled gateway issues
  (FUFIRE_RATE_LIMITED / FUFIRE_UNAUTHORIZED / FUFIRE_TIMEOUT); the harness reports them, exits non-zero.
- **Live contract drift** — that is the point (LF3); a drift is a real finding, recorded honestly,
  routed to a fix slice. Not a smoke failure to paper over.
- **Rollback**: the slice is almost entirely additive (one script, one npm script, docs, dated samples).
  No production code change is required — the fetch already exists. Reverting = delete the script + npm
  entry + sample files; zero runtime impact. The only non-additive act is the Reality-Ledger flip, which
  is reversible text and USER-gated.

## What I can do now vs what needs the user
- **Now (no secret):** author LF1–LF3 (harness + drift guard) and DRY-RUN them against a fetch stub
  returning the captured samples — proving the harness + guard work and bite (RED on injected drift).
- **Needs the user:** the real `SECRET_REF_FUFIRE_API_KEY` value + confirmed `FUFIRE_BASE_URL`, then
  run `npm run smoke:fufire` (or I run it once the secret is in the session env). Only the real-run
  evidence + USER confirmation authorizes LF4 (the production-verified flip).
