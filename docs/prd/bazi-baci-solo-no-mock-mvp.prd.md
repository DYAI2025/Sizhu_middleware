# PRD — BaZi/Baci Solo No-Mock MVP
Status: draft (NOT user-confirmed)
Feature-slug: bazi-baci-solo-no-mock-mvp
Canvas: docs/canvas/bazi-baci-solo-no-mock-mvp.canvas.md
Vision: docs/vision/bazi-baci-solo-no-mock-mvp.vision.md
Source: handover 2026-06-20 (SRC-H1); code-claims spec-sanity verified in-repo 2026-06-21.

## Funktionale Requirements (REQ-IDs stabil — aus Handover-Plan übernommen)

REQ-F-001 — Create BaZi Solo run from simulated order — P0
  AC-001: Given Sim-Order + gültiges Schema, When POST an die BaZi-Solo-Route, Then Run-ID erzeugt + persistiert.

REQ-F-002 — Call real FuFire via FuFireDataService — P0  [BLK-001 pending-verify]
  AC-002: Given echter FuFire-Key + readinessStatus READY, When Run startet, Then realer bazi-Call OHNE
          MockFuFireProvider-Import im Pfad; fehlt Config → deterministisch BLOCKED.
  (Service belegt: fufireDataService.ts:184 executeTestRun, :409 fetch.)

REQ-F-003 — Persist raw request/response bundle — P0  [BLK-002]
  AC-003: Given ein Lauf, When abgeschlossen/geblockt, Then Roh-Request + Response + gatewayIssues +
          Timestamps überleben Prozess-Restart (mit Run-ID).

REQ-F-004 — Deterministic Hanzi compile from raw — P0
  AC-004: Given reale Roh-bazi-Response, When compileLane1 läuft, Then Hanzi NUR aus Roh-FuFire-Feldern
          + deterministischem Mapper (kein LLM für Zeichen). (compileLane1 belegt: index.ts:101.)

REQ-F-005 — Reject unknown/unverified symbols — P0
  AC-005: Given unbekannte Romanisierung / unresolved placeholder / unverified Lichun, When Compile, Then BLOCK.

REQ-F-006 — Render CJK overlay deterministically — P0  [BLK-003; höchstes Bau-Risiko, D-3 in-scope; verifiziert ungebaut]
  AC-006: Given deterministicOverlayPlan + Template-Layout + Font-Policy, When Render, Then SVG mit
          EXAKTEN Hanzi-Codepoints in Text-Nodes + Codepoint-Manifest.

REQ-F-007 — Persist QA status + artifact manifest — P0  [BLK-002]
  AC-007: Given Render fertig, When QA, Then QA-State + Manifest (Format/Maße/Renderer-Version) persistiert.

REQ-F-008 — Ready only when all gates pass — P0  [BLK-004]
  AC-008: Given alle Gates (raw_data_present, fufire_success, hanzi_verified, no_unresolved_placeholder,
          lichun_verified, image_text_policy, font_policy, render_artifact_exists, persistence_ok),
          When EINE FAIL, Then NICHT ready_for_shipping.

## Harte Constraints (Lane-Trennung)
- LLM (compileLane2, index.ts:101) NUR für Bild-Prompt-Prosa. Placeholder + Overlay-Werte müssen
  vor/nach Lane-2 deep-equal sein (Test pinnt das). Zeichen/Pinyin/Labels NIE aus LLM.
- Pfad/baseUrl/authHeader NIE aus Request-Body (bestehende SSRF-Guard, fufireOperations-allowlist).

## Out-of-Scope (Phase 1)
Etsy-Prod · POD-Dispatch · Workflow-Redesign · Four-Pillars-Vollprodukt · Billing.

## Build-Gate (Status)
5/8 P0 BLOCKED auf BLK-001..004. Werte vom User geliefert (2026-06-21: FuFire-Key in .env, Supabase,
Noto Sans CJK SC OFL, SVG+PNG A4@300dpi) aber `provided`/`ungeprüft` bis in Sizhu-Repo/-Staging
verifiziert. BLOCKED bleibt sichtbar — nie als Mock/Stub/known-limitation getarnt.
