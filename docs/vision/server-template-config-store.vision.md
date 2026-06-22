# Product Vision: Server-side Template/Config Store + Agent CRUD

Status: user-confirmed
Confirmed by user: yes
Confirmation date: 2026-06-20
Confirmer: ben.poersch@gmail.com
Feature Slug: server-template-config-store
Canvas: [docs/canvas/server-template-config-store.canvas.md](../canvas/server-template-config-store.canvas.md) (user-confirmed 2026-06-20)
PRD: [docs/prd/server-template-config-store.prd.md](../prd/server-template-config-store.prd.md)
Author: product-owner (orchestrated)
Date: 2026-06-20

## Target user
Admin operators of the Bazzi Middleware Console + autonomous agents (Claude Code, Hermes on the VPS,
Codex) that the operator grants access to.

## Problem
Templates live in browser localStorage / a throwing Supabase stub — there is no shared, server-side
store. Agents cannot really configure templates; every operator has an isolated browser island.

## Desired change
Agents and operators get real, shared, server-side CRUD over prompt templates: list, save, activate.
Full, genuinely useful access — not an anxious locked-down surface.

## Core value promise (must not be broken)
**Full agent access, made robust — not naive.** The access stays full and low-friction (admin role,
no MFA), but the worst case is reversible (soft-delete + versioning), observable (append-only audit
log), and bounded (token-scope `templates:write`), and poisoned templates are rejected at save
(validation). The real-money charge path stays gated — and if any template field can shift
cost/provider/dispatch, activating it routes through that same money gate (no fictional gate).

## What would count as a wrong/harmful implementation
- A leaked autonomous-agent token silently rewriting/deleting all prod templates with no audit, no
  scope limit, no reversibility.
- A poisoned template passing save and reaching the LLM/image path.
- Claiming "server-side persisted" while it still only writes browser localStorage / a stub.
- "Money path gated" claimed while a template field actually shifts cost/dispatch (P9 fiction).
- Reporting real-boundary persistence before the live Supabase schema/service-role is verified.

## How we know the Vision is fulfilled
An agent (via MCP, with a `templates:write` token) saves a template and activates it; a **second
session** reads it back (shared persistence proven); the audit log shows the write; a malformed
template is rejected at save; "delete" leaves the prior revision readable. Real-boundary: a flag-gated
live Supabase persist smoke (after the premise is verified).

## Out of scope
Hard/physical delete (Slice-2), bazi_solo migration (Slice-2), provider/app config, money-path
changes, UI redesign, full Supabase backend for all domains.

## True-Line fields
- vision-link: this file.
- value-check-id: VIS-CV-001 = "agent writes persist to a shared server-side store (not localStorage), bounded + reversible + audited; no money gate bypassed".
- true-line-status: pass (with CONTRA-SB-1 + CONTRA-MONEY as flagged Phase-1 verifications).
