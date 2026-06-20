# Product Canvas: Server-side Template/Config Store + Agent CRUD

Status: user-confirmed
Feature Slug: server-template-config-store
Confirmed by user: yes
Confirmation date: 2026-06-20
Confirmer: ben.poersch@gmail.com
Confirmation note: Confirmed at Phase 0.15, returned to draft for the Phase 0.16 council amendment (FULL bundle: slice scope, soft-delete+versioning, audit-log, save-validation, token-scope `templates:write`, P9 money-gate check, verify Supabase premise first), then RE-CONFIRMED 2026-06-20 by ben.poersch@gmail.com. Full agent access preserved — robust, not naive.

| Section | ID | Value | Source Type | Source |
|---|---|---|---|---|
| Problem | CAN-001 | KEIN server-seitiger Template-Store: Templates leben im Browser-`localStorage` (DEMO_LOCAL) oder `SupabaseTemplateRepository` ist ein **werfender Stub** (`supabaseRepository.stub.ts:60`); bazi_solo hardcoded. → Agenten haben keinen echten, geteilten Config-Zugriff. | EXPLICIT (belegt) | SRC-001, SRC-002 |
| Users / Customers | CAN-002 | Admin-Operatoren + autonome Agenten (Claude Code, Hermes-auf-VPS, Codex) mit eigenem token. | EXPLICIT | SRC-001 |
| Value Promise | CAN-003 | Echter, entlastender **Voll-Zugriff** für Agenten auf Templates — server-seitig persistent + geteilt. Kein Eiergetanze; der Voll-Zugriff bleibt, aber **robust statt naiv** (Worst-Case reversibel + auditierbar). Einziger gated Pfad bleibt der echte Geld-Charge. | EXPLICIT | SRC-001, Council 2026-06-20 |
| Current Alternatives | CAN-004 | localStorage (client, flüchtig) / werfender Supabase-Stub / hardcoded bazi_solo. Kein `/api`-CRUD, keine MCP-Tools. | EXPLICIT (belegt) | SRC-002 |
| Key Capabilities | CAN-005 | **SLICE-1 (diese Iteration):** echte `SupabaseTemplateRepository` für `list` + `save`(upsert) + `set-active`/`deactivate` gegen das existierende Schema; `/api/v1/templates` (list/get/save/set-active); MCP-Tools `sizhu_list_templates`/`get`/`save`/`set_active`; **Save-Validierung** (Schema/Allowlist vor live); **append-only Audit-Log** (actor/token-id/diff/ts) auf jedem Write; **„delete" = Soft-delete/Versionierung** (supersede, nie physisch); **Token-Scope** `templates:write`. **SLICE-2 (deferred):** physical/hard-delete (mit Guard), **bazi_solo-Migration** in den Store, get-by-id-Feinschliff. | EXPLICIT (post-council) | SRC-001, Council 2026-06-20 |
| Non-Goals | CAN-006 | KEIN hard-delete in Slice-1 (nur Soft-delete/Versionierung). KEINE bazi_solo-Migration in Slice-1 (hardcoded bleibt, kein Blocker). KEINE Provider/App-Config. KEINE Änderung am Geld-/Dispatch-Pfad. KEIN UI-Redesign. KEINE volle Supabase-Repo-Impl aller Domains (nur TemplateRepository). | EXPLICIT (post-council) | SRC-001, Council 2026-06-20 |
| Constraints | CAN-007 | Mode-switched Repo-Seam. Contract ggf. erweitern (granular save/active/version — Phase-1). **Auth (USER+Council):** admin-Rolle OHNE MFA, ABER **Token-Scope `templates:write`** (kein User/Secret/Dispatch-Scope, kurze TTL) — ersetzt MFA-Wegfall teilweise. RBAC `manage_templates` existiert. Jeder Write läuft durch Save-Validierung + Audit-Log; Löschen = Soft/Version. TDD + RED-on-revert. | EXPLICIT (post-council) | SRC-001, SRC-002, Council 2026-06-20 |
| Risks | CAN-008 | **R1 (gemindert):** geleakter Agent-Token → Token-Scope begrenzt Blast-Radius, Soft-delete macht Löschung reversibel, Audit-Log macht Missbrauch sichtbar, Save-Validierung stoppt offensichtlich vergiftete Templates. **R2 / CONTRA-SB-1 (ungeprüft):** Live-Supabase-Schema appliziert + service-role gewired? → ZUERST verifizieren (vor Build). **R3 / CONTRA-MONEY (P9):** beeinflusst irgendein Template-Feld Provider/Modell/Kosten/Dispatch? Wenn ja → `set-active` muss durch die Geld-Gate, sonst ist „Geld-Pfad gated" Fiktion → **Falsifizier-Check in Phase 1**. | EXPLICIT (post-council) | SRC-001, Council 2026-06-20 |
| Success Signal | CAN-009 | **Slice-1:** Agent ruft via MCP `save` (neues Template) → `set_active` → server-seitig persistiert; **read-after-write über eine ZWEITE Session/Token** beweist geteilte Persistenz (keine Browser-Insel); **Audit-Log-Eintrag** vorhanden; **Save-Validierung lehnt ein malformed Template ab** (BLOCKED, kein Fake-Save). | EXPLICIT (post-council) | SRC-001, Council 2026-06-20 |
| Evidence | CAN-010 | Unit (Repo gegen Test-Double + Local-Impl), Integration (Route+Repo+apiGuard token-scope, supertest), MCP tools/list zeigt die neuen Tools, **real-boundary: Live-Supabase-Persist-Smoke** (gated auf CONTRA-SB-1). RED-on-revert auf: token-scope-Gate (falscher Scope → 403), Save-Validierung (malformed → reject), Audit-Log-Write, Soft-delete (Version bleibt lesbar). | EXPLICIT | SRC-001, Council |
| Allowed Scope | CAN-011 | `src/lib/repositories/**` (echte Impl), `src/lib/app/appServices.ts`, `src/lib/domain/**`, `src/types.ts`, `server/services/templateStoreService.ts` (neu, inkl. Validierung+Audit+Versionierung), `server/services/templateRegistryService.ts` (Slice-2 bazi_solo), `server/routes/**`, `server/index.ts`, `server/middleware/auth.ts` (Klassifizierung + token-scope), `server/lib/jwt.ts` (Scope-Claim lesen, falls nötig), `mcp-server/src/**`, `supabase-schema.sql` (audit/version-Delta falls nötig), Tests `server/tests/**`+`src/tests/**`+`mcp-server/tests/**`, `scripts/smoke/**`, `docs/**`, `metrics/**`. | EXPLICIT (post-council) | SRC-001 |
| Unresolved Questions | CAN-012 | **OQ-A/B/C/D + Council-Bundle RESOLVED.** **CONTRA-SB-1 (ungeprüft, vor Build):** Live-Supabase prompt_templates appliziert + service-role gewired? **CONTRA-MONEY (P9, Phase-1-Check):** Template-Feld → Provider/Modell/Kosten/Dispatch? Wenn ja → set-active gated. **OQ-E (Phase-1):** Versionierungs-/Audit-Schema-Delta + Contract-Erweiterung. | EXPLICIT (post-council) | SRC-001, Council 2026-06-20 |

## Allowed change scope

- `docs/canvas/server-template-config-store.canvas.md`
- `docs/prd/server-template-config-store.prd.md`
- `docs/vision/server-template-config-store.vision.md`
- `docs/traceability.md`
- `docs/plans/**`
- `docs/context/**`
- `docs/reality/**`
- `docs/verification/**`
- `docs/decisions/**`
- `src/lib/repositories/**`
- `src/lib/app/appServices.ts`
- `src/lib/domain/**`
- `src/types.ts`
- `server/services/templateStoreService.ts`
- `server/services/templateRegistryService.ts`
- `server/routes/**`
- `server/index.ts`
- `server/middleware/auth.ts`
- `server/lib/jwt.ts`
- `mcp-server/src/**`
- `supabase-schema.sql`
- `server/tests/**`
- `src/tests/**`
- `mcp-server/tests/**`
- `scripts/smoke/**`
- `package.json`
- `metrics/**`

## Sources
- SRC-001 — User `/agileteam` brief + "full agent access, no security tip-toeing" directive, 2026-06-20.
- SRC-002 — Repo inspection: `supabaseRepository.stub.ts:60` (throwing stub), `supabase-schema.sql:93/94/98` (prompt_templates + is_active + active_template_id + manage_templates RBAC), `interfaces.ts:29` (TemplateRepository), hardcoded bazi_solo in templateRegistryService.
- Council 2026-06-20 — provokateur (P9 money-gate check; proxy-need), minimalist (slice to list+save; defer delete+bazi_solo), risiko-waechterin (soft-delete+versioning, audit-log, save-validation, token-scope). User adopted full bundle.

## User Confirmation
The assistant must not confirm this canvas. Re-confirm after the council amendment with:

`I confirm this Product Vision as the basis for AgileTeam planning.`
