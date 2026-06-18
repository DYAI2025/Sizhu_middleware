# PRD: Prompt Compile Preview Slice

Status: user-confirmed
Confirmed by user: yes
Confirmation date: 2026-06-18
Confirmer: ben.poersch@gmail.com
Feature Slug: prompt-compile-preview
Canvas: [docs/canvas/prompt-compile-preview.canvas.md](../canvas/prompt-compile-preview.canvas.md) (user-confirmed 2026-06-18)
Author: requirements-analyst (orchestrated)
Date: 2026-06-18

## 1. Summary

An admin selects a BaZi Year-Pillar template variant (Beijing-Modern or Sichuan-Classical) and
compiles a **preview** from a real FuFire response: the system deterministically fills the verified
Hanzi/Pinyin symbol values + quality gates (NO LLM), and uses a real OpenRouter call ONLY to formulate
the two image-prompt prose texts. The UI shows the compiled payload, the raw-data bindings, the
template placeholders, the quality gates, and any blockers. No renderer, no POD, no Etsy, no image
generation execution.

This realizes the Canvas value (CAN-003): **deterministic symbol truth, LLM never a symbol authority.**

## 2. Data model (real-boundary-verified, SRC-004)

FuFire response (top-level `{ _note, data }`; the compiler consumes `data`, unwrapping the `data.` prefix):

```
data.pillars.year     = { stamm, zweig, tier, element }     // stamm=romanized stem (e.g. "Geng"), zweig=romanized branch (e.g. "Wu"/"Shen")
data.chinese.year     = { stem, branch, animal }            // e.g. animal="Horse"
data.dates            = { birth_local, birth_utc, lichun_local }
data.transition       = { solar_year, is_before_lichun, lichun_year_start, lichun_next }
data.provenance       = { engine_version, parameter_set_id, ruleset_id, ephemeris_id, computation_timestamp, ... }
```

Symbol authority = the FIXED VERIFIED MAPPING TABLE (Master-Prompt §3, SRC-003): Heavenly Stems,
Earthly Branches, Zodiac animals, Wu-Xing phases, fixed labels → `{ hanzi, pinyin, ... , source_status }`.

`CompiledTemplate` (per variant): `{ variant_id, region_policy: "CN_SIMPLIFIED", template_placeholders,
image_generation_prompt, negative_constraints, deterministic_overlay_plan, quality_gates }` (Master-Prompt §7/§13).

## 3. Requirements

| REQ | Statement | Lane |
|---|---|---|
| REQ-001 | `POST /api/v1/compile-template` accepts `{ templateId, rawFuFireResponse }` (or a request that fetches it) and returns the `CompiledTemplate` payload(s) + blockers. Classified in `apiGuard` (min. `session`). | route |
| REQ-002 | `TemplateRegistryService` exposes the two variants `bazi_solo_beijing_modern_v1` (BEIJING_MODERN_MAINLAND) + `bazi_solo_sichuan_classical_v1` (SICHUAN_CLASSICAL_MAINLAND) from SRC-003. Unknown templateId → BLOCKED. | det |
| REQ-003 | Extend `fufireResponseInterpreter.ts` + `fufireContract.ts` to read `data.pillars.year.{stamm,zweig}`, `data.dates.lichun_local`, `data.transition.is_before_lichun`, `data.provenance.*` (unwrap `data.`). Existing reads (tier/element/solar_year) unchanged (no regression). | det |
| REQ-004 | `BaziSymbolMapper` encodes the **COMPLETE** authority (10 Heavenly Stems + 12 Earthly Branches + 5 Wu-Xing phases + zodiac + fixed labels); the master-prompt §3 entries are VERIFIED seeds but the table must be complete, else most real inputs falsely `SOURCE_NEEDED` (FINDING-1). Lookups are **ROLE-KEYED**: `stamm` resolves ONLY against the stem table, `zweig` ONLY against the branch table — names collide across roles (e.g. "Wu" = stem 戊/earth AND branch 午/Horse/fire; verified 1990 sample SRC-004) (FINDING-2). Unknown token → `SOURCE_NEEDED` (no guess, §1.3). | det |
| REQ-005 | `PromptCompilationService` **Lane 1 (deterministic, NO LLM)**: builds `template_placeholders`, `deterministic_overlay_plan`, `rawDataBindings` from FuFire-raw + mapper. | det |
| REQ-006 | `PromptCompilationService` **Lane 2 (LLM prose)**: real OpenRouter call formulates `image_generation_prompt` + `negative_constraints` per variant. The LLM receives the validated package; it MUST NOT alter symbol values. LLM client is dependency-injected (faked in unit tests, real in prod). | llm |
| REQ-007 | `CompileValidationService` enforces Master-Prompt §5 + §12 gates: no unresolved `{{placeholder}}`; `branch != animal` (申≠猴, both directions); no unknown symbols; lichun/provenance present; image-text policy (no readable Hanzi/text from image model); claim-safety (no fate/health/wealth/love/career claims). Each gate → `{ gate, required, status }`. | det |
| REQ-008 | UI: a "Compile Preview" button in `WorkflowBuilderView.tsx` calls REQ-001; a Result Panel renders `compiledPrompt` payload, `rawDataBindings`, `templatePlaceholders`, `qualityGates`, and blockers. | ui |
| REQ-009 | Real-boundary evidence: flag-gated OpenRouter compile smoke (Lane 2) + a FuFire shape smoke with a FAIL-LOUD contract-drift guard (asserts `stamm`/`zweig`/`lichun`/`provenance` present). Opt-in, not CI. | evidence |

ASSUMPTION (confirm at USER GATE): the captured 1990 sample resolves to `stamm="Geng"`, `zweig="Wu"`
(午/Horse/马), `element="Metall"` (金) — used as the deterministic test fixture; the §6 Geng/Shen/Monkey
(庚申) reference exercises the Shen branch path. No live FuFire call required in unit tests.

## 4. Acceptance criteria (Given/When/Then)

- **AC-001 (REQ-001/005)** — Given a valid FuFire response + `templateId=bazi_solo_beijing_modern_v1`, When `POST /api/v1/compile-template`, Then 200 with a `CompiledTemplate` whose `template_placeholders` contain NO unresolved `{{placeholder}}`.
- **AC-002 (REQ-004)** — Given `stamm="Geng"`, When mapped, Then `{hanzi:"庚", pinyin:"gēng", wuxing_hanzi:"金"}`; Given `zweig="Shen"`, Then `{hanzi:"申", animal:"猴"}`. (PASS reference §6.)
- **AC-002b (REQ-004, role-keyed collision, FINDING-2)** — Given the verified live sample `stamm="Geng"`, `zweig="Wu"` (1990, SRC-004), When mapped role-keyed, Then stem→`庚/gēng` AND branch `"Wu"`→`午/wǔ` (Horse/马) — NEVER the stem `戊`. A flat (non-role-keyed) lookup that returns `戊` for `zweig="Wu"` must make this test go RED.
- **AC-003 (REQ-007, BLOCKED)** — Given an unknown stem, When compiled, Then year-pillar status `SOURCE_NEEDED` and the route returns a BLOCKED result (no rendered pillar), NOT a guessed value.
- **AC-004 (REQ-007, BLOCKED)** — Given a payload that places animal `猴` in the Earthly-Branch slot (or `申` in the animal slot), When validated, Then the `branch_vs_animal_separation` gate FAILS → BLOCKED.
- **AC-005 (REQ-006/007)** — Given Lane 2 output, When validated, Then the `image_generation_prompt` contains no final readable Hanzi instruction beyond the overlay placeholders and the `negative_constraints` include the §10 policy; the LLM output never changes a symbol value (diff vs Lane-1 placeholders = 0).
- **AC-006 (REQ-007, BLOCKED)** — Given `dates.lichun_local` or `transition.is_before_lichun` missing, When compiled, Then provenance status `API_VERIFIED_REQUIRED` is surfaced (not silently dropped).
- **AC-007 (REQ-008)** — Given a compiled result, When the admin clicks Compile Preview, Then the panel shows compiledPrompt, rawDataBindings, templatePlaceholders, qualityGates, and blockers (Canvas CAN-009 1–6).

## 5. NFRs

- **NFR-SEC-1** — `/api/v1/compile-template` is default-deny gated (≥ session); add its pattern to `apiGuard` classification.
- **NFR-SEC-2** — Secret hygiene: OpenRouter + FuFire keys via secret-ref indirection; never echoed in response/logs (guard test).
- **NFR-DET-1** — Determinism: identical FuFire-raw + templateId → identical Lane-1 placeholders/gates (Lane 1 has no LLM nondeterminism).
- **NFR-INV-1 (hard)** — Image-text policy: the image model is never asked to render readable Hanzi/Pinyin/labels/dates; only blank zones + the overlay plan (§1.2).

## 6. Security matrix

| Surface | Threat | Control |
|---|---|---|
| compile route | unauthenticated access | apiGuard session classification (NFR-SEC-1) + test |
| OpenRouter call | key leak | secret-ref indirection + secret-hygiene self-check (REQ-009) |
| LLM output | invented symbols / unsupported claims | §5 + §12 deterministic post-validation (REQ-007); LLM confined to prose lane (REQ-006) |
| FuFire fetch | SSRF / untrusted shape | reuse existing fufire SSRF guards + contract-drift guard (REQ-009) |

## 7. Atomic task sequence (→ Phase 1 planner / kanban)

1. T1 — `fufireContract.ts` + `fufireResponseInterpreter.ts`: read new fields (RED test first). [REQ-003]
2. T2 — `baziSymbolMapper.ts`: FIXED TABLE + lookups + SOURCE_NEEDED (RED). [REQ-004]
3. T3 — `templateRegistryService.ts`: two variants from SRC-003 (RED). [REQ-002]
4. T4 — `compileValidationService.ts`: §5/§12 gates (RED, incl. branch≠animal). [REQ-007]
5. T5 — `promptCompilationService.ts` Lane 1 deterministic (RED). [REQ-005]
6. T6 — `promptCompilationService.ts` Lane 2 LLM prose (injected client; RED). [REQ-006]
7. T7 — `POST /api/v1/compile-template` route + apiGuard classification (supertest RED). [REQ-001, NFR-SEC-1]
8. T8 — UI button + Result Panel in `WorkflowBuilderView.tsx` (+ panel component). [REQ-008]
9. T9 — flag-gated OpenRouter + FuFire shape smokes (contract-drift guard). [REQ-009]

## 8. Open items (MISSING / for USER GATE)

- The exact MVP template prose for the two `image_generation_prompt` texts comes from SRC-003 §8/§9 — used verbatim as the Lane-2 seed/spec.
- OQ-D (mapper vs interpreter boundary) is a Phase-1 architecture decision for the planner (cohesion: interpreter surfaces raw stem/branch; mapper holds the Hanzi table).
