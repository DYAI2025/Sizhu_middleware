# ADR 0001 — Canonical MCP-Surface für Agenten

Status: **Superseded in part** — 2026-06-17 (by feature `sizhu-agent-safe-ops`; see banner)
Kontext-Slice: MCP-Konsolidierung (Slice B aus `docs/audit/2026-06-17-architecture-mcp-audit.md`)

> **SUPERSEDED IN PART (2026-06-17, feature `sizhu-agent-safe-ops`).** Reversed/resolved since this ADR
> was accepted (the historical record below is kept intact for context):
> - **Decision #2 + "Bewusst NICHT: Löschen der stdio-Surface" → REVERSED.** The stdio surface
>   (`server/mcp/`, `npm run mcp:stdio`/`test:mcp`) was **deleted** (REQ-006/007 — verified zero
>   production importers). The HTTP `mcp-server/` is now the **single** canonical surface. `agentPolicy`
>   was stdio-only; the HTTP path's auth is `/api`'s apiGuard (token-forwarding), so the deletion widens
>   no auth gap. (The "Portierung von agentPolicy" rejection is therefore moot.)
> - **Decision #4's open dependency (C-1) → RESOLVED.** `POST /api/fulfillment/pod/dispatch` now enforces
>   a server-side **single-use approval-record gate** (`consumeApproval`); `sizhu_pod_dispatch` stays
>   default-off. **Caveat (CONCERN-1):** prod dispatch is fail-closed/non-functional this iteration (the
>   prod approval store is a throwing Supabase stub) — a working prod dispatch awaits the Supabase slice.
> - The "Verifikation" `npm run test:mcp` line is obsolete (those tests were deleted with the surface).

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
