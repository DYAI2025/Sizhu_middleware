# ADR 0001 — Canonical MCP-Surface für Agenten

Status: **Accepted** — 2026-06-17
Kontext-Slice: MCP-Konsolidierung (Slice B aus `docs/audit/2026-06-17-architecture-mcp-audit.md`)

## Kontext

Das Repo enthält **zwei** MCP-Implementierungen mit überschneidendem, aber divergierendem Toolset:

| | `server/mcp/` | `mcp-server/` |
|---|---|---|
| Transport | stdio (`StdioServerTransport`) | streamable HTTP (`/mcp`) |
| Einstieg | `npm run mcp:stdio` | eigenes npm-Paket, `npm start` (:3333) |
| Aufruf | direkte In-Process-Funktionen | HTTP-Proxy an deployte `/api` |
| Auth | env-basierter Policy-Layer (`agentPolicy`) | leitet Caller-Token (admin+aal2) weiter; `/api` ist Autorität |
| Tools | 3 (health, readiness, fufire test) | 11 (inkl. config, secret-refs, gateway-issues, workflows, fulfillment, validate/dispatch) |
| Naming (vorher) | `sizhu.health_check` … (dotted) | `sizhu_get_health` … (underscore) |

Das ist **keine reine Duplikation** — es sind zwei Transporte für zwei Kontexte. Der reale Drift war: zwei Namenskonventionen für dieselbe Fähigkeit und keine deklarierte Autorität.

## Entscheidung

1. **Canonical = `mcp-server/` (HTTP-Proxy).** Er ist die maßgebliche Agenten-Surface für Remote-Agenten (Claude, Codex, Hermes, openclaw …), die die **deployte** Railway-Instanz für Konfiguration, Wartung und Notfälle bedienen. Begründung: ein stdio-In-Process-Server erreicht den Live-State der deployten Instanz nicht; er ist außerdem bereits sicherheitsreviewt (Token-Forwarding ohne statisches Secret, `pod_dispatch` default-aus, ehrliche Tool-Beschreibungen).
2. **`server/mcp/` (stdio) bleibt** als **lokale, co-located** Dev/Ops-Surface — explizit **non-canonical** und ein **strikter Subset** (nur lokal-sichere Read/Test-Tools; kein Workflow-Listing, kein Fulfillment, kein Dispatch).
3. **Einheitliches Naming `sizhu_*` über beide Surfaces.** Die 3 stdio-Tools wurden umbenannt zur Parität mit dem Proxy: `sizhu_get_health`, `sizhu_get_readiness`, `sizhu_run_fufire_test`. Ein Agent sieht für dieselbe Fähigkeit denselben Namen, unabhängig vom Transport.
4. **`sizhu_pod_dispatch` bleibt default-aus** (`MCP_ENABLE_DISPATCH=true`), bis die serverseitige Approval-Gate auf der REST-Dispatch-Route existiert (siehe Abhängigkeit unten).

## Bewusst NICHT in dieser Entscheidung

- **Geteiltes Tool-Katalog-Modul** (eine Quelle der Wahrheit, von beiden Transporten konsumiert): zurückgestellt — Cross-Package-Build-Aufwand (`mcp-server/` ist ein eigenes npm-Paket). Kann später als ADR-Folge erfolgen.
- **Löschen der stdio-Surface**: verworfen — sie ist ein nützlicher lokaler Entrypoint.
- **Portierung von `agentPolicy` in den Proxy**: verworfen — wäre ein Anti-Pattern; im Proxy ist `/api` die Autorität, ein zweiter lokaler Policy-Layer würde Entscheidungen duplizieren/verfälschen.

## Konsequenzen

- Positiv: einheitliches Naming, klar deklarierte Autorität, kein Maintainer-Drift mehr.
- Bekannter Bruch: lokale Agent-Configs, die alte gepunktete Namen referenzieren, müssen aktualisiert werden (`sizhu.health_check` → `sizhu_get_health` usw.).
- **Offene Abhängigkeit (Slice A / Audit C-1):** Der volle Agenten-Funktionsumfang („real für Notfall-Ops") bleibt begrenzt, bis (a) die `/api`-Read-Endpunkte echte Daten statt leerer Listen liefern und (b) `POST /api/fulfillment/pod/dispatch` serverseitig `assertDispatchAllowed` durchsetzt. Diese Konsolidierung beseitigt den Drift, **nicht** diese Gaps.

## Verifikation

- `npm run test:mcp` → 25 Tests grün nach Rename (2026-06-17).
- Kein gepunkteter `sizhu.<tool>`-Name mehr in `server/mcp/` oder `docs/mcp/` (grep, non-historisch).
- `pod_dispatch` nur bei `MCP_ENABLE_DISPATCH=true` registriert (Quelle: `mcp-server/src/server.ts`).

## Referenzen

- `docs/audit/2026-06-17-architecture-mcp-audit.md` (Befunde C-1, C-2, H-3)
- `mcp-server/README.md`, `docs/mcp/TOOL_CATALOG.md`, `docs/mcp/AGENT_USAGE.md`
