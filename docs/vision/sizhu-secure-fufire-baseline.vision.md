# Product Vision: sizhu-secure-fufire-baseline

Status: confirmed
Confirmed by user: yes
Confirmation date: 2026-06-13
Owner: product-owner

> This is a **customer-value framing**, not a re-statement of the PRD. It keeps product
> meaning owned by the user. Every item inferred beyond the user-confirmed Product Canvas
> stays under `Assumption:` until the user confirms it at the Phase 0.5 USER GATE. A
> PRD-only draft is **not** confirmed Product Vision; the product-owner does **not**
> self-confirm — the USER GATE flips `Status` and `Confirmed by user`.

## Traceability links

- vision-link: docs/vision/sizhu-secure-fufire-baseline.vision.md
- Product Canvas (user-confirmed, v2): docs/canvas/sizhu-secure-fufire-baseline.canvas.md
- PRD (confirmed): docs/prd/sizhu-secure-fufire-baseline.prd.md
- Request contract (authoritative): docs/contracts/fufire-api-reference.md
- Real response samples (bazi + wuxing): docs/contracts/fufire-samples/{bazi,wuxing}.response.json
- Traceability matrix: docs/traceability.md
- value-check-id: VCHK-SFB-001 … VCHK-SFB-007 (see QA Value Checks)
- true-line-status: pass (plumbline-watcher: no value contradiction / no drift; review-required cleared by user confirmation 2026-06-13)

---

## Target User

Explicit:
- **Primary (internal / operator):** the SizhuAtelier operator/admin who configures the
  middleware, triggers FuFirE test-runs, and releases fulfillment. Sensitive actions
  require an admin-capable role (`owner | admin | operator`) + MFA/AAL2.
- **Indirect (end customer):** the Etsy buyer in the "SizhuAtelier" shop who expects a
  personalized premium product whose BaZi / Wu-Xing content is correct and grounded in
  their own real birth data.
Assumption: none beyond canvas — both users are stated verbatim in canvas §2.
Missing: none for this run.
Source: canvas §2 (Status: CONFIRMED); user decision 2026-06-13 (owner/admin model only).
User decision: owner/admin role model is sufficient this run; no new admin-vs-operator
differentiation (canvas §2).

## User Problem

Explicit:
Today the operator has **no trustworthy, reproducible way** to get from an Etsy order to
verified BaZi/Wu-Xing personalization, because the middleware has two product-critical
defects:
1. A **config-bypass / SSRF primitive** — the generic `POST /api/fufire/*` proxy takes
   `baseUrl`, `fufirePath`, and `apiKeySecretRef` from the request body and fetches that
   arbitrary URL server-side with the FuFirE secret. It now sits behind `apiGuard`, but any
   *authenticated* caller can still steer where the server requests and which secret it reads.
2. **Wrong FuFirE request schemas** — current request bodies are simplified placeholders
   that do not match the documented FuFirE schemas, so correct, non-invented
   personalization is not guaranteed.
The end customer's adjacent problem: they could receive personalization that is *not*
actually grounded in their real birth data — i.e. invented meaning presented as theirs.
Assumption: none beyond canvas.
Missing: none for this run.
Source: canvas §1 (Status: CONFIRMED); code refs server/index.ts:196–262,
server/services/fufireDataService.ts:112–120.
User decision: —

## Desired Change

Explicit:
After this run, the operator can trigger a FuFirE test-run with normalized birth data and
trust that: (a) the server alone decides the FuFirE base URL / path / auth header / secret
— never the request body; (b) sensitive actions require role + MFA/AAL2; (c) the FuFirE
request bodies match the authoritative contract; (d) for bazi + wuxing, only real
FuFirE-sourced values are mapped into prompt variables — a missing field blocks rendering
rather than being guessed. The model gateway defaults to OpenRouter only. Production
persistence and Gelato dispatch stay *explicitly blocked* — no silent mock, no fake
dispatch success outside `DEMO_LOCAL`.
Assumption: the operator-facing UI (login / account-security views + FuFirE test-console
transfer UI) is the surface through which the operator experiences this change. (In scope
per canvas "Allowed change scope" + PRD §"In scope"; framed here as the human touchpoint —
mark for user confirmation.)
Missing: none for this run.
Source: canvas §4, §6; PRD §1 Goal, §2 acceptance.
User decision: REQ-D-001 = clean block only (`SUPABASE_NOT_CONFIGURED`), no real
persistence (canvas user-decision 2026-06-13).

## Core Value Promise

This is the **True-Line** — the value line that must NOT break, even if every test is green.

Explicit:
1. **No invented data.** No BaZi / Wu-Xing / zodiac / element / birth data is ever
   fabricated. For an in-scope operation, the system either maps a *real* FuFirE-sourced
   value or it blocks/controls-errors (`PROMPT_VARIABLE_SOURCE_MISSING`,
   `NO_GEOCODER_CONFIGURED`, etc.). This is a permanent constraint, not just a non-goal.
2. **No arbitrary / public backend access.** The server owns the FuFirE base URL, path,
   auth header, and secret. No request-body field may steer the outbound URL or which env
   secret is read. The fix is to **remove** the body-controlled primitive — not to
   re-auth it.
3. **Sharpened claim-discipline (avoids a category error):**
   - The deterministic **chart calculation** (chronometry → four pillars / Wu-Xing) may be
     described as *verifiable / correct / not invented* — it is deterministic
     (identical input → identical pillars, confirmed by two real samples).
   - **Exception:** the bazi **day-pillar anchor** is *engine-flagged `unverified`*
     (`derivation_trace.day.day_anchor_evidence.anchor_verification == "unverified"`,
     `provenance_ids.day_anchor_id = "...jdn_2419451_unverified"`). So "verifiable chart
     math" holds for year/month/time resolution but **not** the day pillar, which must be
     surfaced as provider-declared unverified — never laundered into "verified."
   - The FuFirE **interpretation / meaning** is generated output, **never** "verified
     truth." Correct phrasing: *"astronomically accurate chart calculation; interpretation
     by FuFirE."* This binds UI text, logs, reports, **and** the QA-gate statements — gates
     may certify *calculation* correctness only, never the interpretation.
Assumption: none — every clause is verbatim from the confirmed canvas / contract.
Missing: none for this run.
Source: canvas §4 (geschärftes Value-Promise), §7 (claim-discipline); contract §"Response
shapes" (day-pillar unverified caveat); PRD §1 claim-discipline.
User decision: value-promise split + claim-discipline adopted by user 2026-06-13 (canvas
Council-Amendment, Punkt 3).

## Why Now

Explicit:
The SSRF / config-bypass primitive is a live security exposure that must be removed before
any trustworthy operator workflow can ship; per council guidance it is sequenced **first
and standalone** as its own shippable increment. The authoritative FuFirE request contract
and real bazi + wuxing response samples are *now* available (user-supplied 2026-06-13),
which un-blocks correct request builders and verified bazi+wuxing mapping that were
previously unverifiable.
Assumption: business urgency beyond "security exposure + newly available contract/samples"
is not stated by the user; do not invent a market/deadline rationale. (Mark for user
confirmation if a stronger "why now" exists.)
Missing: explicit business timing rationale (deliberately not invented).
Source: canvas §8 (council sequencing A — SSRF first), canvas v2 evidence update; PRD §7 T1.
User decision: SSRF-fix first, as standalone increment (canvas Council-Amendment, Punkt 5
→ A).

## Non-Goals

Explicit:
- No Etsy webhook automation.
- No real Gelato order/draft dispatch while the Gelato contract/mapping is unsupplied —
  Gelato stays `MISSING_POD_CONTRACT`-blocked.
- No autonomous prompt-learning writeback without human review.
- No new paid provider dependency beyond Supabase / FuFirE / OpenRouter / Gelato.
- No real Supabase production persistence this run (Sprint 6 deferred) — but production
  mode must not silently fall back to mock/localStorage.
- No QG2 print-readiness / Gelato adapter implementation (Sprint 7 deferred).
- No response-mapping for `bazi_trace` or `chronometry/resolve` (no real samples) — those
  render-block; they stay `unverified` in the Reality Ledger.
- **Permanent constraint (not a mere non-goal):** no inventing of data; no "verified truth"
  claim for FuFirE interpretation.
Assumption: none.
Missing: none.
Source: canvas §7; PRD §1 "Out of scope", "Partly deferred".
User decision: deferrals adopted by user 2026-06-13.

## Why Now / North-Star boundary (scope of this run)

Explicit:
This run = the **secure FuFirE baseline**: Sprints 0, 1-verify, 2, 3, 5 **plus** bazi +
wuxing response-mapping (REQ-F-002/F-003 for those two operations only). In-scope REQ-IDs:
REQ-S-001, REQ-S-002, REQ-F-001, REQ-F-002 (bazi+wuxing), REQ-F-003 (bazi+wuxing),
REQ-A-001, REQ-A-002, REQ-D-001, REQ-O-001, REQ-O-002.
The **north-star** — a full autonomous Etsy → FuFirE → Gelato premium-personalization
pipeline with real persistence and a learning loop — is the long-term direction this
baseline *serves*, but it is explicitly **not** this run. The baseline is the trustworthy,
secure foundation the north-star later builds on.
Assumption: none — scope boundary is verbatim from canvas scope note + PRD §1.
Missing: none.
Source: canvas scope note + §10; PRD §1 in/out-of-scope.
User decision: baseline-only scope confirmed by user 2026-06-13.

## Success Signal

Explicit:
For this run the **technical gate criteria are the success measure** (a product-outcome
metric is deliberately deferred to a follow-up run). The Vision is fulfilled when:
- `GET /api/health` → 200 without auth; `POST /api/data-requests/fufire/test-run` →
  401/403 without valid auth/role/AAL2.
- FuFirE request bodies (chronometry, bazi, bazi_trace, wuxing) match the authoritative
  contract in unit tests, **asserted from service output, not from hardcoded literals**.
- The generic `/api/fufire/*` proxy is removed/disabled, with tests proving
  `fuFireConfig` / `fufirePath` / arbitrary-URL payloads are rejected/ignored and never
  steer the outbound URL or secret.
- For bazi + wuxing, `animal` / `element` / `birth_year` / `dominant_element` map from the
  **real samples**; a missing required field → `PROMPT_VARIABLE_SOURCE_MISSING` +
  render-block; the day-pillar `unverified` caveat is surfaced.
- OpenRouter is the only default gateway; no forced Gemini/OpenAI default secrets in
  default UI/env.
- Production mode returns `SUPABASE_NOT_CONFIGURED` (no silent mock/localStorage).
- Gelato dispatch produces no fake success outside `DEMO_LOCAL`.
- A verification log records green `npm run lint`, `npm run build`, `npm test`.
Assumption: none.
Missing: product-outcome metric (intentionally deferred — do not invent one).
Source: canvas §5 (Status: CONFIRMED); PRD §2 acceptance, §5 NFR, §8 DoR.
User decision: technical gate = success measure this run; outcome signal deferred
(canvas §5).

## Risks if Misbuilt

These are the shapes a build could take that pass tests yet **destroy the value** — the
explicit "wrong / harmful implementation" list against which the increment is judged.

Explicit:
- **Re-authing the SSRF proxy instead of removing it.** Concluding "it's behind `apiGuard`,
  so the SSRF/config-bypass is handled" is wrong — the body-controlled-URL/secret primitive
  must be *removed*. (BLOCKER shape; REQ-A-001 must not weaken to "only behind auth.")
- **Mapping prompt variables against guessed response shapes.** Mapping `bazi_trace` /
  `chronometry/resolve` (no real samples) as if verified, instead of render-blocking, is a
  fake-data violation.
- **Silent mock / localStorage in production.** Production mode falling back to mock/
  localStorage instead of returning `SUPABASE_NOT_CONFIGURED`.
- **Fake Gelato success outside `DEMO_LOCAL`.** Any mock dispatch success in a non-demo mode.
- **Claiming interpretation as truth.** Any UI text, log, report, or QA-gate statement that
  labels FuFirE *interpretation* as "verified truth", or labels the day-pillar anchor as
  verified — both violate the claim-discipline.
- **Demo-mode leakage.** Default app mode is `DEMO_LOCAL` (commit 4980ee9); a misbuild could
  let demo fake-success leak into a path read as production.
Assumption: none — each risk is drawn from canvas §7/§8 and PRD §1.
Missing: none.
Source: canvas §7, §8; PRD §1 (REQ-A-001 framing), §2 AC-A-001/AC-D-001/AC-O-002,
§5 claim-discipline NFR.
User decision: SSRF must be removed not re-authed; deferred ops render-block (user
2026-06-13). Per escalation-asymmetry, a deferred/`*-fake`/unwired I/O surface may only be
downgraded to "known limitation" by the **user** — no agent may.

## QA Value Checks

These are the customer-value checks QA must verify (the `VCHK-*` IDs). They prove **value**,
not only function — each maps back to the True-Line.

Explicit:
- **VCHK-SFB-001 — No invented data.** For an in-scope operation with a missing required
  source field, the system returns `PROMPT_VARIABLE_SOURCE_MISSING` and renders **no**
  guessed value. (REQ-F-002/F-003)
- **VCHK-SFB-002 — Server owns FuFirE config.** A request carrying `fuFireConfig` /
  `fufirePath` / `baseUrl` / `apiKeySecretRef` cannot change the outbound URL, header, or
  which secret env var is read; the generic proxy is gone. (REQ-A-001)
- **VCHK-SFB-003 — Real auth value for the operator.** `GET /api/health` open;
  sensitive routes require session + verified email + admin-role + AAL2 (correct 401/403
  codes). (REQ-S-001/S-002)
- **VCHK-SFB-004 — Verified mapping, honest caveat.** bazi + wuxing prompt variables map
  from the *real* samples; the day-pillar `unverified` status is surfaced, not laundered.
  (REQ-F-002 AC-F-002e)
- **VCHK-SFB-005 — Claim-discipline holds in user-visible text.** No UI/log/report string
  asserts FuFirE *interpretation* as objective/verified truth; only chart *calculation*
  (minus day pillar) may be called verified. (canvas §7 / PRD §5 NFR)
- **VCHK-SFB-006 — No fake success in production.** Production persistence →
  `SUPABASE_NOT_CONFIGURED`; Gelato dispatch → no mock success outside `DEMO_LOCAL`.
  (REQ-D-001, REQ-O-002)
- **VCHK-SFB-007 — Deferred ops are honestly blocked.** `bazi_trace` / `chronometry/resolve`
  response-mapping render-blocks and is recorded `unverified` (`integration-fake`) — not
  presented as working. (PRD §1 "Partly deferred", Reality Ledger)
Assumption: the VCHK IDs themselves are introduced by this Vision for QA traceability; the
*content* of each check is canvas/PRD-sourced. (Mark the ID scheme for user confirmation.)
Missing: none.
Source: canvas §5, §9; PRD §2 acceptance, §5 NFR.
User decision: —

## Honest evidence ceiling

Explicit:
- bazi + wuxing prompt-variable mapping is verified only at **`integration-fake`** this run —
  against **real captured samples**, *not* a live FuFirE call. This is the best achievable
  without live network and must be stated honestly in the Reality Ledger.
- `bazi_trace` and `chronometry/resolve` response-mapping are **render-blocked / unverified**
  (no real samples). They are not a working premise and must not be re-classified as one.
- The bazi **day-pillar anchor** is provider-declared `unverified`; only year/month/time
  chart resolution carries the "verifiable" claim.
- Request *builders* for all four operations are verifiable against the authoritative
  contract (`belegt`); only the *response* side carries the ceilings above.
Assumption: none.
Missing: none.
Source: canvas v2 evidence update, §8, §9; contract §"Response shapes" + §"Still MISSING";
PRD §5 test/coverage, §9 DEFERRED-UNVERIFIED.
User decision: deferral (not weakening) of the two unsampled operations confirmed by user
2026-06-13.

## User Confirmation

Explicit: **CONFIRMED by the user at the Phase 0.5 USER GATE (2026-06-13).** The user gave
the confirmation ("I confirm this Product Vision as the basis for AgileTeam planning.") and
explicitly acknowledged all three `Assumption:` items below as confirmed.
Acknowledged (Assumption → confirmed, user 2026-06-13):
1. Operator-/admin-facing UI (login / account-security + FuFirE test-console) IS the human
   value touchpoint for this run. → confirmed.
2. There is no deeper business "why now" beyond the live security exposure + the
   newly-available FuFirE contract/samples; no market/deadline rationale is claimed. → confirmed.
3. The `VCHK-SFB-001…007` ID scheme is the accepted QA value-traceability naming. → confirmed.
Missing: none (deployment-runtime MISSING items remain pre-live, outside this run's code).
Source: USER GATE (Phase 0.5), 2026-06-13.
User decision: PRD + Vision confirmed; all three assumptions confirmed.

Confirmation phrase given:

```text
I confirm this Product Vision as the basis for AgileTeam planning.
```

Status: **confirmed** (Phase 0.5 USER GATE)
Confirmed by: user (ben.poersch@gmail.com)
Confirmed at: 2026-06-13
Open contradictions: none found against the user-confirmed canvas v2, the confirmed PRD, or
the authoritative contract. The only carried tensions are the deliberate evidence ceilings
(bazi+wuxing at `integration-fake`; bazi_trace/chronometry render-blocked; day-pillar
`unverified`) — surfaced honestly, not contradictions.
