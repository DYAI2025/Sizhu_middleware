# Product Canvas — BaZi/Baci Solo No-Mock MVP
Feature-slug: bazi-baci-solo-no-mock-mvp
Status: user-confirmed (2026-06-21, ben.poersch@gmail.com; post-council)
Source: Plumbline AgileTeam-Intake handover 2026-06-20 (SRC-H1); spec-sanity verified in-repo 2026-06-21.

## CAN-001 Problem — EXPLICIT
Mock-Pfad als MVP liefert ungeprüfte Zeichen; nicht auditierbar, nicht verkaufbar.
## CAN-002 Target User / JTBD — EXPLICIT (D-1)
Operator: Echt-Lauf auditierbar produzieren. Endkäufer: korrektes Produkt erhalten.
## CAN-003 Current Workaround — EXPLICIT
MockFuFireProvider / MockPod / MockMail Workflow-Pfad (verifiziert appServices.ts:45).
## CAN-004 Value Proposition — EXPLICIT
Echte Engine → deterministische Hanzi → deterministisches CJK-Overlay → QA-Gates → persistenter,
rückverfolgbarer Ready-Zustand.
## CAN-005 Success Signal — EXPLICIT
Ein dokumentierter Request erzeugt in Staging mit echtem FuFire-Key ein persistiertes
ready_for_shipping ODER deterministischen BLOCKED-Grund.
## CAN-006 Core Use Case — EXPLICIT
Sim-Order → echter FuFire-bazi-Call (`FuFireDataService.executeTestRun`, fufireDataService.ts:184) →
Roh persistiert → Hanzi-Compile deterministisch (`compileLane1`, index.ts:101) → CJK-Render (SVG +
Codepoint-Manifest, NEU) → QA-Gates → Ready/Blocked.
## CAN-007 Non-Goals — EXPLICIT
(s. Vision §6)
## CAN-008 Risks / Contradictions
- BLK-003 (BLOCKER) Kern-AC deterministischer CJK-Renderer hängt an ungebauter Komponente (verifiziert: kein SVG/codepoint-Overlay-Renderer im Tree); D-3 in-scope, höchstes Bau-Risiko.
- BLK-002 (BLOCKER) Persistenz für Runs/Artefakte fehlt (verifiziert: keine RunRepository/saveRun) → "survives restart" unbewiesen.
- BLK-001 (VERIFIED lokal): echter FuFire-Key löst auf + Real-Call funktioniert — `smoke:fufire` PASS (bazi/wuxing/fusion ok, kein contract-drift, secret-hygiene ✓; fufireDataService.ts:409 fetch). **Konfabulation-Korrektur (P6):** autoritativer Key-Var ist `SECRET_REF_FUFIRE_API_KEY` (via `FUFIRE_API_KEY_SECRET_REF`-Indirektion, index.ts:134/176), NICHT der bare `FUFIRE_API_KEY` aus dem Handover; base-url via `FUFIRE_BASE_URL` (gesetzt), nicht hardcoded `api.fufire.space`. Lokale .env setzt beide Pfade → löst. **Railway/Staging-Restrisiko:** Key MUSS unter `SECRET_REF_FUFIRE_API_KEY` liegen (P6-Deploy-Falle).
- BLK-004 (BLOCKER) Shipping-Artefakt-Schema nicht definiert → "Ready" hat kein Ziel-Schema.
## CAN-009 Evidence Needed
Echter FuFire-Key (Staging-Auflösung) · durable Persistenz-Config (Supabase) · lizenzierte CJK-Font
(Noto Sans CJK SC OFL) + Datei im Repo · Shipping-Artefakt-Definition (SVG+PNG A4@300dpi Manifest).
## CAN-010 Blockers
BLK-001 FuFire-Key (pending-verify) · BLK-002 Persistenz-Config · BLK-003 CJK-Font-Policy/Lizenz +
Renderer · BLK-004 Shipping-Artefakt-Definition · BLK-005 (entfällt) Image/QA-Provider-Creds.

## Allowed change scope
- `docs/vision/bazi-baci-solo-no-mock-mvp.vision.md`
- `docs/canvas/bazi-baci-solo-no-mock-mvp.canvas.md`
- `docs/prd/bazi-baci-solo-no-mock-mvp.prd.md`
- `docs/traceability.md`
- `docs/plans/**`
- `docs/context/**`
- `docs/reality/**`
- `docs/verification/**`
- `docs/decisions/**`
- `server/services/**`
- `server/routes/**`
- `server/index.ts`
- `src/lib/workflow/**`
- `src/lib/providers/**`
- `src/lib/repositories/**`
- `src/types.ts`
- `supabase-schema.sql`
- `assets/fonts/**`
- `server/tests/**`
- `src/tests/**`
- `scripts/smoke/**`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `metrics/**`

(Additiv: bestehende Workflow-Routen NICHT entfernen bis Staging-Smoke grün.)

## User Confirmation
Der Assistant darf diesen Canvas NICHT selbst bestätigen (Status bleibt `draft`). Erst nach dem
expliziten User-Satz wird er `user-confirmed`:
`Ich bestätige, dass Product Canvas und Product Vision meine Absicht korrekt wiedergeben und als Grundlage für AgileTeam Planning verwendet werden dürfen.`

## Council SHARPEN amendments (adopted by user 2026-06-21, re-confirm pending)
Phase-0.16 council verdict = SHARPEN (3/3). User adopted the full bundle + spike-first. Goal unchanged
(full no-mock bazi-solo MVP); APPROACH sharpened so the no-mock guarantee is real AT THE PIXEL, not
just at the API boundary.

- **AM-1 Renderer approach (REQ-F-006 reframe):** do NOT hand-roll a CJK/SVG renderer. Hanzi already
  exist as typed data (compileContract.ts:34-41). Use an off-the-shelf font lib (fontkit / resvg) to
  OUTLINE glyphs to paths; assert codepoint→path fidelity. Off-the-shelf strictly safer than hand-rolled.
- **AM-2 Two NON-DEFERRABLE hard-gates** (truth lives at the pixel):
  - (a) Render-back glyph integrity: after render, extract each CJK codepoint from the OUTPUT, byte-equal
    vs expected; FAIL on Tofu/substitution. NFC-normalize all CJK at the plan boundary + idempotence assert.
  - (b) Lichun→pillar DERIVATION (not label): assert the printed year-pillar is recomputed from
    is_before_lichun + solar year (fufireResponseInterpreter.ts:592), NOT copied from a label; a
    Feb-3 / Feb-4 fixture pair MUST produce DIFFERENT year-pillars.
- **AM-3 Slice-1 (thinner):** sim-order → real bazi (✓ verified) → persist raw (Supabase) → existing
  compile-lane → SVG via off-the-shelf lib (paths outlined) → ONE load-bearing gate (codepoint→path
  golden-hash). DEFER to slice-2: PNG raster, A4@300dpi exactness, manifest versioning, the other QA
  gates. NEVER defer: AM-2 (a)+(b).
- **AM-4 Spike FIRST:** isolated 1-file proof on ALREADY-captured FuFireTestRunResult data — does Noto
  Sans CJK SC render every codepoint at print resolution without Tofu? Success = render-back byte-equality
  on the 戊/午 collision + a lichun boundary pair. If NO → whole MVP blocked, no persistence/gate effort wasted.
- **AM-5 Blind-spot:** persistence is ALSO a real unknown (the Supabase template-store stub throws today);
  prove raw-response durability across the boundary, don't assume the renderer is the only risk. Hand to
  the builder only when AM-2 (a)+(b) exist AND go RED on revert.
