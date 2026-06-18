# Product Vision: Prompt Compile Preview Slice

Status: user-confirmed
Confirmed by user: yes
Confirmation date: 2026-06-18
Confirmer: ben.poersch@gmail.com
Feature Slug: prompt-compile-preview
Canvas: [docs/canvas/prompt-compile-preview.canvas.md](../canvas/prompt-compile-preview.canvas.md) (user-confirmed 2026-06-18)
PRD: [docs/prd/prompt-compile-preview.prd.md](../prd/prompt-compile-preview.prd.md)
Author: product-owner (orchestrated)
Date: 2026-06-18

## Target user
Admin/Operator of the Bazzi Middleware Console (triggers + inspects the compile) and the Dev-Team
(maintainability, visible debugging).

## Problem
Today nobody can technically verify the BaZi personalization fill step: `rawFuFireResponse + templateId
→ compiledPrompt` is invisible. The compile route is only a TODO; there is no service. "Who fills what?"
is unanswerable, so a later image/product could carry wrong symbolism undetected.

## Desired change
A visible, deterministic, trustworthy compile preview: the admin selects a Beijing-Modern or
Sichuan-Classical template, and the system shows the fully filled payload — Hanzi/Pinyin from a verified
deterministic table, raw-data bindings, quality gates, and any blockers.

## Core value promise (must not be broken)
**Deterministic symbol truth. The LLM is never a symbol authority.** Symbol values (庚申/申/猴/金) come
ONLY from the FIXED VERIFIED MAPPING TABLE seeded by real FuFire raw data; the LLM only formulates the
image-prompt prose and may never alter a symbol value. The image model never renders readable final text.

## What would count as a wrong/harmful implementation
- The LLM inventing, smoothing, or translating a symbol value (a "beautiful but false" prompt).
- A branch/animal swap (申↔猴) passing.
- An unresolved `{{placeholder}}` or unknown stem/branch being rendered instead of BLOCKED.
- The image model being asked to render readable Hanzi.
- Reporting "done" while the deterministic gates are not actually wired into the route.

## How we know the Vision is fulfilled
The admin clicks Compile Preview and sees: filled compiledPrompt (no unresolved placeholder), the
template, the raw-data paths, the Hanzi/Pinyin, the quality gates, and blockers — with PASS on the §6
reference (Geng/Shen/Monkey/Metal → 庚申/申/猴/金) and BLOCKED on the unknown-symbol / branch-vs-animal /
unresolved-placeholder cases. Real-boundary evidence: live FuFire shape smoke + OpenRouter prose smoke.

## Out of scope
Renderer (PDF/PNG), Gelato/POD dispatch, Etsy automation, full CJK authority, real print production,
persistence migration, image generation execution, the other pipeline buttons (swarm/qa/pod).

## True-Line fields
- vision-link: this file.
- value-check-id: VIS-CV-001 = "every rendered symbol value traces to the verified table or FuFire raw, never to the LLM".
- true-line-status: pass (premises verified at the real boundary, SRC-004).
