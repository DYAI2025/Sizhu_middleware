# Product Vision: sizhu-live-generate-qa-loop (Slice A)

Status: **user-confirmed** (User, 2026-06-15 — confirmed at the USER GATE after the Phase 0.7 F1/F2 remediation; true-line-status flips to `pass` once plumbline-watcher returns `pass`)
Confirmed by user: yes
Confirmation date: —
Owner: product-owner

> This is a **customer-value framing**, not a re-statement of the PRD. It keeps product
> meaning owned by the user. The product-owner does **not** self-confirm — only the user
> flips `Status` to `confirmed` at the Phase 0.5 USER GATE. Every item inferred beyond the
> user-confirmed Product Canvas / confirmed-resolutions stays under `Assumption:` until the
> user confirms it.
>
> **HONESTY FRAMING (load-bearing — encoded so it is never overclaimed).** This slice
> delivers a real **CAPABILITY** — the first real link of the north-star pipeline: real
> OpenRouter models in the generate→QA loop, run server-side, provably and safely, within a
> hard cost cap. It does **NOT** yet deliver operator-facing **end-to-end customer value**:
> there is no Etsy order input, no Gelato output, images are ephemeral, and "success" is a
> flag-gated real-boundary smoke going green — **not** a console-UI workflow. The Vision
> states value honestly at the capability level: *the loop runs against real models,
> provably, safely, within a cost cap.* It makes **no** end-to-end POD value claim. The
> Reality Ledger classes this slice as **capability-wired, not end-to-end-value**.

## Traceability links

- vision-link: docs/vision/sizhu-live-generate-qa-loop.vision.md
- Product Canvas (user-confirmed, re-confirmed after Council 2026-06-15): docs/canvas/sizhu-live-generate-qa-loop.canvas.md
- PRD (user-confirmed 2026-06-15): docs/prd/sizhu-live-generate-qa-loop.prd.md
- Prior confirmed baseline Vision: docs/vision/sizhu-secure-fufire-baseline.vision.md (FuFire + OpenRouter gateway = REQ-A-002)
- Traceability matrix (feature section "sizhu-live-generate-qa-loop (Slice A)"): docs/traceability.md
- value-check-id: VCHK-LGQ-001 … VCHK-LGQ-007 (see QA Value Checks)
- true-line-status: **pass** (Phase 0.7 BLOCKERs F1 + F2 corrected via the single remediation pass; **user re-confirmed #4 (PII redaction at the outbound OpenRouter request body / compiled prompt) + #5 (cost-cap per-product worst-case 6 ≈ $0.23, cap 12/$1.00 ceiling) on 2026-06-15**; canvas+PRD+Vision+traceability all user-confirmed; PRIL context-check + scope-check pass; plumbline-watcher dev-entry re-run confirms. The notes below document the correction history; the corrected values are authoritative.)
- north-star context (NOT this slice): Etsy order → FuFire personalization → image-swarm → LLM quality-gate → Gelato dispatch, live.

### REQ → value-claim → VCHK mapping (matrix-aligned)

| REQ-ID | matrix value-claim | VCHK |
| --- | --- | --- |
| REQ-LGQ-001, REQ-LGQ-002, REQ-LGQ-003, REQ-LGQ-008 | V-real | VCHK-LGQ-001 |
| REQ-LGQ-002, REQ-LGQ-007 | V-nofake | VCHK-LGQ-002 |
| REQ-LGQ-003 | V-approval | VCHK-LGQ-003 |
| REQ-LGQ-005 | V-nopii | VCHK-LGQ-004 |
| REQ-LGQ-004 | V-cap | VCHK-LGQ-005 |
| REQ-LGQ-006 | V-prov | VCHK-LGQ-006 |
| REQ-LGQ-008 | S-smoke | VCHK-LGQ-007 |

---

## Target User

Explicit:
- **Primary (internal / operator):** the POD shop operator/admin of the Bazzi console
  (astrology-personalized print-on-demand for Etsy). They configure quality gates and
  trigger / observe workflow runs. To run the real loop they must hold an admin-capable role
  (`owner | admin | operator`) **and** pass MFA/AAL2 — the new run endpoint is **sensitive**
  because it spends real money on models.
- **Out of scope this slice — the Etsy buyer (end customer).** No real customer data, no
  order, no money-to-customer, no fulfillment is involved; the generate→QA loop has no
  money/fulfillment leg. The only real spend is OpenRouter model cost, hard-capped.
Assumption: none beyond canvas — both framings are verbatim from canvas §2.
Missing: none for this run.
Source: canvas §2; matrix U-op; PRD §3 REQ-LGQ-003 (sensitive: admin + MFA/aal2).
User decision: R1/R2 RESOLVED — server-side run endpoint, classified `sensitive`
(canvas §7a; user 2026-06-15).

## User Problem

Explicit:
Today the generate→QA→escalate loop is fully built and exercised, but **only against mock
providers**. `appServices.ts` wires `MockImageGenerationProvider` + `MockQualityGateProvider`
into a **client-side** runner; the mock image provider returns inline SVG data URIs and never
touches the network. The OpenRouter gateway is **selection-only** — it validates a model id
and capabilities but makes **no** HTTP image/chat call. The only code that has ever hit
OpenRouter over the wire is the standalone flag-gated smoke harness, which is not a reusable
provider. **Net: the loop has never produced a real generated image scored by a real vision
model.** The operator can only run placeholder SVGs + mock QA scores in `DEMO_LOCAL`, or run
a developer smoke by hand — neither is a product capability.
Assumption: none beyond canvas.
Missing: none for this run.
Source: canvas §1, §3; matrix P-loop; PRD §1, §2 anchors.
User decision: —

## Desired Change

Explicit:
After this slice, the operator can trigger a workflow run on a **server-side path** that
executes the real generate→QA loop against **real OpenRouter models** — so an
accepted/escalated outcome reflects real model behavior instead of a mock. The provider seam
is unchanged (`ImageGenerationProvider.generate` / `QualityGateProvider.evaluate`); only the
implementations behind it become real, and they run server-side where the server-only
OpenRouter key lives — the client never sees the key. The change is delivered **without
breaking any value promise**: no fake-success, no PII leak to OpenRouter, a hard per-run cost
cap that bites, per-candidate provenance + per-run cost/rejection telemetry, and — critically
— **no dispatch leg is added**: on accept the run stops at `pod_ready`;
`dispatchManualApproval()` remains the only POD trigger and `assertDispatchAllowed` is
untouched.

Honest scope of the "change the operator experiences": for THIS slice the experienced surface
is the **flag-gated real-boundary smoke going green** (canvas §5 RESOLVED), *not* a
console-UI workflow. The operator-facing console run UI is a later, larger slice.
Assumption: none — the capability-vs-UI boundary is verbatim from canvas §5/§7a (success =
smoke, not UI).
Missing: none for this run.
Source: canvas §4, §6, §7a; PRD §1, §3; matrix V-real/V-approval.
User decision: §5 RESOLVED — success = flag-gated real-boundary smoke, no console UI this
slice (user 2026-06-15).

## Core Value Promise

This is the **True-Line** — the value line that must NOT break, even if every test is green.
Carried **verbatim** from the user-confirmed value promise (canvas §4), framed at the honest
capability level.

Explicit:
1. **No invented data.** Personalization stays honest; nothing about the chart/meaning is
   fabricated. (Carry-over of the baseline True-Line; FuFire personalization is already live,
   REQ-A-002 production-verified, and is not re-opened here.)
2. **No fake-success.** A real OpenRouter response that diverges from the assumed shape, or a
   non-2xx HTTP error (e.g. the 402 an over-large `max_tokens` returns), **FAILS LOUD** — the
   providers never synthesize a placeholder image or a passing score, never record a
   fake-`accepted` artifact.
3. **Human-approval-before-live-dispatch invariant PRESERVED.** QA-accepted alone is NOT
   sufficient for a live customer/money-affecting dispatch. **This slice adds NO dispatch leg
   at all** — the run stops at `pod_ready`; the promise is preserved by not adding one. The
   slice MUST NOT weaken `assertDispatchAllowed` or auto-dispatch on accept.
4. **No PII leak.** Birth data must never cross the OpenRouter boundary or appear in any log,
   error, prompt-on-status, returned metadata, or `qaResultJson` surface. The redaction MUST
   send to OpenRouter ONLY content that contains no raw birth fields — never `name`,
   `birth_date`, or `birth_place`. (A4 hard constraint; baseline P2 origin was a
   `sanitizedRequestMetadata` echo of birth data.)
   > **CONTESTED — pending the single remediation pass (spec-auditor F2, 2026-06-15).** The
   > original wording — "providers receive `customerData`/`resolvedVariables` (which carry
   > birth data); send ONLY the already-rendered prompt" — is **WRONG and dangerous**, verified
   > against the real code. `runner.ts:272-279` passes `generationParams`
   > (`{productTitle, orderNumber, animal, element, dominant_element, iteration}` — already
   > **non-PII** derived vars) as the `customerData` arg, and `personalizationVars` (also
   > non-PII derived) as `resolvedVariables`. The **raw PII** (`name`/`birth_date`/`birth_place`)
   > is embedded in the **compiled prompt** (`runner.ts:232-247,252,281`). So "send only the
   > rendered prompt" points the redaction at the **exact carrier of PII** — a sentinel guard
   > written against this clause would be **green-while-leaking** (cardinal-miss). The corrected
   > constraint: redaction must operate on **prompt rendering** (strip/avoid name/date/place
   > from the template payload before it reaches the provider), and the AC-LGQ-005a sentinel
   > test must inject birth tokens into the **prompt-template path** and assert they do not
   > cross the boundary. This changes a **PII acceptance criterion** → must be corrected in the
   > canvas (A4) + PRD (REQ-LGQ-005) and **re-confirmed by the user**, not silently adopted here.
5. **HARD cost/quantity cap per run.** Both a max-real-image-call integer AND a per-run $
   spend ceiling, server-enforced, **derived** from the active config worst-case, plus headroom
   → default **12 images / $1.00**, configurable on `GenerationConfig`. Real OpenRouter image
   calls are real money, so the cap is load-bearing, not decorative.
   > **CONTESTED — pending the single remediation pass (spec-auditor F1 BLOCKER, 2026-06-15).**
   > The original derivation — "`numInitiallyGenerated × maxRejectedBeforeEscalation` ≈ 9 images
   > ≈ $0.35/run" — is a **confabulation**, verified against the real config. **No single config
   > object yields 9.** `prod-001` (the only OpenRouter-configured product):
   > `numInitiallyGenerated=3` (`localRepository.ts:123`) × `maxRejectedBeforeEscalation=2`
   > (`localRepository.ts:164`, **not** `:179`) = **6 images ≈ $0.23**. `prod-002`:
   > `2` (`:137`) × `3` (`:179`) = **6 images ≈ $0.23**. The "9" was manufactured by crossing
   > `3` from prod-001 with `3` from prod-002 — two different products — which is exactly the
   > blind-guess-dressed-as-derivation that Council amendment A3 was adopted to forbid. The cap
   > (12) is still safe (12 > 6), but the **derivation the spec sells as `belegt` is false**.
   > Corrected: real per-product worst-case = **6 images ≈ $0.23**; re-justify 12/$1.00 as
   > headroom above the real 6. Must be corrected in canvas (A3) + PRD (NFR-1, AC-LGQ-004c) and
   > propagated; not silently adopted here.
6. **Artifact provenance + telemetry.** Each candidate records its provenance (model id +
   **non-PII** derived prompt variables + QA score); each run records summed real `usage.cost`
   and rejection-rate. Provenance is PII-safe: only the derived non-PII variables
   (`animal`/`element`/`dominant_element`/`birth_year`) + model id + score — NEVER
   `name`/`birth_date`/`birth_place`.
7. **Money/customer actions gated** (preserved; none added here). The only real spend is the
   capped OpenRouter model cost; there is no money-to-customer leg in this slice.
Assumption: clauses #1, #2, #3, #6, #7 are verbatim from the confirmed canvas §4 + adopted
Council amendments (A4/A3/C2) and the §10 RESOLVED block. **Clauses #4 (PII flow) and #5
(cost-cap derivation) are now USER-CONFIRMED (corrected)** — the spec-auditor (Phase 0.7, F2 +
F1-BLOCKER, 2026-06-15) found both carried a confabulation against the real code; the single
remediation pass corrected them (#4 → PII redaction at the outbound OpenRouter request body /
compiled prompt, the real carrier; #5 → per-product worst-case 6 ≈ $0.23, cap 12/$1.00 as
ceiling), and the **user explicitly re-confirmed #4 + #5 as corrected on 2026-06-15**. Read
#4/#5 as confirmed value promises.
Missing: none.
Source: canvas §4 (value promise #1–#7), §7b (A4/A3/C2); PRD §1, §3 REQ-LGQ-004/005/006/007,
§10 RESOLVED (OQ-2/OQ-3); matrix V-* claims + Reality-Ledger notes; spec-auditor Phase 0.7
report (F1 BLOCKER, F2 IMPORTANT) verified against `runner.ts:232-289` + `localRepository.ts:123,137,164,179`.
User decision: value promise + A4/A3/C2 adopted by user 2026-06-15; the F1/F2 corrections are
USER-CONFIRMED (2026-06-15, at the USER GATE + explicit #4/#5 re-affirmation).

## Why Now

Explicit:
The mock-only loop is the bottleneck blocking the entire north-star pipeline: nothing
downstream (real swarm tuning, cost calibration, real QA behavior) can be trusted while the
generate→QA loop has never touched a real model. The real OpenRouter image contract is **now
`belegt`** (verified live 2026-06-15: `POST /v1/chat/completions`,
`google/gemini-2.5-flash-image`, base64 PNG data URI, **$0.0387/image**, modest `max_tokens`
required or HTTP 402), which un-blocks a real provider implementation that was previously
unverifiable. Sequencing this as iteration 1 (real generate→QA link) before Etsy ingest or
Gelato dispatch keeps each real link independently provable.
Assumption: business urgency beyond "first real pipeline link + now-verified OpenRouter
contract" is not stated by the user; do not invent a market/deadline rationale. (Mark for
user confirmation if a stronger "why now" exists.)
Missing: explicit business timing rationale (deliberately not invented).
Source: canvas §1, §8 R9 (live-verified contract), §7a; PRD §2 `belegt` contract.
User decision: R9 RESOLVED to `belegt` via orchestrator live-verification 2026-06-15.

## Non-Goals

Explicit:
- Etsy order ingest (later slice).
- Gelato live dispatch / any real POD submission (later slice).
- Supabase persistence / leaving the `DEMO_LOCAL` data layer (later slice). The server-side
  execution path stays on Local repositories; generated images are **ephemeral base64**
  (no durable store, no Supabase — canvas R8/§7).
- Real Etsy/customer/buyer data (later slice).
- Auto-dispatch on accept (explicitly excluded by value promise #3; run stops at `pod_ready`).
- Streaming/parallel image swarm — **OUT** for this slice (sequential within the cap; canvas §7/§7a).
- A console-UI run workflow — **OUT**; success is the flag-gated smoke, not a UI (canvas §5).
- **IN scope (NOT non-goals), from the value promise:** hard cost cap (both image-count AND $),
  artifact provenance + cost/rejection telemetry, PII redaction at the provider boundary,
  no-fake-success/contract-drift guard, human-approval-before-live-dispatch invariant preserved.
- **Permanent constraint (not a mere non-goal):** no inventing of data; no fake-success; no PII
  leak; no unbounded spend.
Assumption: none.
Missing: none.
Source: canvas §7, §7a; PRD §1 "Out of scope".
User decision: non-goals + IN-scope items adopted by user 2026-06-15.

## Success Signal

Explicit:
For this slice the **flag-gated real-boundary smoke going green IS the success measure**
(canvas §5 RESOLVED) — deliberately a capability proof, NOT a console-UI or product-outcome
metric. The Vision is fulfilled when:
- A real workflow run on the **server-side** path (`POST /api/workflows/:id/run`) generates
  **≥1 real OpenRouter-generated image**, scored by a **real vision model**, and the loop
  reaches a **deterministic terminal state** — `pod_ready` on accept OR `escalated` on
  exhaustion/cap — proven by the flag-gated real-boundary smoke (REQ-LGQ-008b), not by mocks.
- The **hard cost cap demonstrably bites** — a run cannot exceed the max image calls / the $
  ceiling — proven by a guard test that goes **RED** if the cap is removed (REQ-LGQ-004d,
  P2/P4). When the cap bites with no accepted candidate, the run reaches `escalated` carrying
  the distinct reason `COST_CAP_REACHED` (OQ-2 RESOLVED — no new state-machine state).
- **No birth-data PII** appears in any outbound OpenRouter request body/header/system prompt,
  log, error, returned metadata, or `qaResultJson` — proven by a paired sentinel guard test
  (REQ-LGQ-005c) + the smoke's outbound-body assertion (P2). **(F2 correction owed: the
  sentinel MUST be injected into the prompt-template path — the rendered prompt is the real PII
  carrier, `runner.ts:232-247` — NOT merely assert "only the rendered prompt is sent", which
  would be green-while-leaking. Pending remediation + user re-confirmation.)**
- A divergent/HTTP-error OpenRouter response **fails loud**, never faking an accepted
  candidate (REQ-LGQ-007), and the slug-drift guard (`--inject-drift`) still fails the smoke.
- The real providers are **`wired-in-prod`** — ≥1 NON-TEST importer reachable from
  `createApp()` via the new endpoint (REQ-LGQ-008a, P1); not a built-but-dead primitive.
- The run records **summed real `usage.cost`** + rejection-rate + per-candidate provenance
  (REQ-LGQ-006); the smoke asserts non-zero real cost and provenance present.
- The auth matrix holds: the new route returns 401/403 for no-token/non-admin/aal1
  (REQ-LGQ-003c), and no secret value appears in any response.
- The live smoke is **opt-in, not CI** (real spend), with `--dry-run` for the path/shape
  without network/secret.
Assumption: none.
Missing: product-outcome metric (intentionally deferred — this slice is a capability proof,
not end-to-end value; do not invent an outcome metric).
Source: canvas §5 (RESOLVED), §8 R9; PRD §3 REQ-LGQ-004/005/007/008, §10 RESOLVED (OQ-2);
matrix S-smoke + Reality-Ledger notes.
User decision: success = flag-gated real-boundary smoke green (user 2026-06-15).

## Risks if Misbuilt

These are the shapes a build could take that pass tests yet **destroy the value** — the
explicit "wrong / harmful implementation" list against which the increment is judged.

Explicit:
- **Faking an accepted candidate.** Synthesizing a placeholder image or a passing score when
  the real OpenRouter response diverges or errors (e.g. swallowing the 402 from an over-large
  `max_tokens`), instead of FAILING LOUD. (Violates value promise #2; REQ-LGQ-007 BLOCKER shape.)
- **Leaking birth PII to OpenRouter.** Forwarding `customerData` / `resolvedVariables` (or any
  `name`/`birth_date`/`birth_place` field) into the request body, system prompt, metadata,
  logs, or `qaResultJson` — instead of sending only the rendered prompt + score criteria.
  (Violates value promise #4; the baseline already had a real "no-PII" defect — A4 BLOCKER shape.)
- **Unbounded spend.** Shipping without an enforced cap, or with a cap that does not bite
  (decorative guard), so `numInitiallyGenerated × maxRejectedBeforeEscalation` real image
  calls run free. (Violates value promise #5; REQ-LGQ-004d RED-on-removal must hold.)
- **Adding a dispatch / auto-dispatch leg.** Any path that submits to POD on accept, or
  weakens `assertDispatchAllowed`, instead of stopping at `pod_ready`. (Violates value
  promise #3 — the invariant is preserved ONLY by adding no dispatch leg.)
- **Built-but-dead provider (P1).** A real provider that passes unit tests but has **zero**
  production importer reachable from `createApp()` — claiming `wired-in-prod=yes` with no
  non-test caller. (REQ-LGQ-008a BLOCKER shape; the FuFire interpreter precedent.)
- **Claiming end-to-end POD value.** Presenting this capability slice as operator-facing
  end-to-end customer value (Etsy→Gelato), or the green smoke as "the product works for a
  customer." It is a **capability** link only; the Reality Ledger classes it as
  capability-wired, not end-to-end-value. Overclaiming here is itself a misbuild.
- **Real call leaking from the browser.** Running the real loop / reading the OpenRouter key
  client-side, or a `VITE_`-prefixed key. The real loop runs ONLY server-side; `DEMO_LOCAL`
  keeps the mock client-side path (NFR-7; key-hygiene).
- **Promotion of mocked evidence.** Marking a REQ `real-boundary-smoke` when its only evidence
  is mocked HTTP (`unit-fake`/`integration-fake`). Per escalation-asymmetry, an I/O/remote
  feature stays at the lower class until the live smoke promotes it — and a `*-fake`/unwired
  surface may be downgraded to "known limitation" only by the **user**, never by an agent.
Assumption: none — each risk is drawn from canvas §4/§7b/§8 + PRD §3/§8 + the Reality-Ledger notes.
Missing: none.
Source: canvas §4, §7b (A4), §8 (R4/R5/R7); PRD §3 REQ-LGQ-004/005/007/008, §8 risk table;
matrix Reality-Ledger notes.
User decision: per escalation-asymmetry, an I/O/`*-fake`/unwired surface may be downgraded to
"known limitation" only by the user.

## QA Value Checks

These are the customer-value checks QA must verify (the `VCHK-*` IDs). They prove **value at
the capability level**, not only function — each maps back to the True-Line and to the matrix
value-claim codes.

Explicit:
- **VCHK-LGQ-001 — The loop runs against REAL models (V-real).** A server-side run generates
  ≥1 real OpenRouter image, scores it with a real vision model, and reaches a deterministic
  terminal state (`pod_ready` or `escalated`) — proven by the live smoke, not mocks.
  (REQ-LGQ-001/002/003/008; AC-LGQ-001a, 002a/d, 003a, 008b)
- **VCHK-LGQ-002 — No fake-success (V-nofake).** A divergent or non-2xx OpenRouter response
  fails loud; no placeholder image / passing score / fake-`accepted` artifact is produced.
  (REQ-LGQ-002/007; AC-LGQ-002c, 007a/b/c)
- **VCHK-LGQ-003 — Human-approval invariant preserved (V-approval).** On accept the run stops
  at `pod_ready`; this endpoint makes no POD/dispatch call; `assertDispatchAllowed` is
  untouched. (REQ-LGQ-003; AC-LGQ-003d)
- **VCHK-LGQ-004 — No PII leak (V-nopii).** Sentinel birth data appears in no outbound
  OpenRouter body/header/system prompt, log, error, returned metadata, or `qaResultJson`;
  only the rendered prompt + score criteria are sent. Paired guard goes RED on leak.
  (REQ-LGQ-005; AC-LGQ-005a/b/c)
- **VCHK-LGQ-005 — Hard cost cap bites (V-cap).** A run cannot exceed the max-image-call
  integer OR the $ ceiling; the cap default is DERIVED/justified from config worst-case; the
  guard goes RED if the cap is removed; cap-bite resolves to `escalated` +
  `COST_CAP_REACHED`. (REQ-LGQ-004; AC-LGQ-004a/b/c/d)
- **VCHK-LGQ-006 — Provenance + telemetry, PII-safe (V-prov).** Each artifact carries model id
  + non-PII derived vars + QA score; each run records summed real cost + rejection-rate; no
  raw birth field is stored. (REQ-LGQ-006; AC-LGQ-006a/b/c)
- **VCHK-LGQ-007 — Wired-in-prod + smoke is the success signal (S-smoke).** ≥1 non-test
  importer reaches the real providers from `createApp()` via the new endpoint; the flag-gated
  live smoke green IS the success signal; readiness reflects the OpenRouter key without
  echoing it. (REQ-LGQ-008; AC-LGQ-008a/b/c/d)
Assumption: the VCHK-LGQ ID scheme itself is introduced by this Vision for QA traceability;
the *content* of each check is canvas/PRD/matrix-sourced. (Mark the ID scheme for user
confirmation.)
Missing: none.
Source: canvas §4/§5; PRD §3 acceptance criteria, §4 NFRs; matrix V-*/S-smoke + acceptance-test cells.
User decision: —

## Honest evidence ceiling

Explicit:
- **All REQ-LGQ rows are TO BUILD.** Their `evidence-class` cells in the matrix show the
  **TARGET** class (mostly `real-boundary-smoke` via the REQ-LGQ-008 live smoke). A row may
  not claim a higher class than its evidence proves; an I/O/remote feature whose only evidence
  is mocked HTTP stays `unit-fake`/`integration-fake` until the live smoke promotes it.
- **The real image-generation contract is `belegt`** (verified live 2026-06-15: base64 PNG
  data URI, $0.0387/image, modest `max_tokens` required) — **but only out-of-band by the
  orchestrator; there is NO reproducible in-tree guard for it yet** (spec-auditor F3). The
  existing smoke (`scripts/smoke/openrouter-live-smoke.ts`) makes a catalog check + one text
  completion only — it has never sent a real image-gen call nor an image→score call, so the
  REQ-LGQ-008 live-loop smoke is largely **net-new** (two new real-boundary behaviors), not a
  thin extension. **The vision model scoring a real image input end-to-end is `ungeprüft`**
  until the live smoke proves it (AC-LGQ-002d) — it may NOT be downgraded to a "documented
  risk" premise.
- **NFR-5 latency = `ungeprüft`** — benchmark in build; do not assert a number now.
- **This slice = capability-wired, NOT end-to-end-value.** The Reality Ledger classes it
  accordingly. There is intentionally no operator-facing console workflow and no
  Etsy→Gelato value path in this slice — and that is honest, not a defect.
Assumption: none.
Missing: none.
Source: canvas §8 R9, §9; PRD §2 `belegt`/`ungeprüft`, §4 NFR-5, §8 R9; matrix Reality-Ledger notes.
User decision: R9 image→score path stays `ungeprüft` until the smoke retires it (user 2026-06-15).

## Open items for the user (carried from PRD §10 RESOLVED — confirm at the gate)

These were RESOLVED by the user in the canvas/PRD §10 RESOLVED block on 2026-06-15; this Vision
encodes them and surfaces them for explicit re-affirmation at the USER GATE (it does **not**
re-open them):
- OQ-1 → run inputs: birth/test data IN the request body (mirrors `fufire/test-run`); the
  sensitive route + A4 provider-boundary redaction protect it. (REQ-LGQ-003/005)
- OQ-2 → cap-bite terminal state: reuse `escalated` + distinct reason `COST_CAP_REACHED`
  (no new state). (REQ-LGQ-004)
- OQ-3 → provenance form: non-PII derived vars only (`animal`/`element`/`dominant_element`/
  `birth_year`) + model id + score; never `name`/`birth_date`/`birth_place`. (REQ-LGQ-006/005)
- OQ-4 → cost-cap config home: fields on `GenerationConfig` (`maxImagesPerRun`/`maxUsdPerRun`,
  default 12/$1.00). (REQ-LGQ-004)
- ASSUMPTION (confirmed): existing `run_simulation` permission + the new `sensitive` route
  classification suffice; no new `run_live` RBAC permission this slice.

## Spec-auditor findings (Phase 0.7, 2026-06-15) — RESOLVED (historical record)

The independent spec-auditor returned **`has-important`**: one BLOCKER + important findings;
two landed directly on this Vision. They were **resolved** by the single remediation pass
(`requirements-analyst` on canvas + PRD, propagated here) and **user re-confirmation (2026-06-15)**;
the plumbline-watcher dev-entry gate then returned `pass`. This section is the audit trail:

- **F1 — BLOCKER (cost-cap derivation, value-promise #5).** The "≈ 9 images ≈ $0.35/run"
  worst-case is a confabulation — no single config yields 9; real per-product worst-case = **6
  images ≈ $0.23** (`prod-001`: 3×2 = `localRepository.ts:123`×`:164`; `prod-002`: 2×3 =
  `:137`×`:179`). The "9" crossed two products; this is the blind-guess-as-derivation A3 forbade.
  Corrective: state the real 6, re-justify 12/$1.00 as headroom over 6, fix `:179`→`:164`,
  propagate to canvas A3 + PRD NFR-1/AC-LGQ-004c.
- **F2 — IMPORTANT, touches a PII acceptance criterion (value-promise #4).** PII enters via the
  **rendered prompt** (`runner.ts:232-247`), not the structured `customerData`/`resolvedVariables`
  args (which carry only non-PII derived vars). "Send only the rendered prompt" therefore points
  redaction at the PII carrier; the sentinel guard as worded would be green-while-leaking.
  Corrective: redact at prompt rendering; re-target AC-LGQ-005a's sentinel at the prompt path.
  **Close with the user — it changes a PII AC.**
- **F3 — IMPORTANT (evidence framing).** Captured in the Honest-evidence-ceiling above: the
  R9 image-gen contract has no reproducible in-tree guard yet; the live-loop smoke is net-new.
  `ungeprüft` labels are correctly held — keep them.
- **F7 — note→build (cost-cap granularity / NFR-4).** `generate(prompt, n, …)` is a batch call,
  so a per-image cap cannot bite below `numInitiallyGenerated` granularity unless the provider
  is cap-aware; AC-LGQ-004a must be restated at per-`generate()`-batch granularity (or the seam
  changes), and the enforcement locus (runner vs endpoint wrapper) resolved. Build/ADR concern,
  not a spec BLOCKER — flagged so determinism (NFR-4) is not left implicit.
- **Positive (F5/F6):** the honesty framing (capability-not-end-to-end-value) held with no
  overclaim found; the dual-cap and OpenRouter choice are justified, not gold-plating.

These are reasoning/provenance findings, not proof the system works or fails functionally.

## User Confirmation

Status: **user-confirmed** (User, 2026-06-15) — confirmed at the Phase 0.5 USER GATE AFTER the single
remediation pass landed both spec-auditor BLOCKERs (F1, F2) in the canvas + PRD and they were
propagated here. Confirmed by user: yes. The plumbline-watcher dev-entry gate then surfaced
artifact-state hygiene items (stale bodies / a stale matrix figure / a scope-heading parser miss),
which were reconciled before development start; the watcher was re-run to `pass`.

Resolved contradictions (were surfaced, now corrected — not laundered):
1. **Value-promise #5 cost-cap derivation** — the confabulated "≈ 9 images ≈ $0.35" is CORRECTED to
   the real per-product worst-case **6 ≈ $0.23** in canvas §7b/A3, PRD REQ-LGQ-004, and the
   traceability matrix. The cap value (12/$1.00) stays as a ceiling above it (F1, resolved).
2. **Value-promise #4 PII-flow** — redaction is RE-POINTED to the actual PII carrier (the outbound
   OpenRouter request body / compiled prompt), so the P2 guard bites; the green-while-leaking framing
   is removed (F2, resolved).
Both originate upstream (canvas A3/A4, PRD) and are carried into this Vision verbatim; they are
corrected in the inline CONTESTED notes and owed to the remediation pass. The remaining carried
items are the deliberate, honestly-surfaced evidence ceilings (real image-gen `belegt` but no
in-tree guard yet; image→score `ungeprüft` until the smoke; all rows TO BUILD; capability-wired
NOT end-to-end-value) — surfaced honestly, not contradictions.

Confirmation phrase for the user to give (verbatim) to flip this Vision to confirmed:

```text
I confirm this Product Vision as the basis for AgileTeam planning.
```
