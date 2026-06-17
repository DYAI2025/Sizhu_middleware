# Product Vision: Sizhu Agent-Safe Ops

Status: user-confirmed
Feature Slug: sizhu-agent-safe-ops
Confirmation Status: confirmed
Confirmed by user: yes
Confirmation date: 2026-06-17 (Phase 0.5 USER GATE; reduced scope A+B, Epic C deferred; CONCERN-1 prod-dispatch-fail-closed accepted)

> **Amendment 2026-06-17 (Phase 0.16 Council + user).** Scope reduced this iteration: gate = Defense-in-Depth (not bespoke signed token); Epic C (contract backbone / granular WorkflowState) **DEFERRED to backlog**; Epic B = delete stdio (single HTTP surface). **Original Goal (A+B+C) is therefore NOT fully delivered this run** — VIS-006 #4 (granular contracts referenced by gate) is out of this iteration. See PRD §Scope status. This Vision must be re-confirmed as amended.

## Source Map

| Source ID | Source |
|---|---|
| SRC-001 | docs/audit/2026-06-17-architecture-mcp-audit.md (Befunde C-1, C-2, H-3) |
| SRC-002 | docs/decisions/0001-canonical-mcp-surface.md (ADR Slice B) |
| SRC-003 | „Die wichtigste Architekturdiagnose" (Diagnose-Roadmap, Sprint 1) |
| SRC-004 | sizhu_gap_analysis_report.md (G-01..G-12) |
| SRC-005 | User-Intake-Entscheidungen 2026-06-17 (4 Forks: Umbrella / Deeper-B / Contracts+SM / Signed-Token) |
| SRC-006 | CLAUDE.md Verifikationskonventionen P1–P9 |
| SRC-007 | Post-LGQ-Merge HEAD (Commits `7fcb782`…`4833280`): Cost-Cap + PII-Redaction + No-Fake-Success; Provider verschoben nach `src/lib/providers/openrouter/` |

## Product Vision Board

| Area | ID | Value | Source Type | Source | User Decision Needed |
|---|---|---|---|---|---|
| Target Group | VIS-001 | Sizhu-Operatoren und Remote-AI-Agenten (Claude Code, Codex, Hermes, openclaw), die die deployte Instanz `sizhu.fufire.space` für Konfiguration, Wartung und Notfälle bedienen. | EXPLICIT | SRC-005 | no |
| User Needs | VIS-002 | Runs wahrheitsgemäß beobachten, QA/Gateway-Zustand diagnostizieren, Konfiguration prüfen und einen POD-Dispatch **ausschließlich nach serverseitig durchgesetztem Approval** auslösen — ohne lügende Sensoren oder un-gegate-te Geld-Pfade. | EXPLICIT | SRC-001 | no |
| Product / Feature | VIS-003 | Eine agenten-sichere Ops-Schicht: **diesen Run** = gehärtete `/api`-Gates (Slice A, Defense-in-Depth) + EINE MCP-Surface durch Löschen der stdio-Surface (Slice B). **Slice C (Vertrags-Backbone + granulare State-Machine) ist DEFERRED** (Backlog; erst mit realem Prod-Consumer). | EXPLICIT (post-council) | SRC-005, Council 2026-06-17 | confirm scope-reduction |
| Product Value | VIS-004 | Agenten können die Middleware verlässlich betreiben und warten; das System meldet keinen Fake-Erfolg und exponiert keinen ungesicherten Real-Geld-Pfad. | EXPLICIT | SRC-001 | no |
| Business or Project Goals | VIS-005 | Die astrologie-personalisierte POD-Pipeline produktions- und agenten-betreibbar machen; Vertrauen in die semantische Wahrheit der Oberfläche herstellen. | ASSUMPTION | SRC-003 | yes |
| Success Signals | VIS-006 | (1) Dispatch erfolgt nur mit gültigem **verbrauchbarem Single-Use-Approval-Record** (das **alleinige** last-tragende Money-Gate; aal2/sensitive = Caller-Auth, bereits vorhanden, kein Dispatch-Gate; `assertDispatchAllowed` nur sekundärer Shape-Check); dispatched artifactId == approbierte; Replay/abwesender Store ⇒ fail-closed (**in Prod heißt das: Dispatch diesen Run NICHT funktional** — value-truth, spec-audit CONCERN-1); (2) kein `/api`-Endpunkt liefert fabrizierte Leerdaten als Erfolg (`NOT_IMPLEMENTED`); (3) **eine** MCP-Surface (HTTP), stdio gelöscht, dangerous tools off-by-default mit RED-on-revert-Guard; ~~(4) granulare WorkflowState-Contracts vom Gate referenziert~~ **(4) DEFERRED — nicht dieser Run** (Epic C Backlog). | EXPLICIT (post-council, spec-audited) | SRC-001, SRC-005, Council 2026-06-17 | confirm scope-reduction + CONCERN-1 |

## Confirmation

The assistant must not confirm this artifact. Siehe Confirmation-Block im Chat / docs/traceability.md.
