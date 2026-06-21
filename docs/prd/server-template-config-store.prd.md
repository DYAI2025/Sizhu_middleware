# PRD: Server-side Template/Config Store + Agent CRUD (Slice-1)

Status: user-confirmed
Confirmed by user: yes
Confirmation date: 2026-06-20
Confirmer: ben.poersch@gmail.com
Feature Slug: server-template-config-store
Canvas: [docs/canvas/server-template-config-store.canvas.md](../canvas/server-template-config-store.canvas.md) (user-confirmed 2026-06-20, post-council)
Author: requirements-analyst (orchestrated)
Date: 2026-06-20

## 1. Summary

Give autonomous agents (Claude Code, Hermes, Codex) and operators **real, shared, server-side**
CRUD over prompt templates — replacing the browser-localStorage island and the throwing Supabase
stub. Slice-1 = `list` + `save`(upsert) + `set-active`/`deactivate`, with the council hardening that
keeps full access but makes the worst case reversible + observable. Hard-delete + bazi_solo migration
are Slice-2.

## 2. Data model (existing schema, SRC-002)

`supabase-schema.sql`: `prompt_templates` table + `is_active BOOLEAN` + `active_template_id`; RBAC
permission `manage_templates` (Owner/Admin). Contract `TemplateRepository { getTemplates(): PromptTemplate[]; saveTemplates(t[]): void }` (`interfaces.ts:29`) — **extended in Slice-1** for granular save/set-active + versioning/audit. New (Slice-1): a `template_revisions` (append-only versions) + `template_audit_log` (append-only: actor, token_sub, action, template_id, diff, ts) — schema delta in `supabase-schema.sql` (OQ-E for exact columns).

## 3. Requirements (Slice-1)

| REQ | Statement |
|---|---|
| REQ-001 | Real `SupabaseTemplateRepository` for `getTemplates`/`saveTemplate`(upsert)/`setActive` against the live `prompt_templates` schema, wired through the `appServices` mode-switched seam (replaces the throwing stub for these methods; other methods still throw). |
| REQ-002 | `POST/GET /api/v1/templates`: `GET /` (list), `GET /:id`, `POST /` (save/upsert), `POST /:id/active` (set-active / deactivate). Mounted under `apiGuard`. |
| REQ-003 | **Save-validation**: a template is validated against a schema/allowlist BEFORE persist; a malformed/poisoned template → 422 BLOCKED, NOT persisted (no fake-save). |
| REQ-004 | **Append-only audit-log**: every write (save, set-active, soft-delete) records `{ actor_email, token_sub, action, template_id, diff/snapshot, ts }` to `template_audit_log`. Never updated/deleted. |
| REQ-005 | **Soft-delete / versioning**: "delete" = mark superseded/inactive; the prior revision stays readable in `template_revisions`. NO physical delete in Slice-1. |
| REQ-006 | **Auth posture (USER+council):** template writes require admin role, **NO MFA/aal2**, AND a `templates:write` capability (token-scope). Non-authorized → 403. **OQ-DESIGN-1 (Phase-1 planner):** how the `templates:write` scope is represented for Supabase access tokens (custom JWT claim via app_metadata, OR a separate agent-token mechanism, OR — fallback — admin-role-only when a true scope is infeasible, with audit+soft-delete+validation still providing blast-radius reduction). The fallback is explicit, not silent. |
| REQ-007 | MCP tools in `mcp-server`: `sizhu_list_templates`, `sizhu_get_template`, `sizhu_save_template`, `sizhu_set_template_active` — thin proxies over REQ-002, forwarding the caller token. |
| REQ-008 | **CONTRA-MONEY (P9) check:** verify whether any `PromptTemplate` field can shift provider/model/cost/dispatch. If YES → `set-active` (REQ-002) MUST route through the existing dispatch/approval gate (else "money path gated" is fictional). If NO → record the verification (cited fields) and proceed. This is a Phase-1 verification + conditional guard, not prose. |

## 4. Acceptance criteria (Given/When/Then)

- **AC-001 (REQ-001/002)** — Given a `templates:write`-authorized admin token, When `POST /api/v1/templates` with a valid template, Then 200 + the template is persisted to live Supabase and returned by a subsequent `GET /` **on a different session** (shared persistence, not a browser island).
- **AC-002 (REQ-003, BLOCKED)** — Given a malformed/poisoned template (fails schema/allowlist), When save, Then 422 BLOCKED and `GET /` does NOT contain it (no fake-save). RED-on-revert: disabling validation must let it through and break this test.
- **AC-003 (REQ-004)** — Given any write, When it completes, Then a `template_audit_log` row exists with actor + token_sub + action + diff. RED-on-revert: removing the audit write breaks it.
- **AC-004 (REQ-005)** — Given a template is "deleted"/superseded, When fetched by revision, Then the prior revision is still readable and no physical row was removed.
- **AC-005 (REQ-006)** — Given a token WITHOUT `templates:write` (or non-admin), When a write, Then 403. Given an admin `templates:write` token (no MFA), Then allowed. RED-on-revert: dropping the scope check lets a non-scoped token write.
- **AC-006 (REQ-007)** — Given the MCP server, When `tools/list`, Then the 4 new template tools are present; a `sizhu_save_template` call forwards the token and round-trips to REQ-002.
- **AC-007 (REQ-008)** — The P9 verification is recorded (cited `PromptTemplate` fields vs provider/model/cost/dispatch); if any field is money-influencing, an AC asserts `set-active` of such a template requires the dispatch gate.

## 5. NFRs

- **NFR-SEC-1** — token-scope `templates:write` + admin role (no MFA, user-decided); the scope is the primary blast-radius limiter for a leaked autonomous-agent token.
- **NFR-AUDIT-1** — audit-log append-only (no update/delete path).
- **NFR-IDEM-1** — `save` is upsert (idempotent by template id).
- **NFR-PREMISE-1 (CONTRA-SB-1)** — live `prompt_templates`/`template_revisions`/`template_audit_log` applied + `SUPABASE_SERVICE_ROLE` wired must be VERIFIED before any real-boundary evidence is claimed; the user owns this verification (assistant cannot reach the Sizhu Supabase from here).

## 6. Security matrix

| Surface | Threat | Control |
|---|---|---|
| template writes | leaked autonomous-agent token | token-scope `templates:write` (no User/Secret/Dispatch scope) + short TTL (REQ-006) |
| template content | poisoned prompt → harmful product | save-validation (REQ-003) |
| destructive ops | malicious mass-delete | soft-delete/versioning — reversible (REQ-005) |
| undetected abuse | silent tampering | append-only audit-log (REQ-004) |
| money path | template field shifts cost/dispatch | P9 check → set-active gated if money-influencing (REQ-008) |

## 7. Atomic task sequence (→ Phase 1 planner)

0. T0 — **CONTRA-SB-1 verification** (user-assisted): confirm live schema + service-role; if absent, apply schema (`supabase-schema.sql` + audit/version delta). Blocks real-boundary, not unit/integration.
1. T1 — schema delta: `template_revisions` + `template_audit_log` (apply_migration). [REQ-004/005]
2. T2 — extend `TemplateRepository` contract + real `SupabaseTemplateRepository` (list/save/setActive) + Local impl parity. [REQ-001]
3. T3 — `templateStoreService`: save-validation + audit-write + versioning (soft-delete). [REQ-003/004/005]
4. T4 — auth: `templates:write` scope check + admin-no-MFA classification (resolve OQ-DESIGN-1). [REQ-006]
5. T5 — `/api/v1/templates` routes wired in createApp. [REQ-002]
6. T6 — MCP tools (4). [REQ-007]
7. T7 — P9 money-field verification + conditional set-active gate. [REQ-008]
8. T8 — flag-gated live Supabase persist smoke (after T0). [evidence]

## 8. Open items (USER GATE / Phase-1)
- **OQ-DESIGN-1** (REQ-006): token-scope representation for Supabase tokens (custom claim vs agent-token vs admin-role fallback) — planner decides; fallback explicit.
- **CONTRA-SB-1**: live Supabase schema/service-role — user verifies.
- **CONTRA-MONEY** (REQ-008): money-influencing template field check — Phase-1.
