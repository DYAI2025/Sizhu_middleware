# Plan: Server-side Template/Config Store + Agent CRUD (Slice-1) — 2026-06-20

Feature: server-template-config-store · PRD: docs/prd/server-template-config-store.prd.md · Mode: CORE
Loop caps: MAX_DEVREVIEW_LOOPS=4, MAX_QA_RETURNS=3
Validate: `VITE_APP_MODE= APP_MODE= npx vitest run <file>` + `npm run lint`.

Dependency-ordered tasks (TDD: RED first):

| T | REQ | Files | Dep | Gated? |
|---|---|---|---|---|
| T0 | NFR-PREMISE-1 | (user action) verify/apply live Supabase schema (prompt_templates + revisions + audit) + service-role | — | **USER / CONTRA-SB-1** |
| T1 | REQ-004/005 | supabase-schema.sql: template_revisions + template_audit_log (apply_migration) | T0 | gated on T0 |
| T2 | REQ-001 | interfaces.ts (contract extend: saveTemplate/setActive/versions), localRepository.ts (Local parity), supabaseRepository (real impl skeleton) | — | buildable now (Local) |
| T3 | REQ-003/004/005 | server/services/templateStoreService.ts (validation + audit + soft-delete/versioning) | T2 | buildable now |
| T4 | REQ-006 | server/middleware/auth.ts + server/lib/jwt.ts (templates:write scope; admin-no-MFA). Resolve OQ-DESIGN-1: Supabase app_metadata.scopes claim vs agent-token vs admin-role fallback | — | buildable now |
| T5 | REQ-002 | server/index.ts (+ server/routes/templates) — /api/v1/templates list/get/save/set-active | T3,T4 | buildable now (injected repo) |
| T6 | REQ-007 | mcp-server/src/server.ts (+4 tools) | T5 | buildable now |
| T7 | REQ-008 | P9: verify PromptTemplate money-fields (model/cost/dispatchMode @ src/types.ts) → conditional set-active gate | T5 | buildable now |
| T8 | evidence | scripts/smoke: live Supabase persist smoke (flag-gated) | T1,T2,T5 | gated on T0 |

Note: T2–T7 build + unit/integration-verify against the Local/in-memory repo + injected doubles NOW.
T1 + T8 + REQ-001 real-boundary wait on T0 (CONTRA-SB-1, user-owned). OQ-DESIGN-1 resolved in T4 with
explicit fallback. Per-task: coder → code-reviewer → watcher → orchestrator re-verify → atomic commit;
per-increment scope-check.
