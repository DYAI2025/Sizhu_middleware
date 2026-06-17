# PRD: Sizhu Agent-Safe Ops

Status: ready-for-user-confirmation
Feature Slug: sizhu-agent-safe-ops
Owner: ben.poersch@gmail.com
User Confirmation Required: yes

## Source Summary

Umbrella-Intake über drei Epics aus dem Architektur-Audit und der Diagnose-Roadmap:
- **Epic A — Agent-Safe Truth & Dispatch-Gate** (Audit C-1/C-2, GoalForge Slice A)
- **Epic B — Deeper MCP-Consolidation** (ADR-0001 Folgearbeit, Slice B)
- **Epic C — Contract-Backbone** (Diagnose Sprint 1, Slice C: Schemas + State-Machine)

Quellen: SRC-001 Audit, SRC-002 ADR-0001, SRC-003 Diagnose, SRC-004 Gap-Analyse, SRC-005 User-Entscheidungen 2026-06-17, SRC-006 CLAUDE.md P1–P9.

## Problem Statement

| Field | Value | Source Type | Source |
|---|---|---|---|
| Problem Statement | Die POD-Pipeline ist nie end-to-end getestet; die agentenseitige `/api`-/MCP-Surface mischt reale, lügende (leere Listen, Shape-only-„READY") und un-gegate-te Elemente. Der Dispatch-Pfad umgeht das QA/Approval-Gate. Damit können Agenten nicht sicher konfigurieren, warten oder im Notfall eingreifen. | EXPLICIT | SRC-001 |

## Target Users

| ID | User | Source Type | Source |
|---|---|---|---|
| USER-001 | Sizhu-Operator (admin/owner, MFA aal2) | EXPLICIT | SRC-005 |
| USER-002 | Remote-AI-Agent (Claude Code, Codex, Hermes, openclaw) über MCP | EXPLICIT | SRC-005 |

## Goals

- Den Real-Geld-Dispatch-Pfad serverseitig hinter ein durchgesetztes, signiertes Approval-Gate stellen (Epic A).
- Die agentenseitigen Read/Validate-Endpunkte wahrheitsgemäß machen (Epic A).
- Eine einzige Quelle der Wahrheit für die MCP-Tool-Definitionen über beide Transporte (Epic B).
- Ein Vertrags-Backbone (Order/ProductTemplate/WorkflowState/Event) + granulare State-Machine als Typen/Schemas (Epic C).

## Non-Goals

- Keine reale Persistenz-Implementierung (Supabase-Repos bleiben Stub).
- Keine FuFire-RAW-Verdrahtung in den Run, keine QG1/QG2-Trennung, kein Gelato-Adapter, kein Etsy-Intake-Adapter.
- Kein Fix von H-1 (Placeholder-Bild) / H-2 (QA Default-Pass) in diesem Run.

## Assumptions

- ASSUMPTION: Der signierte Approval-Token wird serverseitig verifizierbar erzeugt (Signatur + Ablauf + Audit-Felder); exakter Algorithmus offen (OQ-001).
- ASSUMPTION: Ehrliche Read-Endpunkte geben `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED` zurück, solange keine Persistenz existiert (OQ-003).

## Open Questions

- OQ-001: Wer signiert den Approval-Token (server-gehaltener Private Key vs. Operator-Key) und wie werden Schlüssel rotiert/Token widerrufen? (Spike als erste Run-Aufgabe)
- OQ-002: stdio-Surface (`server/mcp`) entfernen oder strikt aus dem geteilten Katalog generieren?
- OQ-003: Read-Endpunkte `NOT_IMPLEMENTED` vs. temporärer In-Memory-Store für Demo-Beobachtbarkeit?
- OQ-004: H-1/H-2 bestätigt out-of-scope für diesen Run?

## Requirements

| Requirement ID | Requirement | Priority | Source Type | Source |
|---|---|---|---|---|
| REQ-001 | `POST /api/fulfillment/pod/dispatch` setzt vor `dispatchArtifact()` ein serverseitiges Gate durch: gültiger signierter Approval-Token UND Artifact-QA-Status; sonst `403 DISPATCH_NOT_ALLOWED`. | P0 | EXPLICIT | SRC-001, SRC-005 |
| REQ-002 | Signierter Approval-Token-Contract: server-seitig verifizierbares Objekt (issuer, workflowRunId, artifactId, expiry, nonce, signature); manipuliert/abgelaufen → `APPROVAL_TOKEN_INVALID`. | P0 | EXPLICIT | SRC-005 |
| REQ-003 | `GET /api/workflows/*` und `GET /api/gateway-issues` liefern keinen fabrizierten leeren Erfolg mehr, sondern `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED`, solange keine reale Quelle angebunden ist. | P0 | EXPLICIT | SRC-001 |
| REQ-004 | `POST /api/fulfillment/pod/validate-dispatch` gibt für ein nicht-akzeptiertes/nicht-approbiertes Artifact NICHT `READY_FOR_DISPATCH` zurück (echte Prüfung ODER Kennzeichnung `VALIDATION_SHAPE_ONLY`). | P1 | EXPLICIT | SRC-001 |
| REQ-005 | `sizhu_pod_dispatch` wird in der MCP-Surface nur bei `MCP_ENABLE_DISPATCH=true` registriert; Tool-Beschreibung spiegelt den realen Gate-Zustand wider. | P1 | EXPLICIT | SRC-001 |
| REQ-006 | Eine einzige geteilte Tool-Katalog-Quelle definiert Name + Beschreibung + Input-Schema + Sensitivity; beide Transporte (`server/mcp` stdio, `mcp-server` HTTP) konsumieren sie — keine divergierenden Hand-Definitionen. | P1 | EXPLICIT | SRC-002, SRC-005 |
| REQ-007 | Der redundante Transport wird aufgelöst: stdio-Surface entweder entfernt ODER strikt aus dem geteilten Katalog generiert (Entscheidung OQ-002). | P2 | EXPLICIT | SRC-002 |
| REQ-008 | Guard-Test sichert Tool-Parität (gleiche Namen für geteilte Fähigkeiten über beide Transporte) UND dass gefährliche Tools (Dispatch) per Default aus sind. | P1 | EXPLICIT | SRC-006 |
| REQ-009 | `OrderInputSchema` und `ProductTemplateSchema` als typisierte Contracts (JSON-Schema/TS-Typen): required personalization fields, fufire operations, layout_contract, expected_outputs. | P1 | EXPLICIT | SRC-003 |
| REQ-010 | Granulare `WorkflowState`-Machine (order_received … qg1_passed … awaiting_dispatch_approval … dispatch_confirmed … customer_notified … escalated/failed) mit erlaubten Transitionen + Terminalzuständen; `assertDispatchAllowed` referenziert die granularen Zustände. | P1 | EXPLICIT | SRC-003 |
| REQ-011 | `WorkflowEvent` + Record-Contracts (RawFuFireDataRecord, RenderedTemplateRecord, PrintDocumentRecord, QualityGateReport, GelatoPreflightRecord, CustomerNotificationRecord) als Schemas/Typen — ohne Laufzeit-Persistenz. | P2 | EXPLICIT | SRC-003 |

## Acceptance Criteria

| AC ID | Requirement ID | Given | When | Then | Source Type |
|---|---|---|---|---|---|
| AC-001 | REQ-001 | eine Dispatch-Anfrage ohne gültigen signierten Approval-Token | `POST /api/fulfillment/pod/dispatch` aufgerufen wird | antwortet der Server `403 DISPATCH_NOT_ALLOWED` und es läuft keine Dispatch-Arbeit (kein Provider-Call) | EXPLICIT |
| AC-002 | REQ-001 | ein fabriziertes Artifact `{status:'accepted'}` ohne signierten Token | Dispatch aufgerufen wird | entscheidet der Serverzustand (nicht das Artifact-Feld) → Ablehnung `403` | EXPLICIT |
| AC-003 | REQ-002 | ein manipulierter oder abgelaufener Approval-Token | die Route ihn verifiziert | wird er mit `APPROVAL_TOKEN_INVALID` abgelehnt | EXPLICIT |
| AC-004 | REQ-001 | ein gültiger Approval-Token + akzeptiertes Artifact (Test-Doubles) | Dispatch aufgerufen wird | passiert das Gate und ein Audit-Eintrag (tokenId, runId, artifactId, approver) wird erzeugt | ASSUMPTION |
| AC-005 | REQ-003 | keine reale Persistenzquelle konfiguriert | `GET /api/workflows/*` aufgerufen wird | ist die Antwort `NOT_IMPLEMENTED`/`SOURCE_NOT_CONFIGURED`, kein `200 {workflows:[]}` als Erfolg | EXPLICIT |
| AC-006 | REQ-004 | ein nicht-akzeptiertes Artifact | `validate-dispatch` aufgerufen wird | ist die Antwort NICHT `READY_FOR_DISPATCH` (Fehlprüfung oder Label `VALIDATION_SHAPE_ONLY`) | EXPLICIT |
| AC-007 | REQ-005 | `MCP_ENABLE_DISPATCH` ist nicht gesetzt | ein Agent `tools/list` aufruft | ist `sizhu_pod_dispatch` nicht in der Liste | EXPLICIT |
| AC-008 | REQ-006 | der geteilte Katalog definiert Tool X | beide Transporte starten | exponieren beide identischen Namen + Input-Schema für X (eine Quelle) | EXPLICIT |
| AC-009 | REQ-007 | die Konsolidierung ist umgesetzt | nach hand-gepflegten Tool-Namenslisten gegrept wird | existiert keine zweite divergierende Definition mehr | EXPLICIT |
| AC-010 | REQ-008 | der Paritäts-Test | ausgeführt wird | bestätigt gleiche geteilte Namen + Dispatch-off-by-default; Revert der Regel → Test wird RED | EXPLICIT |
| AC-011 | REQ-009 | `OrderInputSchema`/`ProductTemplateSchema` | eine ungültige Beispiel-Order/-Template validiert wird | wird sie mit feldgenauen Fehlern abgelehnt | EXPLICIT |
| AC-012 | REQ-010 | die granulare State-Machine | ein illegaler Zustandsübergang versucht wird | wird er abgelehnt; Terminalzustände sind unveränderlich; `assertDispatchAllowed` nutzt granulare Zustände | EXPLICIT |
| AC-013 | REQ-011 | die Record-Contracts | ein Beispiel-Record validiert wird | wird Schema-Konformität geprüft (nur Typen; keine Laufzeit-Persistenz behauptet) | EXPLICIT |

## Non-Functional Requirements

| NFR ID | Requirement | Source Type | Source |
|---|---|---|---|
| NFR-001 | Jede Verhaltensänderung liefert einen Guard-Test mit RED-on-revert-Beweis im Commit-Body (P4). | EXPLICIT | SRC-006 |
| NFR-002 | `wired-in-prod` = ≥1 Produktions-Importer (Importer-Grep), nicht nur Tests (P1). Speziell: `assertDispatchAllowed`/Gate muss einen Server-Routen-Aufrufer haben (P9). | EXPLICIT | SRC-006 |
| NFR-003 | Keine Secrets/PII in Antworten oder Logs; Approval-Token-Signatur verifizierbar, kein Klartext-Approval. | EXPLICIT | SRC-001 |
| NFR-004 | `npm run lint` (tsc) + `npm run test` grün; geänderte kritische Module in die Mutation-Liste. | EXPLICIT | SRC-006 |

## Risks

| Risk ID | Risk | Source Type | Source |
|---|---|---|---|
| RISK-001 | Signed-Token ohne Persistenz → Replay/Revocation; Mitigation: kurze Expiry + Nonce + Audit-Trail. | EXPLICIT | SRC-005 |
| RISK-002 | Ehrliche Endpunkte (`NOT_IMPLEMENTED`) brechen Konsumenten, die Arrays erwarten (UI/MCP). | EXPLICIT | SRC-001 |
| RISK-003 | Geteilter Katalog über Paketgrenze (`mcp-server` eigenes npm-Paket) → Build/Publish-Komplexität. | EXPLICIT | SRC-002 |
| RISK-004 | H-1 (Placeholder-Bild) + H-2 (QA Default-Pass) bleiben offen → Pipeline kann weiter Fake-Erfolg erzeugen. | EXPLICIT | SRC-001 |
| RISK-005 | Contract-only State-Machine driftet ggü. grobem Laufzeit-Zustand bis ein späterer Slice sie verdrahtet. | EXPLICIT | SRC-003 |

## Evidence Needed

| Evidence ID | Requirement ID | Evidence Needed | Source Type |
|---|---|---|---|
| EV-001 | REQ-001 | Importer-Grep: Gate hat Server-Routen-Aufrufer; 403-Test mit RED-on-revert | EXPLICIT |
| EV-002 | REQ-002 | Unit-Tests: gültig/manipuliert/abgelaufen → korrektes Verdikt | EXPLICIT |
| EV-003 | REQ-003 | Routen-Test: kein `200 {workflows:[]}`/`{issues:[]}`-Erfolg mehr | EXPLICIT |
| EV-004 | REQ-004 | Test: nicht-akzeptiertes Artifact ⇏ READY_FOR_DISPATCH | EXPLICIT |
| EV-005 | REQ-005 | Tool-Registry-Test: ohne Flag kein `sizhu_pod_dispatch` | EXPLICIT |
| EV-006 | REQ-006 | Grep/Test: eine Katalog-Quelle, beide Transporte konsumieren sie | EXPLICIT |
| EV-007 | REQ-007 | Entscheidung dokumentiert (ADR-Folge); keine Doppel-Definition mehr | EXPLICIT |
| EV-008 | REQ-008 | Paritäts-Test grün; Revert → RED | EXPLICIT |
| EV-009 | REQ-009 | Schema-Validierungstests (valide/invalide Samples) | EXPLICIT |
| EV-010 | REQ-010 | State-Machine-Tests (legale/illegale Transitionen, Terminalzustände) | EXPLICIT |
| EV-011 | REQ-011 | Schema-Konformitätstests für Record-Typen | EXPLICIT |

## Links

- Vision: `docs/vision/sizhu-agent-safe-ops.vision.md`
- Canvas: `docs/canvas/sizhu-agent-safe-ops.canvas.md`
- Traceability: `docs/traceability.md`

## User Confirmation Required

The assistant must not confirm this PRD. Siehe Confirmation-Block.
