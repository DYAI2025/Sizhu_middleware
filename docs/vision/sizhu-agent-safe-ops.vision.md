# Product Vision: Sizhu Agent-Safe Ops

Status: ready-for-user-confirmation
Feature Slug: sizhu-agent-safe-ops
Confirmation Status: pending-user-confirmation

## Source Map

| Source ID | Source |
|---|---|
| SRC-001 | docs/audit/2026-06-17-architecture-mcp-audit.md (Befunde C-1, C-2, H-3) |
| SRC-002 | docs/decisions/0001-canonical-mcp-surface.md (ADR Slice B) |
| SRC-003 | „Die wichtigste Architekturdiagnose" (Diagnose-Roadmap, Sprint 1) |
| SRC-004 | sizhu_gap_analysis_report.md (G-01..G-12) |
| SRC-005 | User-Intake-Entscheidungen 2026-06-17 (4 Forks: Umbrella / Deeper-B / Contracts+SM / Signed-Token) |
| SRC-006 | CLAUDE.md Verifikationskonventionen P1–P9 |

## Product Vision Board

| Area | ID | Value | Source Type | Source | User Decision Needed |
|---|---|---|---|---|---|
| Target Group | VIS-001 | Sizhu-Operatoren und Remote-AI-Agenten (Claude Code, Codex, Hermes, openclaw), die die deployte Instanz `sizhu.fufire.space` für Konfiguration, Wartung und Notfälle bedienen. | EXPLICIT | SRC-005 | no |
| User Needs | VIS-002 | Runs wahrheitsgemäß beobachten, QA/Gateway-Zustand diagnostizieren, Konfiguration prüfen und einen POD-Dispatch **ausschließlich nach serverseitig durchgesetztem Approval** auslösen — ohne lügende Sensoren oder un-gegate-te Geld-Pfade. | EXPLICIT | SRC-001 | no |
| Product / Feature | VIS-003 | Eine agenten-sichere Ops-Schicht: gehärtete `/api`-Gates (Slice A), eine konsolidierte MCP-Surface mit einer Quelle der Wahrheit (Slice B) und ein Vertrags-Backbone aus Schemas + granularer State-Machine (Slice C). | EXPLICIT | SRC-005 | no |
| Product Value | VIS-004 | Agenten können die Middleware verlässlich betreiben und warten; das System meldet keinen Fake-Erfolg und exponiert keinen ungesicherten Real-Geld-Pfad. | EXPLICIT | SRC-001 | no |
| Business or Project Goals | VIS-005 | Die astrologie-personalisierte POD-Pipeline produktions- und agenten-betreibbar machen; Vertrauen in die semantische Wahrheit der Oberfläche herstellen. | ASSUMPTION | SRC-003 | yes |
| Success Signals | VIS-006 | (1) Dispatch erfolgt nur mit gültigem signiertem Approval-Token; (2) kein `/api`-Endpunkt liefert fabrizierte Leerdaten als Erfolg; (3) ein Tool-Katalog/Naming über beide MCP-Transporte; (4) granulare WorkflowState-Contracts existieren und werden vom Gate referenziert. | EXPLICIT | SRC-001, SRC-005 | no |

## Confirmation

The assistant must not confirm this artifact. Siehe Confirmation-Block im Chat / docs/traceability.md.
