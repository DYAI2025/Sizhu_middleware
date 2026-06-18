# Product Canvas: Prompt Compile Preview Slice

Status: user-confirmed
Feature Slug: prompt-compile-preview
Confirmed by user: yes
Confirmation date: 2026-06-18
Confirmer: ben.poersch@gmail.com
Confirmation note: Confirmed at Phase 0.15, returned to draft for the Phase 0.16 Council amendment (LANE SPLIT — deterministic core carries no LLM; real OpenRouter confined to the prose lane), then RE-CONFIRMED 2026-06-18 by ben.poersch@gmail.com. CONTRA-001 resolved (deterministic mapping table = symbol authority); CONTRA-002 verified at the real boundary (live api.fufire.space emits all 11 fields, SRC-004). Includes the scope expansion (fufireResponseInterpreter.ts + fufireContract.ts).

Phase 0.15 draft (amended after OQ + CONTRA resolution 2026-06-18). Load-bearing code-claims
verified against `file:line` before entering this canvas (anti-konfabulation).

| Section | ID | Value | Source Type | Source |
|---|---|---|---|---|
| Problem | CAN-001 | Der Pfad `rawFuFireResponse + templateId → compiledPrompt` ist nicht technisch prüfbar — „wer befüllt was?" ist heute unsichtbar. `/api/v1/compile-template` existiert nur als TODO (`WorkflowBuilderView.tsx:902`); kein Compile-Service/Route. | EXPLICIT (belegt) | SRC-001, SRC-002 |
| Users / Customers | CAN-002 | Admin/Operator (klickt Button, prüft Ergebnis) + Dev-Team (Wartbarkeit, sichtbares Debugging). | EXPLICIT | SRC-001 |
| Value Promise | CAN-003 | Prüfbare, **vertrauenswürdige** Prompt-Befüllung: **deterministische Symbolwahrheit** (FIXED VERIFIED MAPPING TABLE) + sichtbare Quality Gates. Das LLM **formuliert** nur; es ist **nie Symbolautorität**. Das Bildmodell erzeugt **keinen lesbaren finalen Text** — Hanzi/Pinyin kommen als deterministisches Vektor-Overlay (§1.2). | EXPLICIT | SRC-001, SRC-003 |
| Current Alternatives | CAN-004 | TODO-Buttons ohne Backend (`WorkflowBuilderView.tsx:902/981/1047/1140`); keine sichtbare Compile-Prüfung; Run-Pfad nutzt `new MockFuFireProvider()` (`server/services/workflowRunService.ts:113`). | EXPLICIT (belegt) | SRC-002 |
| Key Capabilities | CAN-005 | (A) `POST /api/v1/compile-template`. (B) `TemplateRegistryService` mit den ZWEI Varianten aus dem Master-Prompt: `BEIJING_MODERN_MAINLAND` + `SICHUAN_CLASSICAL_MAINLAND`. (C) `BaziSymbolMapper` = die deterministische FIXED VERIFIED MAPPING TABLE (Stems/Branches/Animals/WuXing/Labels → Hanzi/Pinyin) + Validierung. (D) `PromptCompilationService` — **ZWEI Spuren (Council-Split 0.16)**: Spur 1 **deterministisch, KEIN LLM** — baut `template_placeholders`, `deterministic_overlay_plan`, `quality_gates`, `rawDataBindings` aus FuFire-Raw + Tabelle; Spur 2 **echter OpenRouter-LLM-Call NUR für die Prosa** (`image_generation_prompt` + `negative_constraints` je Variante). Das LLM fasst Symbolwerte **nie** an. Danach deterministische Post-Validation über beide Spuren. (E) `CompileValidationService` = Master-Prompt §5 + §12 Quality Gates. (F) UI-Button + Result-Panel (compiledPrompt-Payload je Variante, rawDataBindings, templatePlaceholders, qualityGates, Blocker). Output-Struktur je Variante: `template_placeholders`, `image_generation_prompt`, `negative_constraints`, `deterministic_overlay_plan`, `quality_gates` (§7/§13). | EXPLICIT | SRC-001, SRC-003 |
| Non-Goals | CAN-006 | KEIN PDF/PNG-Renderer; KEIN Gelato/POD-Dispatch; KEINE Etsy-Automation; KEINE volle CJK-Authority (nur die verifizierte Tabelle des Master-Prompts); KEINE echte Druckproduktion; KEINE Persistenz-Migration; KEINE Image-Generation-Execution (nur der image_generation_prompt-Text, kein echter Bild-Call); nur Year Pillar (keine 4-Säulen). | EXPLICIT | SRC-001, SRC-003 |
| Constraints | CAN-007 | Single-Express-Server; neue `/api`-Route in `apiGuard` klassifizieren (Default-Deny → min. `session`); kein `server/routes/`-Dir (Route in `server/index.ts` oder neues Dir). **Image-Text-Policy (hart, §1.2): das Bildmodell erzeugt keinen lesbaren Hanzi/Pinyin/Label/Datum-Text.** **Region: CN_SIMPLIFIED** (kein Traditional/JP/KR). Cohäsion: `BaziSymbolMapper` darf `fufireResponseInterpreter.ts` NICHT duplizieren — der Interpreter wird ERWEITERT (neue Felder), der Mapper hält die Hanzi-Tabelle (OQ-D, Phase-1-Planner). TDD + Guard-Test mit RED-on-revert (P1–P9). | EXPLICIT | SRC-002, SRC-003 |
| Risks | CAN-008 | Kernrisiko (gemindert): LLM glättet/erfindet Symbole → Master-Prompt §1.3 „no invented BaZi data" + §5 deterministische Validierung + §12 Gates. Branch/Animal-Swap (申↔猴) → §5 explizit verboten + Gate `branch_vs_animal_separation`. Unresolved `{{placeholder}}` → Gate. **CONTRA-002 RESOLVED (belegt, real-boundary 2026-06-18):** Live-`api.fufire.space` emittiert `data.pillars.year.{stamm,zweig}`, `data.dates.lichun_local`, `data.transition.is_before_lichun`, `data.provenance.*` — alle PRESENT (SRC-004). Rest-Detail: `data.`-Präfix muss unwrapped werden. | EXPLICIT | SRC-001, SRC-003, SRC-004 |
| Success Signal | CAN-009 | Admin klickt Button → sieht: (1) vollständig gefüllter compiledPrompt-Payload ohne unresolved `{{placeholder}}`, (2) Template/Variant, (3) FuFire-Raw-Data-Pfade (rawDataBindings), (4) Hanzi/Pinyin-Werte, (5) Quality Gates (§12), (6) Blocker bei Fehlern. PASS-Referenz (Master-Prompt §6): Geng/Shen/Monkey/Metall → 庚申 / 申 / 猴 / 金, `年柱 · gēng shēn`. BLOCKED: unknown stem/branch (SOURCE_NEEDED), unresolved placeholder, animal-as-branch, fehlende lichun-provenance, image-text-policy-Verstoß. | EXPLICIT | SRC-001, SRC-003 |
| Evidence | CAN-010 | Vitest/Supertest PASS + BLOCKED; `baziSymbolMapper` Unit-Tests (Tabelle Geng→庚 etc. + branch≠animal); `compileTemplate` Route-Tests (LLM-Client injiziert/fake im Unit-Test); Post-Validation-Tests (§5/§12) mit RED-on-revert. **REAL-BOUNDARY (Pflicht):** (a) flag-gated **echter OpenRouter-Compile-Smoke** (OQ-A); (b) flag-gated **Live-FuFire-Shape-Smoke** mit FAIL-LOUD contract-drift-guard, der `stamm`/`zweig`/`lichun`/`provenance` an der echten Boundary verifiziert (CONTRA-002 → `belegt` erst hier). evidence-class-Ziel: real-boundary-smoke. | EXPLICIT | SRC-001, SRC-003 |
| Allowed Scope | CAN-011 | `server/services/templateRegistryService.ts`, `baziSymbolMapper.ts`, `promptCompilationService.ts`, `compileValidationService.ts`, `server/index.ts` (Route) [optional `server/routes/compileTemplateRoutes.ts`], `server/middleware/auth.ts` (Klassifizierung), **`server/services/fufireResponseInterpreter.ts` + `server/contracts/fufireContract.ts` (ERWEITERT um `stamm`/`zweig`/`dates.lichun_local`/`transition.is_before_lichun`/`provenance.*` — Scope-Expansion, siehe Note)**, `src/components/WorkflowBuilderView.tsx` (Button) + UI-Result-Panel, `scripts/smoke/*` (OpenRouter- + FuFire-Shape-Smoke), Tests unter `server/tests/*` + `src/tests/*`. Andere Pipeline-Buttons (swarm/qa/pod) bleiben TODO. | EXPLICIT | SRC-001, SRC-003 |
| Unresolved Questions | CAN-012 | **OQ-A RESOLVED + Council-amended**: echter OpenRouter-Call, aber NUR in der Prosa-Spur (image_generation_prompt/negative_constraints); deterministischer Kern ohne LLM. LLM-Client im Unit-Test injiziert; Prod=real; + flag-gated Smoke. **OQ-B RESOLVED**: Template-Inhalt = User-Master-Prompt (2 Varianten, SRC-003). **OQ-C RESOLVED**: Symbol-Authority = deterministische FIXED VERIFIED MAPPING TABLE (§3); FuFire seedet nur romanisierte Keys. **OQ-E RESOLVED**: Raw-Data aus (erweiterter) FuFire-Route/Interpreter + Sample-Fixture (§6) für Tests. **CONTRA-001 RESOLVED**: Tabelle = Authority, nicht LLM/FuFire-Erfindung. **CONTRA-002 RESOLVED (belegt, real-boundary 2026-06-18, SRC-004)**: Live-Smoke gegen `api.fufire.space` bestätigt alle 11 Felder PRESENT; `data.`-Präfix-Unwrap als Integrations-Detail. **OQ-D**: Mapper vs. Interpreter-Trennung → Phase-1-Planner. | EXPLICIT | SRC-001, SRC-003, SRC-004 |

## Allowed change scope

Machine-readable rendering of CAN-011 + the P5 process/verification artifact classes. Read by
`plumbline-scope-check` / the PRIL Stop hook.

- `docs/canvas/prompt-compile-preview.canvas.md`
- `docs/prd/prompt-compile-preview.prd.md`
- `docs/vision/prompt-compile-preview.vision.md`
- `docs/traceability.md`
- `docs/plans/**`
- `docs/context/**`
- `docs/reality/**`
- `docs/verification/**`
- `docs/decisions/**`
- `server/services/templateRegistryService.ts`
- `server/services/baziSymbolMapper.ts`
- `server/services/promptCompilationService.ts`
- `server/services/compileValidationService.ts`
- `server/services/fufireResponseInterpreter.ts`
- `server/contracts/fufireContract.ts`
- `server/routes/**`
- `server/index.ts`
- `server/middleware/auth.ts`
- `src/components/WorkflowBuilderView.tsx`
- `src/components/**`
- `scripts/smoke/**`
- `server/tests/**`
- `src/tests/**`
- `package.json`
- `metrics/**`
- `docs/contracts/fufire-samples/**`
- `docs/reality/**`

> NOTE (Scope expansion, pending user confirmation at the Canvas gate): `fufireResponseInterpreter.ts`
> + `fufireContract.ts` were added beyond the brief's file list because the Master-Prompt (SRC-003)
> reads FuFire fields (`pillars.year.stamm`/`zweig`, `dates.lichun_local`, `transition.is_before_lichun`,
> `provenance.*`) that the current interpreter does NOT read (verified: only `tier`/`element`/`solar_year`).
> User chose CONTRA-002 = "live emits the fields" → the interpreter must be extended to surface them, and a
> flag-gated live FuFire smoke must prove the live shape (no laundering of the runtime claim).

## Sources

- SRC-001 — User `/agileteam` brief (Compile Preview Slice, Option B), 2026-06-18.
- SRC-002 — Repo source inspection 2026-06-18: `WorkflowBuilderView.tsx:902` (TODO), `workflowRunService.ts:113` (MockFuFireProvider), no compile/templateRegistry/baziSymbol service (find empty), `fufireResponseInterpreter.ts` reads only `pillars.year.tier`/`element` + `transition.solar_year` (no `stamm`/`zweig`/`lichun`/`provenance`).
- SRC-003 — User MASTER PROMPT artifact 2026-06-18: 2 variants (BEIJING_MODERN_MAINLAND, SICHUAN_CLASSICAL_MAINLAND), FIXED VERIFIED MAPPING TABLE (§3), FuFire field map (§2), validation rules (§5), quality gates (§12), image-text policy (§1.2), sample (§6).
- SRC-004 — REAL-BOUNDARY verification 2026-06-18: `npm run smoke:fufire -- --capture` (one real call to `api.fufire.space`, secret-hygiene PASS). Captured `docs/contracts/fufire-samples/bazi.live.response.json` + `docs/reality/fufire-live-smoke-live.report.json`. Confirms `data.pillars.year.{stamm,zweig,tier,element}`, `data.chinese.year.{stem,branch,animal}`, `data.dates.{birth_local,birth_utc,lichun_local}`, `data.transition.{solar_year,is_before_lichun,…}`, `data.provenance.{engine_version,ruleset_id,…}` all PRESENT (note the `data.` wrapper).

## User Confirmation

The assistant must not confirm this canvas. With OQ-A/B/C/E + CONTRA-001 resolved and CONTRA-002's
verification path agreed (mandatory live FuFire smoke), the canvas is ready for review. Confirm with the
exact phrase:

`I confirm this Product Vision as the basis for AgileTeam planning.`

(Canvas gate: explicit confirmation that this canvas reflects your intent, including the scope expansion note.)
