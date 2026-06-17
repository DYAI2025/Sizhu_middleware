# Sizhu Middleware — Architektur- & MCP-Audit

Datum: 2026-06-17
Skill: `middleware-api-architect` (Audit-Report-Modus)
Evidenzbasis: Live-Repo `Sizhu_middleware` @ `4c1e3c3` — statische Datei-/Routen-/Grep-Analyse. Keine Testausführung, keine Laufzeit-/Netzwerk-Calls behauptet.
Evidence-Labels: `FACT` (direkt aus Quelle gelesen), `INFERENCE`, `ASSUMPTION`, `MISSING`, `SOURCE_NEEDED`.

---

## 0. Drift gegenüber den beiden Anhängen

Die hochgeladene Gap-Analyse basiert auf ZIP-Snapshot `(11)`. Gegen den **aktuellen** Repo-Stand verifiziert:

| Anhang-Befund | Status heute | Beleg |
|---|---|---|
| G-02 Cost-Cap unverdrahtet | **VERÄNDERT — Modul ganz entfernt** | `grep costCap/assertCanIssueImageCall/recordImageCall` → 0 Treffer (non-test). `FACT` |
| G-01 Mock-FuFire/POD/Mail im Run | **WEITER OFFEN** | `workflowRunService.ts:55-57` `FACT` |
| G-03 Placeholder-Bild | **WEITER OFFEN** | `openRouterImageGenerationProvider.ts:89` `FACT` |
| G-04 QA Default-Pass | **WEITER OFFEN** | `openRouterQualityGateProvider.ts:72-73,123` `FACT` |
| G-05 validate-dispatch nur Shape | **WEITER OFFEN** | `server/index.ts:220-226` `FACT` |
| G-07 leere Listen | **WEITER OFFEN** | `server/index.ts:124-130` `FACT` |
| G-10 DEMO_LOCAL Default | **WEITER OFFEN** | `appMode.ts` Default-Return `FACT` |

Die Sicherheitsbasis ist seither real gewachsen (Default-Deny-Gate, SSRF-Proxy entfernt, Idempotency-Key, PII-Sanitizer, no-fake-success-Tests, Mutation-Tests). Die Gap-Analyse bleibt in der Kernaussage gültig, ist aber bei G-02 überholt.

---

## 1. Architektur-Rekonstruktion (Ist)

Pipeline-Ziel: `Etsy → Middleware → FuFire → Template/Prompt → LLM-Bild → QG1 → QG2 → Gelato-Preflight → Order → Confirmation`.

Realer Datenfluss heute:

```
POST /api/workflows/:id/run   (manueller Body, KEIN Etsy-Adapter)
   → runWorkflow()            workflowRunService.ts
       genProvider/qaProvider → OpenRouter NUR wenn Credentials present (sonst Mock)
       personalization/POD/mail → IMMER Mock (unabhängig vom Mode)
   → WorkflowRunner.run()     runner.ts  (Local* Repos, In-Memory/localStorage)
       Loop: generate → QA-score → accept/reject → pod_ready | escalated
   → STOP bei pod_ready (kein Auto-Dispatch)

POST /api/fulfillment/pod/dispatch → PodDispatchService.dispatchArtifact()
       DEMO_LOCAL → {ok:true, status:'mock_success'}
       sonst      → MISSING_POD_CONTRACT (sicher geblockt)
```

`INFERENCE (Konfidenz 4)` — **Stage 1 (Etsy-Intake) ist kein Adapter.** Im `server/`-Baum existiert kein Etsy/Eatsy-Ingestion-/Webhook-Modul; Orders entstehen durch direkten POST mit Rohfeldern. Es gibt keine Order-Idempotenz, kein Order-Input-Schema, keine Provenienz an der Quelle.

`FACT` — **Stage-Realität (Wahrheits-Layer):**

| Stage | Zustand |
|---|---|
| Etsy-Intake | `MISSING` (manueller POST) |
| FuFire-Personalisierung | `MOCK` im Run; echter `FuFireDataService` existiert, aber nur als Test-Run **neben** der Pipeline |
| Template/Prompt | nur `id,name,content,version,status` — kein Produkt-/Layout-/QG-Contract |
| LLM-Bild | `LIVE` möglich, aber `/chat/completions` + Placeholder-Fallback bei fehlender URL |
| QG1 (Design/Semantik) | teil-`LIVE`, aber Default-Pass bei unparsebarer Antwort; **nicht** von QG2 getrennt |
| QG2 (Print/Preflight) | `MISSING` (existiert nicht als eigenes Gate) |
| Gelato-Preflight | `MISSING` |
| Dispatch | `BLOCKED` (MISSING_POD_CONTRACT) bzw. `MOCK` in DEMO_LOCAL |
| Confirmation | `MISSING` |

`FACT` — **State-Machine zu grob:** `stateMachine.ts:7` kennt nur `running | pod_ready | completed | escalated | failed`. Ein Agent kann den Fehlerort (FuFire? Template? QG1? Adresse? Mapping?) nicht unterscheiden. Die im Diagnose-Anhang vorgeschlagenen Granularstates fehlen vollständig.

---

## 2. Befunde nach Severity

### CRITICAL

**C-1 — Dispatch-Route umgeht das QA/Approval-Gate (P9).** `FACT, Konfidenz 5`
`WorkflowStateMachine.assertDispatchAllowed()` (`stateMachine.ts:23-30`) wird **ausschließlich** in `runner.ts:352` und `runner.ts:409` aufgerufen — also nur im In-Process-Runner. Die HTTP-Route `POST /api/fulfillment/pod/dispatch` (`server/index.ts:228-248`) ruft `podDispatchService.dispatchArtifact()` **direkt** auf und prüft das Gate **nicht**. `runner.dispatchManualApproval()` (der laut `CLAUDE.md` eigentliche, gegate-te Trigger) wird von **keiner** Route aufgerufen.
→ Heute nur durch `MISSING_POD_CONTRACT` / DEMO-Mock entschärft. Sobald ein echter Gelato-Adapter diesen Block ersetzt, versendet die REST-Route (und das MCP-Tool `pod_dispatch`) **ohne** durchgesetzte QA-/Approval-Prüfung. Dies ist exakt das `CLAUDE.md`-P9-Muster ("fictional gate on a real-money path").

**C-2 — Agenten-State-Surface lügt.** `FACT, Konfidenz 5`
`/api/workflows/*` → `{workflows:[]}` und `/api/gateway-issues` → `{issues:[]}` sind hartkodiert leer (`server/index.ts:124-130`). `validate-dispatch` gibt `READY_FOR_DISPATCH` nach reinem Shape-Check zurück (`:220-226`). Der HTTP-Proxy-MCP (`mcp-server`) proxyt genau diese Endpunkte → ein Ops-Agent liest „keine Probleme / keine Runs / ready" als belastbaren Zustand. Für „Notfall-Einsatz durch Agenten" ist ein lügender Read-Layer gefährlicher als gar keiner.

### HIGH

**H-1 — Kein-Fake-Erfolg verletzt im Bild-Provider.** `FACT, Konfidenz 5` — `openRouterImageGenerationProvider.ts:89`: fehlt die URL, wird `data:image/...;base64,placeholder` als Kandidat zurückgegeben statt `IMAGE_OUTPUT_MISSING` zu werfen. Zudem `/chat/completions` (`:49`) ist kein Bild-Endpoint.

**H-2 — QA-Gate kann falsch-grün werden.** `FACT, Konfidenz 5` — `openRouterQualityGateProvider.ts`: `extractScore(text, minScore)` gibt bei unparsebarer Antwort `minScore` zurück (`:123`), `passed = score >= minScore` (`:73`) ⇒ unparsebar = bestanden.

**H-3 — Zwei divergierende MCP-Implementierungen (Drift).** `FACT, Konfidenz 5`
- `server/mcp/*`: stdio-Server (`StdioServerTransport`), Tools **`sizhu.health_check`, `sizhu.fufire_test_run`, `sizhu.readiness_check`** (3), mit AuthPolicy, Sanitizer, Schema-Registry, Tests, „dangerous tools off by default". **Wird von `server/index.ts` NICHT importiert** (separater Prozess; `P1`: kein Web-Server-Importer).
- `mcp-server/*`: HTTP-Proxy-Client (`SizhuClient`), **11** `sizhu_*`-Tools inkl. `validate_dispatch` + `pod_dispatch`, leitet das Caller-Token (admin+aal2) downstream weiter (kein statisches Admin-Secret — gut).
- Unterschiedliche Nam_ens_konvention (`sizhu.x` vs `sizhu_x`), Transport und Toolset. Partielle Überlappung (health/readiness/fufire_test). **Eine** Schicht muss canonical werden.

**H-4 — Keine Kostenbremse mehr.** `FACT, Konfidenz 5` — Cost-Cap-Modul ist entfernt; reale OpenRouter-Calls haben aktuell keine Obergrenze.

### MEDIUM

**M-1 — DEMO_LOCAL-Default + Mock-Dispatch.** `FACT, Konfidenz 5` — `appMode.ts` defaultet ohne Env auf `DEMO_LOCAL`; `podDispatchService.ts:33-41` liefert dann `mock_success`. Unkonfigurierte Prod-Umgebung ⇒ „erfolgreicher" Fake-Dispatch.

**M-2 — Persistenz ist Stub.** `FACT, Konfidenz 4` — `supabaseRepository.stub.ts` wirft durchgängig; echte Runs werden nicht persistiert. Damit sind alle Agenten-Read-Tools (`get_run`, `list_events`) **datenseitig blockiert**, bis Persistenz existiert (`G-11`).

**M-3 — End-to-End nie getestet.** `FACT, Konfidenz 4` — viele Unit-/Mutation-Tests, aber **kein** Integrationstest, der die Kette Intake→…→Confirmation durchläuft. Deckt sich mit Nutzeraussage „nie getestet".

---

## 3. Positiv (nicht abreißen)

`FACT` — Default-Deny `apiGuard`; entfernter SSRF-FuFire-Proxy; Secret-Ref-Indirektion + readiness-Gate; deterministischer, PII-freier Idempotency-Key; PII-Sanitizer in POD-Failures; token-forwarding MCP-Proxy ohne statische Admin-Creds; no-fake-success- und Mutation-Tests. Die Basis ist solide — die Lücke ist **semantische Wahrheit der Oberfläche**, nicht fehlende Sicherheitsarbeit.

---

## 4. Priorisierte Entscheidung (Friction-Punkt)

Der Wunsch „MCP für Agenten **jetzt** vervollständigen (Config/Wartung/Notfall)" kollidiert mit C-1/C-2: Bevor Agenten `pod_dispatch`/`validate_dispatch` bekommen und Read-Tools nutzen, müssen (a) der Read-Layer ehrlich und (b) der Dispatch-Pfad gegate-t sein. Sonst rüstet man Agenten mit lügenden Sensoren und einem ungesicherten Auslöser aus.

**Empfohlene Reihenfolge** (weicht bewusst von „Gelato schnell anschließen" ab):

1. **Slice A — Agent-Safe Truth & Dispatch-Gate** (GoalForge unten) — klein, testbar, beseitigt C-1/C-2/M-1.
2. Slice B — `server/mcp` vs `mcp-server` konsolidieren → **`mcp-server` (HTTP-Proxy) als canonical** für Remote-Ops auf der Railway-Instanz; `server/mcp`-Disziplin (Policy/Sanitize/Schema) hineinziehen; `pod_dispatch` per Flag default-aus.
3. Slice C — Contract-Backbone (Order/ProductTemplate/WorkflowState/Events) + reale Persistenz (entsperrt Read-/Diagnose-Tools).
4. Slice D — FuFire RAW in echten Run; QG1/QG2-Trennung.
5. Slice E — Gelato-Preflight + Dispatch + Confirmation.
6. Slice F — restliche Agent-Ops-Tools (`get_run`, `list_events`, `diagnose`, `run_qg1`, `run_qg2_preflight`, `apply_safe_config_patch`).

`INFERENCE` — **Canonical = HTTP-Proxy:** Remote-Agenten (Claude/Codex/Hermes/openclaw) sollen die **deployte** Instanz für Notfälle bedienen; ein stdio-In-Process-Server erreicht deren Live-State nicht. Daher ist `mcp-server` die richtige Transport-Wahl — `server/mcp` wird Registry-/Policy-Quelle oder entfällt.

---

## 5. GoalForge-Objective — Slice A

**Ziel:** Die agentenseitige Lese-/Validierungs-Oberfläche wahrheitsgemäß machen und den POD-Dispatch-Pfad an das State-Machine-Gate binden — ohne FuFire-Real, Templates oder Gelato anzufassen.

**Scope:**
- `server/index.ts`: `/api/workflows/*` und `/api/gateway-issues` → ehrliche Antwort (`NOT_IMPLEMENTED` / `SOURCE_NOT_CONFIGURED`) statt leerer Liste.
- `validate-dispatch` → gegen persistierten/übergebenen Zustand prüfen (run existiert, artifact gehört zu run, `artifact.status==='accepted'`, `run.acceptedArtifactId===artifact.id`) oder explizit als `VALIDATION_SHAPE_ONLY` kennzeichnen.
- `POST /api/fulfillment/pod/dispatch` → vor `dispatchArtifact()` `WorkflowStateMachine.assertDispatchAllowed(run, artifact)` aufrufen; bei Verstoß `403 DISPATCH_NOT_ALLOWED`.
- `mcp-server`: `pod_dispatch` hinter `MCP_ENABLE_DISPATCH` (default aus); `validate_dispatch` gibt den ehrlichen Status durch.

**Non-Goals:** Etsy-Adapter, FuFire-Personalisierungsprovider, ProductTemplateSchema, QG2/Gelato, Supabase-Persistenz.

**Harte Bedingungen:** Kein Fake-Erfolg; keine neuen Secrets im Body; bestehende Security-/no-fake-success-Tests bleiben grün.

**Akzeptanzkriterien (Pass/Fail):**
- AC-A1: `assertDispatchAllowed` hat ≥1 **Server-Routen**-Aufrufer (`grep` in `server/`, non-test) — sonst Fail. *(P1/P9-Beweis)*
- AC-A2: Test: nicht-`accepted` Artifact an `/dispatch` ⇒ `403 DISPATCH_NOT_ALLOWED`; Revert des Guards ⇒ Test wird RED *(P4)*.
- AC-A3: `/api/workflows/*` und `/api/gateway-issues` liefern keinen leeren `[]`-Erfolg mehr (Test prüft Statuscode/Body).
- AC-A4: `validate-dispatch` liefert für ein nicht-akzeptiertes Artifact **nicht** `READY_FOR_DISPATCH`.
- AC-A5: Ohne `MCP_ENABLE_DISPATCH=true` ist `pod_dispatch` im MCP nicht registriert (Tool-Registry-Test).

**Definition of Done:** AC-A1…A5 grün; `npm run lint` + `npm run test` grün; Commit-Body nennt den RED-on-revert-Beweis für AC-A2.

**Referenz-Evidenz:** `server/index.ts:124-130,220-248`; `stateMachine.ts:23-30`; `runner.ts:352,409`; `podDispatchService.ts:33-41,88`; `mcp-server/src/server.ts`.

---

## 6. Coding-Agent-Handoff — Slice A

```
GOAL: Agent-Safe Truth & Dispatch-Gate (Slice A). Audit C-1/C-2/M-1.
TARGET FILES:
  - server/index.ts            (3 endpoints: workflows*, gateway-issues, validate-dispatch, dispatch)
  - server/services/podDispatchService.ts  (nur falls Gate dort statt in der Route sitzen soll)
  - mcp-server/src/server.ts    (pod_dispatch hinter MCP_ENABLE_DISPATCH)
  - server/tests/pod.dispatch.branches.test.ts | security.matrix.routes.test.ts (erweitern)
TASKS:
  1. Dispatch-Route: run+artifact laden, assertDispatchAllowed() aufrufen, 403 DISPATCH_NOT_ALLOWED bei Verstoß.
  2. validate-dispatch: echte State-Prüfung ODER rename zu VALIDATION_SHAPE_ONLY.
  3. workflows*/gateway-issues: NOT_IMPLEMENTED statt leerer Liste.
  4. mcp-server: pod_dispatch nur bei MCP_ENABLE_DISPATCH=true registrieren.
TESTS: AC-A1..A5 (siehe Objective). RED-on-revert für AC-A2 im Commit-Body.
NON-GOALS: FuFire-real, Templates, QG2, Gelato, Supabase.
ROLLBACK: rein additive Guards; bei Bedarf Route auf vorherigen Handler zurücksetzen.
SAFETY: kein Fake-Erfolg; pod_dispatch bleibt default-aus.
```

---

## 7. Confidence

Gesamt: **4/5.** Statisch belegt, file:line-zitiert. Offen (`MISSING`, daher nicht behauptet): Laufzeitverhalten, ob `server/mcp` einen separaten stdio-Entrypoint mit Prod-Nutzung hat, echter Gelato-Vertrag, tatsächliche Etsy-Intake-Absicht. Diese erfordern Laufzeit-/Doku-Evidenz vor weiteren Behauptungen.
