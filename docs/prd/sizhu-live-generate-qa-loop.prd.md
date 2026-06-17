# PRD — Live generate→QA loop (Slice A)

| Field | Value |
| --- | --- |
| Feature slug | `sizhu-live-generate-qa-loop` |
| Branch | `feat/sizhu-live-generate-qa-loop` |
| **Status** | **user-confirmed** (User, 2026-06-15 — confirmed at the USER GATE after the Phase 0.7 F1/F2 remediation, alongside the re-confirmed canvas + Vision) |
| Author | requirements-analyst |
| Date | 2026-06-15 (amended 2026-06-15 — F1/F2 fixes) |
| **Canvas (source of truth)** | [`docs/canvas/sizhu-live-generate-qa-loop.canvas.md`](../canvas/sizhu-live-generate-qa-loop.canvas.md) — Status **user-confirmed** (User, 2026-06-15 — re-confirmed at the USER GATE after the F1/F2 remediation) |
| Traceability | [`docs/traceability.md`](../traceability.md) — feature section "sizhu-live-generate-qa-loop" |
| Prior baseline | `docs/prd/sizhu-secure-fufire-baseline.prd.md` (FuFire + OpenRouter gateway = REQ-A-002, REQ-D-001) |
| Vision (to be created by product-owner) | `docs/vision/sizhu-live-generate-qa-loop.vision.md` |

Status: user-confirmed
Confirmed by user: yes

> **DoR note.** Every design decision below is RESOLVED in the user-confirmed canvas (R1, R2, R3+A3, R8, A4, C2, §5, §7). This PRD encodes those resolutions verbatim as constraints and does **not** re-open them. Residual gaps are listed in §10 as MISSING / OPEN QUESTION / ASSUMPTION only where the canvas itself left them open. No new assumptions are silently adopted.
>
> **Spec-sanity amendment (Phase 0.7, 2026-06-15) — two BLOCKERs fixed, both verified against source; no scope creep.**
> - **F1 (cost-cap derivation was a confabulation).** REQ-LGQ-004 AC-LGQ-004c + NFR-1 claimed worst-case "9 images ≈ $0.35/run". That "9" crossed prod-001's `numInitiallyGenerated=3` with prod-002's `maxRejectedBeforeEscalation=3` — two **different** products. Real per-product worst-case = `numInitiallyGenerated × maxRejectedBeforeEscalation` computed within a product: prod-001 3×2=**6**, prod-002 2×3=**6** (`localRepository.ts:123,164,137,179`). Corrected to `max=6 images ≈ $0.23/run`. The 12-images/$1.00 default **stays** — now justified as `max(per-product worst-case)=6` + headroom.
> - **F2 (PII redaction targeted the wrong carrier — green-while-leaking).** REQ-LGQ-005 / NFR-3 said the providers receive `customerData`/`resolvedVariables` "which carry birth data" and must redact those. Code reality (`runner.ts:235-239,252,272-279,281-282,306`): those args carry ONLY non-PII derived vars; raw PII (`name`/`birth_date`/`birth_place`) rides the **compiled prompt string** (first arg to `generate()`, and the vision-QA image). The AC + P2 guard (AC-LGQ-005c) are re-pointed to the **outbound OpenRouter request body** so the guard actually bites.
> - **F3 (folded, non-blocking).** Image-gen contract is `belegt` but has no reproducible in-tree guard yet; the live-loop smoke (T-LGQ-9) is net-new, not a thin extension of `openrouter-live-smoke.ts`.
> - No other resolved decision re-opened. PRD + canvas + Vision are **user-confirmed** (User, 2026-06-15) at the USER GATE after this remediation.

---

## 1. Summary & goal

Replace the **mock** image-generation + quality-gate providers in the `WorkflowRunner` generate→QA→accept/escalate loop with **real OpenRouter-backed** implementations, executed **server-side** behind a new sensitive endpoint, so an accepted/escalated outcome reflects real model behavior — without breaking any value promise (no-invented-data, no-fake-success, human-approval-before-live-dispatch preserved, no PII leak, hard cost cap, artifact provenance, money/customer gated).

This is the **first real capability link** of the north-star pipeline (Etsy → FuFire → image-swarm → QA → Gelato). It deliberately adds **no dispatch leg**: the run stops at `pod_ready` on accept; `dispatchManualApproval()` remains the only POD trigger. The success metric is a **flag-gated real-boundary smoke** going green (P7), not a console-UI path.

### In scope
- Real `ImageGenerationProvider` (OpenRouter image call) — `belegt` contract per canvas R9, **but belegt-but-unguarded (F3): the contract was verified in a one-off live session and has NO reproducible in-tree guard yet; the flag-gated live-loop smoke that locks it in (T-LGQ-9) is net-new, not a thin extension of the existing smoke.**
- Real `QualityGateProvider` (OpenRouter vision scoring).
- Server-side run endpoint `POST /api/workflows/:id/run` (R1, **sensitive**), running the `WorkflowRunner` server-side with the server-only OpenRouter key.
- Hard cost cap: **both** a max-image-call integer **and** a $ spend ceiling per run, enforced server-side, **derived** from the active config worst-case (R3 + A3).
- PII redaction at the provider boundary (A4, hard constraint).
- Per-candidate provenance + per-run cost & rejection-rate telemetry (C2, value-promise #6).
- No-fake-success / contract-drift guard for the real OpenRouter response shape (R5).
- Flag-gated real-boundary smoke proving the wired-in-prod path end-to-end (P1, P7).

### Out of scope (Non-goals — canvas §7)
Etsy order ingest; Gelato/POD live dispatch or any real POD submission; Supabase persistence / leaving the `DEMO_LOCAL` data layer; real Etsy/customer data; auto-dispatch on accept; streaming/parallel image swarm (sequential within the cap for this slice, canvas §7/§7a).

---

## 2. Grounded code anchors (`belegt`, cited)

All citations verified this session against the repo on branch `feat/sizhu-live-generate-qa-loop`.

| Anchor | File:line | Fact |
| --- | --- | --- |
| Provider DI seam | `src/lib/providers/interfaces.ts:3-26` (`ImageGenerationProvider.generate`), `:28-47` (`QualityGateProvider.evaluate`) | `generate(prompt, numCandidates, format, quality, model, secretRef, customerData)`; `evaluate(candidates, minScore, qaPrompt, secretRef, model, resolvedVariables, iteration)`. **CORRECTED (F2):** the `customerData`/`resolvedVariables` args carry only **non-PII derived vars** in practice (runner passes `generationParams`/`personalizationVars`, `runner.ts:272-279,306`). The **raw PII rides the `prompt` (first arg)** — rendered from birth fields at `runner.ts:235-239,252`. The PII redaction target is the outbound request body, not these args. |
| Runner loop | `src/lib/workflow/runner.ts:220` (`while currentIteration <= qualityConfig.maxRejectedBeforeEscalation`), `:281-289` (generate), `:300-308` (evaluate), `:338-341,350-362` (accept→`pod_ready`, stop), `:365-388` (escalate) | generate→QA→accept(`pod_ready`)/escalate-with-fallback; cost surface = `numInitiallyGenerated × maxRejectedBeforeEscalation`. |
| Dispatch invariant | `src/lib/workflow/runner.ts:352` & `:409` (`WorkflowStateMachine.assertDispatchAllowed`), `:354-358` (no auto-submit) | accept stops at `pod_ready`; `dispatchManualApproval()` is the only POD trigger. **This slice adds no dispatch leg.** |
| Gateway selection-only | `src/lib/modelGateway/openRouterGateway.ts:174-189` (`selectModelForOperation`) | resolves + capability-checks a model id; **makes no HTTP call**. Defaults `image_generation=google/gemini-2.5-flash-image`, `quality_gate=google/gemini-2.5-flash` (`:58-67`, verified live 2026-06-14). Key read server-side only via secret-ref (`:82-104`); reports `present:boolean`, never the value. |
| Client-side mock wiring | `src/lib/app/appServices.ts:39-57` | `MockImageGenerationProvider` + `MockQualityGateProvider` wired into a client-side `WorkflowRunner` in `DEMO_LOCAL`; non-DEMO runner is a throwing stub (`:78-85`). |
| Mock image provider is offline | `src/lib/providers/mock/mockImageGenerationProvider.ts:22,101,120-130` | returns inline SVG data URI as `storagePath`; never touches the network. |
| No server run endpoint | `server/index.ts:127-129` | only `GET /api/workflows/*` placeholder exists; **no** `POST /api/workflows/:id/run`. |
| Composition root | `server/index.ts:22-262` (`createApp()`), `:64` (`app.use("/api", apiGuard)`), `:68-89` (`/api/readiness`) | the production composition root; default-deny gate; readiness never green on mock-only. |
| Route classification | `server/middleware/auth.ts:141-156` (`SENSITIVE_API_ROUTES`), `:171-186` (`classifyApiRoute`, default `session`), `:277-286` (sensitive ⇒ admin role + MFA/aal2) | a new privileged route MUST be added to `SENSITIVE_API_ROUTES` or it only gets `session`. |
| Config defaults | `src/lib/repositories/localRepository.ts:123` (prod-001 `numInitiallyGenerated`=3), `:137` (prod-002 `numInitiallyGenerated`=2), `:164` (prod-001 `maxRejectedBeforeEscalation`=2), `:179` (prod-002 `maxRejectedBeforeEscalation`=3) | per-product worst-case images = prod-001 3×2=**6**, prod-002 2×3=**6**; `max=6` drives the cost-cap derivation (§4 NFR-1, REQ-LGQ-004). **Do NOT cross values across products (F1).** |
| Artifact shape | `src/types.ts:132-146` (`ImageArtifact`) | has `qaScore`, `storagePath`, `status`; **no cost field**, no `modelUsed`/`promptVars` on the artifact itself (candidate `metadata.model`/`promptUsed` exists per `interfaces.ts:18-24`). Provenance+cost (C2) needs new fields. |
| Artifact assembly | `src/lib/workflow/artifactService.ts:12-63` (`createArtifactsFromSwarm`) | every candidate becomes an artifact (no silent vanish); maps evaluation → artifact. Provenance/cost fields must be threaded here. |
| Existing smoke | `scripts/smoke/openrouter-live-smoke.ts:1-60` | flag-gated (`npm run smoke:openrouter`), `--dry-run`/`--inject-drift`/`--no-completion`; catalog + one completion + key-hygiene self-check. The live-loop smoke (REQ-LGQ-008) extends this style. |

### `belegt` OpenRouter image contract (canvas R9, verified live 2026-06-15)
- Endpoint `POST /v1/chat/completions`; model `google/gemini-2.5-flash-image`; `modalities:["image","text"]`.
- `max_tokens` **must be MODEST** — default 8192 → HTTP 402 ("can only afford 337"); `max_tokens:256` → HTTP 200. (NFR-2.)
- Response: `choices[0].message.images[0].image_url.url` = base64 PNG data URI (`data:image/png;base64,…`, ~276 KB/image).
- Cost = **$0.0387 per generated image** (`usage.cost`; image_tokens ~1290).
- `ungeprüft` (verify in build, **not** downgraded to a premise): the QA/vision model scoring a real image input end-to-end (gemini-2.5-flash is vision-capable per gateway caps); latency.

---

## 3. Requirements (REQ-IDs + Given/When/Then acceptance criteria)

> Naming: `REQ-LGQ-NNN` (Live-Generate-QA). Acceptance tests `AC-LGQ-NNNx`. Every behaviour-change ships a RED-on-revert mutation proof (P4) and any negative/safety claim ships its paired guard test in the same commit (P2).

### REQ-LGQ-001 — Real `ImageGenerationProvider` (OpenRouter image call)
A production `ImageGenerationProvider` implementation calls the real OpenRouter image API and returns candidates in the existing seam shape.

- **AC-LGQ-001a (real call, contract):** *Given* a valid OpenRouter key and a rendered prompt, *When* `generate(prompt, n, 'png', quality, model, secretRef, customerData)` runs, *Then* it issues `POST {baseUrl}/v1/chat/completions` with `modalities:["image","text"]` and a **modest** `max_tokens` (NFR-2), and returns `n` candidates each with `storagePath` = the base64 PNG data URI from `choices[0].message.images[0].image_url.url`, and `metadata.{promptUsed,model,provider,quality,resolution}` populated.
- **AC-LGQ-001b (seam-compatible):** *Given* the real provider, *When* the runner calls it, *Then* the returned shape satisfies `ImageGenerationProvider` (`interfaces.ts:3-26`) with **no runner change** to the call site — drop-in for the mock.
- **AC-LGQ-001c (mock preserved):** *Given* `DEMO_LOCAL`, *When* the app runs, *Then* the mock provider is still used and the real provider is **not** invoked (real provider lives only on the server path; canvas §7a R1).
- **AC-LGQ-001d (ephemeral storage, R8):** *Given* a generated candidate, *Then* its `storagePath` is the in-memory base64 data URI; **no** durable/Supabase write occurs (Non-goal #3).
- Evidence-class target: **real-boundary-smoke** (proven via REQ-LGQ-008 smoke). Unit/contract tests are `unit-fake`/`integration-fake` (mocked HTTP) and DO NOT by themselves promote the class.

### REQ-LGQ-002 — Real `QualityGateProvider` (OpenRouter vision scoring)
A production `QualityGateProvider` implementation scores candidate images with a real OpenRouter vision model and returns evaluations in the existing seam shape.

- **AC-LGQ-002a (real vision call):** *Given* candidates with image data URIs and a `qaPrompt`+`minScore`, *When* `evaluate(...)` runs, *Then* it sends each image to the vision model and returns one evaluation per candidate with a numeric `score`, a `status ∈ {accepted, rejected, not_selected}` derived from `minScore`, a `reason`, and `detailedJson`.
- **AC-LGQ-002b (seam-compatible):** *Then* the result satisfies `QualityGateProvider` (`interfaces.ts:28-47`) with no runner change at the call site.
- **AC-LGQ-002c (no silent vanish):** *Given* a candidate the model fails to score, *Then* it is surfaced as `failed_generation`/`rejected` via `ArtifactService` (artifactService.ts:42-58), never dropped, and never faked as `accepted` (ties to REQ-LGQ-007).
- **AC-LGQ-002d (image→score path proven):** *Given* the live smoke, *Then* at least one real generated image is scored by the real vision model and the loop reaches a deterministic terminal state (retires the canvas R9 `ungeprüft` item; if the image→score path fails, the smoke FAILS LOUD).
- Evidence-class target: **real-boundary-smoke** (REQ-LGQ-008).

### REQ-LGQ-003 — Server-side run endpoint `POST /api/workflows/:id/run` (sensitive)
A new server endpoint runs the `WorkflowRunner` server-side with the server-only OpenRouter key, classified **sensitive**.

- **AC-LGQ-003a (endpoint exists, runs server-side):** *Given* an authenticated admin+MFA caller, *When* `POST /api/workflows/:id/run` is called with the run inputs, *Then* the server executes the real generate→QA loop and returns the terminal `WorkflowRun` (status `pod_ready` or `escalated`) — the client never receives or needs the OpenRouter key.
- **AC-LGQ-003b (classified sensitive):** *Given* the route, *When* `classifyApiRoute('POST', '/workflows/<id>/run')` runs, *Then* it returns `"sensitive"` because a matching pattern was **added to `SENSITIVE_API_ROUTES`** (auth.ts:141-156).
- **AC-LGQ-003c (default-deny holds):** *Given* no token / non-admin / aal1, *When* the route is called, *Then* it returns `401 AUTH_REQUIRED` / `403 ADMIN_ROLE_REQUIRED` / `403 MFA_REQUIRED_FOR_ACTION` respectively (mirrors the canonical security spec in `server/tests/auth.routes.test.ts`).
- **AC-LGQ-003d (no dispatch leg):** *Given* an accepted candidate, *Then* the run ends at `pod_ready` and **no** POD/dispatch call is made by this endpoint (value-promise #3 preserved; `assertDispatchAllowed` untouched).
- Evidence-class target: **real-boundary-smoke** (supertest vs `createApp()` for the auth matrix + the live smoke for the run).

### REQ-LGQ-004 — Hard cost cap: max-image-calls AND $ spend ceiling, derived & server-enforced
Each run is bounded by **both** a max real-image-call integer **and** a per-run $ spend ceiling, enforced server-side, with the default **derived/justified** from the active config worst-case (R3 + A3).

- **AC-LGQ-004a (image-count cap bites):** *Given* a cap of `C` images, *When* a run would issue the `C+1`-th real image call, *Then* the run is stopped with a controlled cap error (no further OpenRouter image call is made).
- **AC-LGQ-004b ($ spend ceiling bites):** *Given* a $ ceiling `S`, *When* accumulated `usage.cost` would exceed `S` before/at the next image call, *Then* the run is stopped with a controlled cap error before that call.
- **AC-LGQ-004c (derivation, not a guess — CORRECTED F1):** *Then* the cap default is computed from the active config as `max(numInitiallyGenerated × maxRejectedBeforeEscalation)` **per product** (NOT crossing values between products): prod-001 = `3 × 2 = 6` (`localRepository.ts:123` numInitiallyGenerated=3, `:164` maxRejectedBeforeEscalation=2); prod-002 = `2 × 3 = 6` (`localRepository.ts:137`, `:179`). So `max worst-case across products = 6 images ≈ 6 × $0.0387 ≈ $0.23/run` (`belegt` config defaults; price R9). The shipped default **12 images / $1.00** is `max(real worst-case)=6` **plus headroom** as a safety ceiling — documented as such, not hardcoded blind. Cap is configurable. *(Spec-sanity F1: the prior "`3 × 3 = 9` ≈ $0.35/run" figure was a confabulation — it crossed prod-001's numInitiallyGenerated=3 with prod-002's maxRejectedBeforeEscalation=3, two different products. No single product reaches 9; both reach 6.)*
- **AC-LGQ-004d (RED-on-removal guard, P2/P4):** *Given* the cap guard test, *When* the cap enforcement is reverted/removed, *Then* the test goes **RED** (proves the cap is load-bearing, not decorative).
- Evidence-class target: **real-boundary-smoke** (cap demonstrably bites against the real call in the smoke) backed by a unit guard test.

### REQ-LGQ-005 — PII redaction at the OpenRouter request boundary (hard constraint, A4 — carrier CORRECTED, F2)
**Carrier reality (belegt, `runner.ts:235-239,252,281-282,306`):** the `customerData`/`resolvedVariables` args the providers receive (`interfaces.ts:14,38`) carry ONLY **non-PII derived vars** — the runner passes `generationParams` (animal/element/dominant_element + orderNumber/iteration, `runner.ts:272-279`) and `personalizationVars` (animal/element/birth_year/dominant_element, `runner.ts:306`). The **raw PII** (`name`/`birth_date`/`birth_place`) is rendered into `templatePayload.personalization` (`runner.ts:235-239`) → the **compiled prompt STRING** (`runner.ts:252`) → passed as the FIRST arg `generate(compiledPrompt, …)` (`runner.ts:281-282`) and consumed by vision-QA via the rendered image. Therefore the redaction constraint targets the **OUTBOUND OpenRouter request body (the prompt)**, NOT the derived-var args. The constraint: the prompt sent to OpenRouter (image-gen AND vision-QA) MUST contain only non-PII derived vars (animal/element/dominant_element/birth_year), NEVER raw `name`/`birth_date`/`birth_place` — in body, header, system prompt, or metadata.

- **AC-LGQ-005a (outbound body is PII-free):** *Given* a run seeded with sentinel birth-PII tokens (unique `name`/`birth_date`/`birth_place` values), *When* the real providers call OpenRouter (image-gen **and** vision-QA), *Then* the sentinel tokens appear in **no** outbound OpenRouter request body, header, or system prompt — the prompt carries only the non-PII derived vars + score criteria (`qaPrompt`/`minScore`).
- **AC-LGQ-005b (no PII on surfaces):** *Then* the sentinel tokens appear in no log line, error message, returned `metadata`, or `qaResultJson` (carry-over of the baseline "no PII echo" guard; CLAUDE.md P2 origin).
- **AC-LGQ-005c (paired guard, P2 — re-pointed to the real carrier):** *Given* the PII guard test (named in the claim) that injects sentinel birth-PII and inspects the **captured outbound OpenRouter request body** (image-gen + vision-QA), *When* the prompt-rendering is mutated to leave raw `name`/`birth_date`/`birth_place` in the compiled prompt (the real leak path — NOT mutating `customerData`/`resolvedVariables`, which never carried PII and would be a green-while-leaking assertion), *Then* the test goes **RED**. The guard asserts on the request body the wire actually receives.
- Evidence-class target: **real-boundary-smoke** for the outbound body assertion (smoke captures the actual OpenRouter request bodies for both image-gen and vision-QA) + unit guard against the captured body.

### REQ-LGQ-006 — Per-candidate provenance + per-run cost & rejection telemetry (C2, value-promise #6)
Each candidate records its provenance (model id + prompt variables/hash + QA score); each run records summed real `usage.cost` and rejection-rate.

- **AC-LGQ-006a (per-candidate provenance):** *Then* every artifact carries `modelUsed`, the prompt-variable provenance (variables or a non-PII hash — see §10 OQ-3), and `qaScore` (extends `ImageArtifact`, types.ts:132-146, threaded via artifactService.ts).
- **AC-LGQ-006b (per-run cost + rejection):** *Then* the run result records summed `usage.cost` (real $) and rejection-rate (rejected ÷ generated), feeding cap-default tuning (A3) without re-running guesswork.
- **AC-LGQ-006c (provenance is PII-safe):** *Then* the recorded provenance contains no raw birth fields (ties to REQ-LGQ-005; if a non-PII hash is used, the pre-image is birth data and MUST NOT be stored).
- Evidence-class target: **real-boundary-smoke** (the smoke asserts the result carries non-zero real cost + provenance).

### REQ-LGQ-007 — No-fake-success / contract-drift guard (value-promise #2, R5, P7)
A real OpenRouter response shape that diverges from what the provider assumes MUST FAIL LOUD, never silently fake an accepted candidate.

- **AC-LGQ-007a (drift fails loud):** *Given* an OpenRouter response missing `choices[0].message.images[0].image_url.url` (image) or the expected score field (QA), *When* the provider parses it, *Then* it raises a controlled contract-drift error — it does **not** synthesize a placeholder image or a passing score.
- **AC-LGQ-007b (HTTP error fails loud):** *Given* a non-2xx OpenRouter response (e.g. the 402 from an over-large `max_tokens`, NFR-2), *Then* the provider raises a controlled error; the run does not record a fake-accepted artifact.
- **AC-LGQ-007c (slug-drift guard reused):** *Then* the live smoke retains the existing catalog/slug-drift check (`scripts/smoke/openrouter-live-smoke.ts` `--inject-drift`) so a removed model slug FAILS the smoke.
- Evidence-class target: **integration-fake** (drift unit tests with crafted responses) + **real-boundary-smoke** (slug-drift + 402 behavior).

### REQ-LGQ-008 — Wired-in-prod + flag-gated real-boundary smoke (P1, P7)
The real providers are provably reachable through the `createApp()` composition root, and a flag-gated smoke exercises the full live loop.

- **AC-LGQ-008a (production importer, P1):** *Given* a grep for non-test importers, *Then* the real `ImageGenerationProvider`/`QualityGateProvider` have ≥1 production importer reachable from `createApp()` via the new `POST /api/workflows/:id/run` path — `wired-in-prod = yes`, not a built-but-dead primitive.
- **AC-LGQ-008b (flag-gated live smoke, §5 success signal):** *Given* `npm run smoke:<live-loop>` with a real key, *When* the smoke runs, *Then* it triggers a real run that generates ≥1 real image, scores it with a real vision model, reaches a deterministic terminal state (`pod_ready` or `escalated`), shows the cap can bite, shows summed real cost, and self-checks NO key/PII appears in output. **This green smoke IS the success signal** (canvas §5, RESOLVED).
- **AC-LGQ-008c (opt-in, not CI):** *Then* the live smoke is NOT part of `npm test`/CI (real spend); it supports `--dry-run` for the path/shape without network/secret (mirrors the existing smoke).
- **AC-LGQ-008d (readiness reflects key, R6/P6):** *Then* OpenRouter key presence is reflected by `resolveOpenRouterCredentials().present` on a status surface; the resolved key never appears in output.
- Evidence-class target: **real-boundary-smoke** (the smoke itself); the importer check is a unit/integration test.

---

## 4. Non-functional requirements (NFRs)

| NFR | Requirement | Source / basis |
| --- | --- | --- |
| **NFR-1 — Cost ceiling** | Per-run spend is hard-bounded by BOTH a max-image-call integer AND a $ ceiling, server-enforced; default 12 images / $1.00 derived as `max(per-product worst-case)=6 images / ~$0.23` + headroom; configurable. | R3 + A3; `belegt` price $0.0387/image (R9); per-product config defaults: prod-001 3×2=6, prod-002 2×3=6 (localRepository.ts:123,164,137,179). |
| **NFR-2 — Modest `max_tokens`** | Every OpenRouter image call sets a modest `max_tokens` (the default 8192 returns HTTP 402). Use a small value proven to return 200 (256 verified; build may tune 256–402). | `belegt` R9. |
| **NFR-3 — No-PII** | No raw birth field (`name`/`birth_date`/`birth_place`) crosses the OpenRouter boundary — asserted on the **outbound request body** (the prompt, the real carrier per F2), for image-gen AND vision-QA — nor any log/error/metadata surface. | A4 / value-promise #4; CLAUDE.md P2; carrier `belegt` runner.ts:235-239,252,281-282. |
| **NFR-4 — Determinism of terminal state** | A completed run is deterministically in exactly one terminal state: `pod_ready` (accept) or `escalated` (exhaustion/cap). The cap path resolves to a terminal state, not a hang or an undefined status. | runner.ts:338-388; value-promise #2. |
| **NFR-5 — Latency** | `ungeprüft` — to be benchmarked in build (image gen + vision scoring per candidate × cap). Not a blocker; record a baseline in the verification log. Do NOT assert a latency number as a premise. | canvas R9 (`ungeprüft`). |
| **NFR-6 — Secret hygiene** | OpenRouter key read server-side only via secret-ref (default direct `OPENROUTER_API_KEY`, P6); never `VITE_`-prefixed; never echoed; status reports `present:boolean` only. | gateway `:82-104`; CLAUDE.md key-hygiene; P6. |
| **NFR-7 — Mode isolation** | `DEMO_LOCAL` keeps the mock client-side path; the real loop runs only on the server endpoint. No real OpenRouter call from the browser. | canvas §7a R1; appServices.ts:39-57. |

---

## 5. Security matrix

| Endpoint / surface | Class | Auth required | Added to `SENSITIVE_API_ROUTES`? | Secret-ref | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST /api/workflows/:id/run` (new) | **sensitive** | valid session + verified email + admin role (`owner`/`admin`/`operator`) + MFA (aal2) | **YES — pattern MUST be added** e.g. `{ method: "POST", pattern: /^\/workflows\/[^/]+\/run\/?$/ }` (auth.ts:141-156) | OpenRouter key via `OPENROUTER_API_KEY` (direct default, P6) read server-side only | Spends money ⇒ sensitive (R2 RESOLVED). Without the allowlist entry it would default to `session` only (under-protected). |
| OpenRouter outbound request | n/a (egress) | n/a | n/a | key resolved via `resolveOpenRouterCredentials` (gateway `:82-104`) | Body (the prompt) carries ONLY non-PII derived vars + score criteria — NO raw `name`/`birth_date`/`birth_place` (NFR-3 / REQ-LGQ-005, carrier corrected F2). |
| Readiness / status surfaces | session | valid session | no | reports `present:boolean` | Never echo the key value (NFR-6 / AC-LGQ-008d). |

Guard tests (extend `server/tests/auth.routes.test.ts`, the canonical security spec): the new route returns 401/403 for no-token/non-admin/aal1; no secret value appears in any response; `classifyApiRoute` returns `sensitive` for the new pattern.

---

## 6. Data model deltas

Additive only; find the owning type home first (CLAUDE.md "Type homes").

- **`ImageArtifact`** (`src/types.ts:132-146`) — add provenance fields (REQ-LGQ-006a): `modelUsed: string`, `promptVarsProvenance: string` (variables or non-PII hash — OQ-3), keep existing `qaScore`. Thread through `ArtifactService.createArtifactsFromSwarm` (artifactService.ts:12-63).
- **Run result / `WorkflowRun`** (`src/types.ts`) — add per-run telemetry (REQ-LGQ-006b): `realCostUsd?: number` (summed `usage.cost`), `rejectionRate?: number`, `imageCallCount?: number`, `capStopped?: boolean`. (Confirm home: UI type `src/types.ts` vs db-mapped `src/lib/domain/types.ts`.)
- **No** new persisted store (R8): artifacts/images stay ephemeral base64; no Supabase schema change (Non-goal #3).

---

## 7. Atomic, dependency-aware task list

| Task | REQ(s) | Depends on | Output / artifact class (P5) |
| --- | --- | --- | --- |
| **T-LGQ-1** — Add cost-cap primitive (max-image-calls + $ ceiling) as a pure, server-side enforcer module; derive default from config. | REQ-LGQ-004 | — | `src/lib/workflow/**` (or `server/**`) module + unit guard test (RED-on-removal); `stryker.config.json` `mutate` entry. |
| **T-LGQ-2** — Add OpenRouter HTTP call capability (extend gateway from selection-only to real call, or a thin provider-internal client) with modest `max_tokens` + contract-drift parsing. | REQ-LGQ-001, 002, 007, NFR-2 | — | `src/lib/modelGateway/**` and/or `src/lib/providers/**`; drift unit tests. |
| **T-LGQ-3** — Implement real `ImageGenerationProvider` (PII-redacted; ephemeral base64; provenance metadata). | REQ-LGQ-001, 005, 006 | T-LGQ-2 | `src/lib/providers/**` + unit + PII guard test asserting on the **captured outbound OpenRouter request body** (RED when raw birth fields leak into the prompt — F2; do NOT assert against `customerData`/`resolvedVariables`). |
| **T-LGQ-4** — Implement real `QualityGateProvider` (PII-redacted; image→score; no fake pass). | REQ-LGQ-002, 005, 007 | T-LGQ-2 | `src/lib/providers/**` + unit + PII guard on the **outbound vision-QA request body** (F2) + drift guard. |
| **T-LGQ-5** — Thread provenance + cost/rejection telemetry through `ArtifactService` + run result. | REQ-LGQ-006 | T-LGQ-3, T-LGQ-4 | `src/lib/workflow/artifactService.ts`, `src/types.ts` (+ `src/lib/domain/**` if owning home). |
| **T-LGQ-6** — Server-side runner composition (wire real providers into a server `WorkflowRunner` with cost-cap), distinct from the DEMO_LOCAL client wiring. | REQ-LGQ-003, 004, NFR-7 | T-LGQ-1, T-LGQ-3, T-LGQ-4, T-LGQ-5 | `server/**` (+ `src/lib/app/appServices.ts` if facade reused server-side). |
| **T-LGQ-7** — Add `POST /api/workflows/:id/run` route in `createApp()`; add pattern to `SENSITIVE_API_ROUTES`; readiness reflects OpenRouter key. | REQ-LGQ-003, 008d, security matrix | T-LGQ-6 | `server/index.ts`, `server/middleware/auth.ts`. |
| **T-LGQ-8** — Auth-matrix guard tests for the new route (extend `auth.routes.test.ts`); wired-in-prod importer check (P1). | REQ-LGQ-003, 008a | T-LGQ-7 | `server/tests/**`. |
| **T-LGQ-9** — Flag-gated live-loop real-boundary smoke (**NET-NEW harness, F3 — NOT a thin extension of `openrouter-live-smoke.ts`**, which only does catalog + one completion + key-hygiene; this drives the full generate→score→terminal loop with cap + outbound-body PII assertion): real image → real score → terminal state, cap bites, real cost, PII/key self-check on the outbound body, `--dry-run`. | REQ-LGQ-008b/c, 002d, 004, 005a | T-LGQ-7 | `scripts/smoke/**`, `package.json` smoke script. |
| **T-LGQ-10** — Verification artifacts: verification log, reality-ledger evidence, traceability evidence/wired-in-prod flips, mutation-proof notes (P4/P5). | all | T-LGQ-8, T-LGQ-9 | `docs/verification*.md`, `docs/reality/*.evidence.jsonl`, `docs/traceability.md`. |

Allowed-change scope (named, no wildcards) is the canvas "Allowed change scope" list — carried verbatim into the plan.

---

## 8. Risks (carried from canvas §8, with PRD disposition)

| Risk | Disposition in this PRD |
| --- | --- |
| R1 server-side execution | RESOLVED → REQ-LGQ-003 (`POST /api/workflows/:id/run`, server-side). |
| R2 sensitive classification | RESOLVED → security matrix + AC-LGQ-003b (added to `SENSITIVE_API_ROUTES`). |
| R3 + A3 cost cap | RESOLVED → REQ-LGQ-004 + NFR-1 (both caps, derived). |
| R4 / A4 PII leak | RESOLVED → REQ-LGQ-005 + NFR-3 (hard constraint, paired guard). |
| R5 contract drift / no-fake-success | RESOLVED → REQ-LGQ-007. |
| R6 secret-ref / P6 | RESOLVED → NFR-6 + AC-LGQ-008d. |
| R7 wired-in-prod | RESOLVED → REQ-LGQ-008a (P1 importer check). |
| R8 image storage | RESOLVED → ephemeral base64 (AC-LGQ-001d); no Supabase. |
| R9 OpenRouter contract | `belegt` (verified live); residual `ungeprüft` (image→score path, latency) carried as AC-LGQ-002d / NFR-5 to be RETIRED in build — **not** laundered into a premise. |

---

## 9. Definition of Ready / Done

**DoR (this PRD):** canvas user-confirmed ✅; all REQs testable/atomic/contradiction-free ✅; security classification explicit ✅; cost cap derived ✅; PII constraint paired with a guard ✅; success signal is the flag-gated smoke ✅; traceability rows added ✅. **COMPLETE:** PRD + canvas + Vision user-confirmed (2026-06-15); §10 OPEN QUESTIONS resolved (§10 RESOLVED block); product-owner Vision written; spec-auditor Phase 0.7 ran (F1/F2 fixed); watcher dev-entry gate-fixes applied. Status: **user-confirmed**.

**DoD (build, per CLAUDE.md P1/P2/P4/P5 + P7):** all AC tests green; the live-loop smoke green (success signal); cost-cap + PII guard tests RED-on-revert (P4); `wired-in-prod=yes` proven by a production importer (P1); no secret/PII in any output; verification log + reality-ledger evidence written; traceability `evidence` + `evidence-class` + `wired-in-prod?` updated from targets to actuals.

---

## 10. Residual gaps (MISSING / OPEN QUESTION / ASSUMPTION — not invented)

- **OQ-1 (run inputs / source of birth data for the server run):** `POST /api/workflows/:id/run` — does it take birth data in the request body, or read a pre-existing run/order from a repository? In `DEMO_LOCAL` the runner reads repos client-side; the server path's input source is unspecified. **Affects** REQ-LGQ-003 request contract + REQ-LGQ-005 (which inputs are PII-bearing). *(implementation-detail-adjacent but touches the PII acceptance criterion → ask.)*
- **OQ-2 (cap error semantics):** when the cap bites mid-run with no accepted candidate yet — is the terminal state `escalated` (reuse the exhaustion path + escalation email) or a distinct `cap_stopped` state? **Affects** NFR-4 determinism + REQ-LGQ-004 + EscalationService behavior.
- **OQ-3 (provenance form for prompt variables):** store the rendered prompt variables verbatim, or a non-PII hash? Birth-derived variables (animal/element/birth_year) are arguably non-PII, but `name`/`birth_place` in the prompt are PII. **Affects** REQ-LGQ-006a vs REQ-LGQ-005/NFR-3 — proposed: store model id + non-PII derived vars (animal/element/dominant_element/birth_year) only; never name/date/place.
- **OQ-4 (cost-cap config home):** where are the cap values configured — env (`OPENROUTER_RUN_MAX_IMAGES` / `OPENROUTER_RUN_MAX_USD`), `GenerationConfig`, or a new settings field? **Affects** REQ-LGQ-004 + data model.
- **ASSUMPTION (to confirm, not adopted silently):** the existing `run_simulation` permission check (runner.ts:105-107) plus the new `sensitive` route classification together gate the server run; no new RBAC permission is introduced this slice. Confirm this is sufficient (vs a dedicated `run_live` permission).
- **NFR-5 latency = `ungeprüft`** — benchmark in build; do not assert a number now.

These do not block PRD drafting, but **OQ-1 and OQ-3 touch acceptance criteria (PII)** and should be closed with the user before/at Vision confirmation. The rest are reversible implementation details suitable for an ADR if the user defers.

### §10 — RESOLVED (user, 2026-06-15)

- **OQ-1 → request body.** `POST /api/workflows/:id/run` takes the birth/test data IN the request body (mirrors the existing `fufire/test-run` endpoint; no persistence/Etsy this slice). The body is PII-bearing → the sensitive route protects it and the A4 provider-boundary redaction (REQ-LGQ-005) applies. REQ-LGQ-003 request contract = birth/test input in body.
- **OQ-3 → non-PII derived vars only.** Provenance stores ONLY the derived non-PII variables (`animal`/`element`/`dominant_element`/`birth_year`) + model id + QA score — NEVER `name`/`birth_date`/`birth_place`. (`promptVarsProvenance` holds the non-PII set, not verbatim rendered vars.) Reinforces REQ-LGQ-005/NFR-3.
- **OQ-2 → reuse `escalated` + distinct reason `COST_CAP_REACHED`.** When the cap bites with no accepted candidate, the run reaches the existing `escalated` terminal state carrying a distinct reason/code `COST_CAP_REACHED` (honestly distinguishable from quality-exhaustion; no new state-machine state). REQ-LGQ-004 + EscalationService.
- **OQ-4 → `GenerationConfig` field.** Cap values (`maxImagesPerRun`, `maxUsdPerRun`) live as fields on `GenerationConfig` (per-workflow/product configurable), default 12 / $1.00. REQ-LGQ-004 + data model: extend `GenerationConfig` (find the owning type home per CLAUDE.md).
- **ASSUMPTION → confirmed.** Existing `run_simulation` permission + the new `sensitive` route classification suffice; NO new `run_live` RBAC permission this slice.
- **NFR-5 latency** stays `ungeprüft` (benchmark in build, not asserted).

---

## 11. Handoff

→ `product-owner`: write `docs/vision/sizhu-live-generate-qa-loop.vision.md` from this PRD (REQ-IDs, acceptance criteria, non-goals, the §10 OPEN QUESTIONS, customer/user statements, success metric = flag-gated live smoke green). Then `spec-auditor` (Phase 0.7). **Phase 0 COMPLETE — PRD + Vision user-confirmed at the USER GATE (2026-06-15).**
