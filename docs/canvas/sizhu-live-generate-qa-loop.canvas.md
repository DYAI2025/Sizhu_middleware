# Product Canvas — Live generate→QA loop (Slice A)

| Field | Value |
| --- | --- |
| Feature slug | `sizhu-live-generate-qa-loop` |
| Branch | `feat/sizhu-live-generate-qa-loop` |
| Status | **user-confirmed** (User, 2026-06-15 — re-confirmed at the USER GATE after the Phase 0.7 spec-sanity remediation; Confirmed by user: yes. History: user-confirmed → re-confirmed after Council → amended for spec-sanity BLOCKERs F1/F2 → re-confirmed here. Phase 0.7 spec-auditor + product-owner found 2 BLOCKERs, both verified against source: **F1** — A3 cost-cap derivation was a confabulation (crossed config values from two products → false "9 images / $0.35"; corrected to per-product max = **6 images / ~$0.23**, cap 12/$1.00 stays as ceiling above it); **F2** — A4 PII-redaction targeted the WRONG carrier (`customerData`/`resolvedVariables` carry only non-PII derived vars; raw PII rides the compiled PROMPT STRING → guard re-pointed to the **outbound OpenRouter request body**). Other resolved decisions UNCHANGED: R1 server-endpoint/sensitive, R2 sensitive, R3 both caps 12/$1, R8 ephemeral base64, §5 smoke, §7 sequential, R9 belegt live, C2 cost telemetry. **Requires explicit user re-confirmation — not self-confirmed.**) |
| Author | requirements-analyst |
| Date | 2026-06-15 |
| North-star (context, not this slice) | Fully automatic pipeline: Etsy order → FuFire personalization → image-swarm → LLM quality-gate → Gelato dispatch, live. |
| This slice (user-confirmed intake) | **A) Live generate→QA loop** — replace the Mock image-generation + quality-gate providers in `WorkflowRunner` with REAL OpenRouter-backed providers, so the generate→QA→accept/escalate loop runs against real models instead of mocks. |

Status: user-confirmed
Confirmed by user: yes

---

## 1. Problem

The generate→QA→escalate loop is fully built and exercised, but only against **mock** providers. `appServices.ts:39-43,45-57` wires `MockImageGenerationProvider` + `MockQualityGateProvider` into a **client-side** `WorkflowRunner`; the mock image provider returns inline SVG data URIs and never touches the network (`src/lib/providers/mock/mockImageGenerationProvider.ts:22,104-133`). The OpenRouter gateway exists but is **selection-only**: `selectModelForOperation()` validates a model id and capabilities; it makes **no** HTTP image/chat call (`src/lib/modelGateway/openRouterGateway.ts:174-189` — the whole module only resolves config and asserts capability). The only code that has ever hit OpenRouter over the wire is the flag-gated smoke harness (`scripts/smoke/openrouter-live-smoke.ts`), which is not a reusable provider. Net: the loop has never produced a real generated image scored by a real vision model. There is no `ImageGenerationProvider` / `QualityGateProvider` implementation that calls OpenRouter.

## 2. Target user / customer

POD shop operator/admin of the Bazzi console (astrology-personalized print-on-demand for Etsy). They configure quality gates and run/observe workflows. The end customer (Etsy buyer) is **out of scope for this slice** — no real customer data, no order, no money, no fulfillment is involved (generate→QA has no money/fulfillment leg).

## 3. Current workaround

The operator can only run the pipeline in `DEMO_LOCAL`, where it generates placeholder SVGs and mock QA scores entirely in the browser (`appServices.ts:45-57`, `getAppMode()` defaults to `DEMO_LOCAL`). To see whether real models actually work they must run the standalone smoke (`scripts/smoke/openrouter-live-smoke.ts`) by hand — a developer harness, not a product capability, not wired into the runner.

## 4. Value proposition

The generate→QA loop runs against **real** OpenRouter models, so an accepted/escalated outcome reflects real model behavior instead of a mock. This is the first real link of the north-star pipeline. It must be delivered **without breaking the confirmed value promise** (verbatim from intake, all must hold):

1. Honest, no-invented-data personalization.
2. No fake-success.
3. A live customer/money-affecting dispatch requires **MANDATORY human-approval** — QA-accepted alone is NOT sufficient for live. *(Already enforced structurally: on accept the run goes to `pod_ready` and stops; `dispatchManualApproval()` is the explicit POD trigger; `WorkflowStateMachine.assertDispatchAllowed()` gates submission — `runner.ts:352-358,397-409`. This slice MUST NOT weaken it. Note: this slice has no dispatch leg at all, so the promise is preserved by not adding one.)*
4. No PII leak (carry-over of the prior "no PII echo" guard — raw birth fields `name`/`birth_date`/`birth_place` must not appear in the **outbound OpenRouter request body** (the prompt — the real PII carrier, see §7b A4), nor in logs, errors, prompts-on-status, or provider metadata surfaces).
5. **HARD cost/quantity cap per run** (no unbounded swarm). Cost surface is real: `genConfig.numInitiallyGenerated` candidates per iteration × up to `qualityConfig.maxRejectedBeforeEscalation` iterations (`runner.ts:220,281-289`). Real OpenRouter image calls turn this into real money — a cap is IN-scope.
6. Artifact provenance recorded (model id + prompt variables + QA score) for each candidate.
7. Money/customer actions gated (preserved; none added here).

## 5. Success signal

`MISSING` — exact pass metric to be confirmed with the user. Proposed (user confirms in PRD/Vision):
- A real workflow run in a server-side path produces ≥1 real OpenRouter-generated image candidate, scored by a real vision model, and the loop reaches a deterministic terminal state (`pod_ready` on accept OR `escalated` on exhaustion) — proven by a flag-gated real-boundary smoke (per project rule P7), not by mocks.
- The hard cost/quantity cap demonstrably bites (a run cannot exceed `cap` real image calls) — proven by a guard test that goes RED if the cap is removed (P2/P4).
- No birth-data PII (`name`/`birth_date`/`birth_place`) appears in the **outbound OpenRouter request body** (the prompt — the real carrier, F2), nor in any provider request metadata, log, or error surface — proven by a paired guard test (P2) that asserts on the captured outbound body.
- **RESOLVED (user 2026-06-15): success signal = the flag-gated real-boundary smoke goes green** (harness, P7) — NOT the console-UI path (UI is a later, larger scope).

## 6. Core use case

Operator triggers a workflow run for a product with a configured quality gate. The system: resolves personalization (FuFire, already live — REQ-A-002 production-verified per CLAUDE.md), compiles the astro-prompt, calls a **real OpenRouter image provider** for up to `cap` candidates, scores them with a **real OpenRouter vision provider**, and either accepts (→ `pod_ready`, stop) or retries with the fallback model up to the escalation limit (→ `escalated`, escalation email). The provider seam is unchanged (`src/lib/providers/interfaces.ts` `ImageGenerationProvider.generate` / `QualityGateProvider.evaluate`); only the implementations behind it become real, and they must run where the server-only key is available (see Risk R1).

## 7. Non-goals (PROPOSED — user confirms)

- Etsy order ingest (later slice).
- Gelato live dispatch / any real POD submission (later slice).
- Supabase persistence / leaving `DEMO_LOCAL` data layer (later slice). **TENSION with R1** — see risks; a server-side execution path may force partial movement off the pure-browser model even while staying on Local repositories.
- Real Etsy/customer/buyer data (later slice).
- Auto-dispatch on accept (explicitly excluded by value promise #3; run stops at `pod_ready`).
- **IN scope (NOT non-goals), from the value promise:** hard cost/quantity cap, artifact provenance (model + prompt-vars + QA-score), human-approval-before-live-dispatch invariant preserved.
- `OPEN QUESTION`: is a streaming/parallel image swarm in or out? Proposed OUT (sequential within the cap) for this slice.

## 7a. Resolved design decisions (user, 2026-06-15) — close the BLOCKER + open questions

- **R1 → RESOLVED: option (a) — server endpoint + server-side runner.** A new `POST /api/workflows/:id/run` runs the `WorkflowRunner` SERVER-side with the server-only OpenRouter key. Classified **`sensitive`** (admin role + MFA/aal2) and added to `SENSITIVE_API_ROUTES` (R2 resolved → sensitive; it spends money). The client never sees the key; the loop orchestration + cost-cap live server-side.
- **R3 → RESOLVED: BOTH caps.** A hard per-run cap on real image calls **AND** a per-run $ spend ceiling. Default `12` images & `$1.00`/run (configurable). Enforced server-side; a RED-on-removal guard test (P2/P4) proves the cap bites (real cost verified ~$0.0387/image).
- **R8 → RESOLVED: ephemeral/in-memory base64 data URI** (mirrors the mock's data-URI `storagePath`); no durable store, no Supabase (consistent with Non-goal #3).
- **§5 → RESOLVED: flag-gated real-boundary smoke** (P7) is the pass metric; no console-UI in this slice.
- **§7 streaming/parallel → OUT** (sequential within the cap) for this slice (proposed default, confirm at Canvas-confirm).
- Money/customer posture: live allowed where needed — **does not apply to this slice** (generate→QA has no dispatch/money-to-customer leg; the only real spend is OpenRouter model cost, capped by R3).

## 7b. Council amendments (Phase 0.16, user-adopted 2026-06-15)

The council challenge surfaced three points the user adopted (Canvas re-confirmed after):

- **A4 — PII redaction targets the REAL carrier: the outbound OpenRouter request body (the prompt) — CORRECTED (spec-sanity F2, 2026-06-15).** Code reality (belegt, `runner.ts:235-239,252,281-282,306`): the `customerData`/`resolvedVariables` args the providers receive (`interfaces.ts:14` `generate(...customerData)`, `:38` `evaluate(...resolvedVariables)`) carry ONLY **non-PII DERIVED vars** — the runner passes `generationParams` (`runner.ts:272-279`: animal/element/dominant_element + orderNumber/iteration) and `personalizationVars` (`runner.ts:306`: animal/element/birth_year/dominant_element). The **raw PII** (`name`/`birth_date`/`birth_place`) is rendered into `templatePayload.personalization` (`runner.ts:235-239`) → the **compiled prompt STRING** (`runner.ts:252`) → passed as the FIRST arg `generate(compiledPrompt, …)` (`runner.ts:281-282`) and to the vision-QA via the rendered image. **A sentinel guard written against `customerData`/`resolvedVariables` would be GREEN WHILE LEAKING** — those args never carried the PII. Corrected constraint: the prompt sent to OpenRouter (image-gen AND vision-QA) MUST contain only non-PII derived vars (animal/element/dominant_element/birth_year), NEVER raw `name`/`birth_date`/`birth_place` — in body, system prompt, or metadata. Paired P2 guard: inject sentinel birth-PII tokens, assert they appear NOWHERE in the **outbound OpenRouter request body** (image-gen + vision-QA); the guard goes RED if any raw birth field reaches the wire. (This re-point is what makes the guard actually bite — the prior carrier framing was a green-while-leaking acceptance criterion.)
- **A3 — cost-cap DERIVED from the real loop maximum, not blind.** Belegt (per-product, NOT cross-product): real worst-case images per run = `numInitiallyGenerated` × `maxRejectedBeforeEscalation`, computed *within each product*. From the actual config defaults: **prod-001 = 3 × 2 = 6 images** (`localRepository.ts:123` numInitiallyGenerated=3, `localRepository.ts:164` maxRejectedBeforeEscalation=2); **prod-002 = 2 × 3 = 6 images** (`localRepository.ts:137` numInitiallyGenerated=2, `localRepository.ts:179` maxRejectedBeforeEscalation=3). So `max(real worst-case across products) = 6 images ≈ 6 × $0.0387 ≈ $0.23/run` ($0.0387/image verified live, R9). The cap default (12 images / $1.00) is a coherent SAFETY CEILING **above** the corrected worst-case (6 / $0.23) — derived from `max(real worst-case across products)=6` + headroom; the PRD must COMPUTE/justify the cap from the active config this way, not hardcode a guessed number. **CORRECTION (spec-sanity F1, 2026-06-15): the prior "9 images ≈ $0.35/run" figure was a confabulation — it crossed prod-001's `numInitiallyGenerated=3` with prod-002's `maxRejectedBeforeEscalation=3`, two different products. No single product reaches 9; the real per-product worst-case is 6 for both. (The council's earlier "36 images" figure was also wrong.)**
- **C2 — per-run cost + rejection telemetry.** Record real `usage.cost` (sum) + rejection-rate per run in the result, so the cap default can be tuned from data, not guesswork. Folds into the artifact-provenance surface (value-promise #6).

(Not adopted: A1 thinner-seam — the user-chosen R1 option (a) server-side runner is MORE robust for server-side cost-cap enforcement than the thin-seam, which would keep the cap client-side. C1/C3 no-consumer framing is already honestly stated — this slice is the first real *capability* link, not operator-facing end-to-end value; the Reality Ledger classes it accordingly, no value overclaim.)

## 8. Risks / contradictions

- **R1 — CENTRAL DESIGN QUESTION (`OPEN QUESTION`, do NOT silently decide): server-side execution path.** The OpenRouter key is **server-only**, never `VITE_`-prefixed (`openRouterGateway.ts:13-15,82-104`; CLAUDE.md key-hygiene). The real generate→QA loop therefore **cannot** run in the browser with the real key. But today the runner is wired **client-side** in `DEMO_LOCAL` (`appServices.ts:45-57`), and there is **no** server-side workflow-execution endpoint — the only `/api/workflows/*` route is a placeholder GET (`server/index.ts:127`). Options to surface (user picks; do not assume): (a) a new server endpoint (e.g. `POST /api/workflows/:id/run`) that runs the runner server-side; (b) a server-side runner module invoked by such an endpoint; (c) thin server provider-proxy endpoints the client-side runner calls. Each has different scope, security-classification (`sensitive` vs `session`, `SENSITIVE_API_ROUTES` allowlist), and Non-goal #3 (Supabase/data-layer) impact. **This is a BLOCKER for finalization until the user chooses.**
- **R2 — new privileged endpoint must be added to `SENSITIVE_API_ROUTES`.** Any run/generate endpoint that spends money on models is privileged; the default classification is only `session` (CLAUDE.md security model). If chosen path adds an endpoint, its pattern MUST be added to the sensitive allowlist or it is under-protected. `OPEN QUESTION`: should running the loop require `sensitive` (admin + MFA/aal2) or `session`? Proposed `sensitive` (it spends money).
- **R3 — cost/quantity cap (value promise #5).** Without an enforced cap, `numInitiallyGenerated × maxRejectedBeforeEscalation` real image calls = unbounded spend (`runner.ts:220,281-289`). `OPEN QUESTION`: is the cap a per-run max-image-call integer, a spend ceiling, or both? Where is it configured and what is the default? Must have a RED-on-removal guard test (P2/P4).
- **R4 — PII leak surface (value promise #4) — carrier corrected per F2.** The `customerData`/`resolvedVariables` args (`interfaces.ts:14,38`) carry ONLY non-PII derived vars; the raw birth PII (`name`/`birth_date`/`birth_place`) flows into the **compiled prompt string** (`runner.ts:235-239,252`) which is the FIRST arg to `generate()` and the QA image input. The prior baseline had a real "no-PII" defect (CLAUDE.md P2 origin: `sanitizedRequestMetadata` echoing birth data). The PII guard MUST target the **outbound OpenRouter request body** (image-gen + vision-QA), not the derived-var args, plus request/response/error/log surfaces; claim requires a paired guard test (P2) — see §7b A4.
- **R5 — contract-drift / no-fake-success (value promise #2, P7).** A real OpenRouter image/chat response shape that diverges from what the provider assumes must FAIL LOUD, not silently fake an accepted candidate. The prior smoke caught a stale model slug (`openRouterGateway.ts:46-67`); a live provider needs the same contract-drift guard.
- **R6 — secret-ref indirection trap (P6).** OpenRouter default ref is **direct** (`OPENROUTER_API_KEY`), FuFire is **indirect** — asymmetric, easy to mis-wire on Railway. Readiness must reflect real OpenRouter key presence; the resolved key must never appear in output (`openRouterGateway.ts:30-31,82-104`).
- **R7 — `wired-in-prod` ≠ tested (P1).** A new real provider that passes unit tests but has zero production importer reachable from `createApp()` is a built-but-dead primitive. The new providers must be provably wired into the chosen execution path.
- **R8 — image storage.** The mock returns inline SVG data URIs as `storagePath` (`mockImageGenerationProvider.ts:122`). Real OpenRouter returns image bytes/URLs. `OPEN QUESTION`: where do real generated images live for this slice (in-memory/temp/data-URI, or persisted)? Persistence may collide with Non-goal #3 (no Supabase). Proposed: ephemeral/in-memory for the slice, no durable store.
- **R9 — RESOLVED (orchestrator live-verification 2026-06-15, now `belegt`). F3 caveat:** the image-gen contract is `belegt` against the live API, but there is **NO reproducible in-tree guard for it yet** — the verification was a one-off live session, and the flag-gated live-loop smoke that will lock the contract in is **net-new** (it is NOT a thin extension of the existing `openrouter-live-smoke.ts`; that harness does catalog + one completion + key-hygiene, not the full generate→score→terminal loop with cap + PII assertions). Treat the contract as belegt-but-unguarded until the new smoke + contract-drift guard land in the build. Real OpenRouter image call verified against the live API:
  - Endpoint `POST /v1/chat/completions`, model `google/gemini-2.5-flash-image`, `modalities:["image","text"]`. **`max_tokens` must be set MODEST** — the default 8192 returns HTTP 402 (per-request affordance reservation exceeds the key's per-call budget despite ~$219 remaining; "can only afford 337"); `max_tokens:256` → HTTP 200.
  - Response shape: `choices[0].message.images[0].image_url.url` = a **base64 PNG data URI** (`data:image/png;base64,…`, ~276 KB/image).
  - **Cost = $0.0387 per generated image** (`usage.cost`; image_tokens ~1290). Real money → confirms R3 cost-cap is load-bearing. Per-product worst-case (corrected, F1): max across products = 6 images ≈ $0.23/run (prod-001 = 3×2, prod-002 = 2×3; see §7b A3 — NOT the earlier confabulated 9 / $0.35).
  - **R8 consequence:** base64 data URI ⇒ ephemeral/in-memory storage is sufficient for this slice (mirrors the mock's data-URI `storagePath`); no Supabase needed.
  - Still `ungeprüft` (verify during build, not a blocker): the QA/vision model scoring an actual image input (gemini-2.5-flash is vision-capable per gateway caps; the live smoke will prove the image→score path). Latency not benchmarked.

## 9. Evidence needed (before PRD finalization)

- `belegt` (verified this session, cited): provider DI seam shape (`interfaces.ts:3-47`); runner flow generate→QA→accept(`pod_ready`)→escalate with fallback + `assertDispatchAllowed` (`runner.ts:81-82,220,281-289,300-309,352-358,367-384,397-409`); gateway is selection-only / no HTTP (`openRouterGateway.ts:174-189`); client-side mock wiring in `DEMO_LOCAL` (`appServices.ts:39-57`); mock image provider is offline SVG (`mockImageGenerationProvider.ts:22,104-133`); no server-side run endpoint, only placeholder GET (`server/index.ts:127`); cost surface = candidates × iterations (`runner.ts:220,281-289`).
- `ungeprüft` (must verify before premise): R9 items — real OpenRouter image API request/response contract, output format, latency, price. Read the real API/response, classify `belegt | ableitbar | ungeprüft | nicht behaupten`; an unverifiable item stays OPEN QUESTION/BLOCKER and may NOT be downgraded to a "documented risk" premise.
- User decisions needed: R1 (execution-path option), R2 (route classification), R3 (cap definition/default/config), R8 (image storage), success metric (§5), streaming/parallel (§7).

## 10. Traceability links

- North-star vision context: north-star pipeline (Etsy→FuFire→swarm→QA→Gelato).
- Prior confirmed slice baseline: `docs/canvas/sizhu-secure-fufire-baseline.canvas.md`, `docs/prd/sizhu-secure-fufire-baseline.prd.md`, `docs/vision/sizhu-secure-fufire-baseline.vision.md` (FuFire + OpenRouter gateway = REQ-A-002).
- PRD (this slice): `docs/prd/sizhu-live-generate-qa-loop.prd.md` (TO BE CREATED — must link back to this canvas; blocked until canvas `user-confirmed` and R1/BLOCKERs closed).
- Product Vision (this slice): `docs/vision/sizhu-live-generate-qa-loop.vision.md` (TO BE CREATED by product-owner; must link back to this canvas).
- Traceability matrix: to carry `canvas-link: docs/canvas/sizhu-live-generate-qa-loop.canvas.md` on every REQ row.
- Grounded code anchors: `src/lib/providers/interfaces.ts`, `src/lib/workflow/runner.ts`, `src/lib/modelGateway/openRouterGateway.ts`, `src/lib/app/appServices.ts`, `src/lib/providers/mock/`, `server/index.ts`, `scripts/smoke/openrouter-live-smoke.ts`.

---

## Allowed change scope
<!-- user-confirmed at the USER GATE 2026-06-15; named, no wildcards per P5 -->


Repo-relative paths/globs this slice may edit (bare globs — parser-readable, one per line):

- src/lib/providers/**
- src/lib/workflow/**
- src/lib/modelGateway/**
- src/lib/app/appServices.ts
- server/**
- src/lib/domain/**
- src/types.ts
- scripts/smoke/**
- server/tests/**
- src/tests/**
- docs/**
- package.json
- stryker.config.json
- .env.example

## Scope rationale & exclusions

**Per-glob rationale:** providers/** = new real OpenRouter Image+QualityGate impls (keep mocks); workflow/** = cost-cap enforcement in the server runner; modelGateway/** = selection-only → real HTTP call; appServices.ts = wire real providers into the server path; server/** = new `POST /api/workflows/:id/run` + SENSITIVE_API_ROUTES + readiness; domain/**+types.ts = provenance/cost-cap fields only (find the type home first); scripts/smoke/** = the net-new live-loop smoke (P7); tests = cost-cap/no-PII/no-fake-success/wired-in-prod/route guards; docs/** = spec + reality/traceability; build/config = dev/test script + HTTP dep + stryker mutate list + .env.example.

**Explicitly OUT of scope (Non-goals §7):** Etsy ingest code, Gelato/POD live dispatch code, Supabase repository implementation, real customer-data ingestion, auto-dispatch-on-accept.
