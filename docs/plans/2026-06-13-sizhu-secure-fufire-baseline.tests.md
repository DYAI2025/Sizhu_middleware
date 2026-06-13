# Acceptance / E2E test plan — sizhu-secure-fufire-baseline

Status: Phase 1 (tester) — black-box acceptance layer derived INDEPENDENTLY from the spec,
BEFORE the coder. This is the contract the coder must satisfy.

- PRD: `docs/prd/sizhu-secure-fufire-baseline.prd.md`
- Vision: `docs/vision/sizhu-secure-fufire-baseline.vision.md`
- Canvas: `docs/canvas/sizhu-secure-fufire-baseline.canvas.md`
- Contract: `docs/contracts/fufire-api-reference.md` + `fufire-samples/{bazi,wuxing}.response.json`
- Owner: tester (QA). Author date: 2026-06-13. Branch: `feat/sizhu-secure-fufire-baseline`.

All API-level tests drive the PRODUCTION composition root (`createApp()` via supertest), so
they reach **real-boundary-smoke** rather than a hand-built harness. FuFire response mapping
is tested against the **real captured samples** → **integration-fake** (real sample data, not
a live FuFire call) — the honest ceiling for this run, per Vision "Honest evidence ceiling".

---

## 0. Kritische semantische Glättung — per top-level REQ (gated 3-beat)

Boundary gate first (`boundary` = crosses HTTP/I/O/outbound-fetch/env-config-that-ships;
`pure` = in-process transform only). Counter-thesis owed only for boundary REQs.

| REQ | Boundary? | These (self-evident) | Gegenthese (green-but-zero-value) | Schärfung (the killing test) |
|---|---|---|---|---|
| REQ-A-001 (remove SSRF proxy) | boundary | "It's behind apiGuard, so SSRF handled." | Auth suite green while body-controlled URL/secret primitive is STILL live — any admin steers outbound URL + secret. | Spy `global.fetch`; admin aal2 + hostile body must NEVER fetch attacker URL nor put attacker-chosen secret in outbound header. `fufire.ssrf.routes.test.ts` |
| REQ-S-001/S-002 (auth/role/MFA) | boundary | "Sensitive routes guarded; auth suite green." | A NEW sensitive route (validate-dispatch) is added but missing from `SENSITIVE_API_ROUTES` → silently `session`-only; a non-admin writes through it. | Hit validate-dispatch through `createApp()` with no token / non-admin / aal1 and assert 401/403. `security.matrix.routes.test.ts` |
| REQ-F-001 (request builders) | **pure** | "A request body is produced." | (No invented runtime/overflow failure modes — pure transform.) The real risk: a body that does not match the contract; the historical miss = asserting hardcoded literals, never invoking a builder. | Assert body **from builder output** (AC-F-001f); pin nested-vs-flat, single ISO date, wuxing lat/lon required, default-noon. `fufire.requestBuilders.test.ts` |
| REQ-F-002/F-003 (interpreter + mapper) | boundary (trust boundary: real-vs-invented data) | "Prompt vars populated; template renders." | Interpreter SUBSTITUTES a guessed value on a missing source (or maps deferred ops as verified, or launders the day-pillar `unverified`) → customer gets invented meaning as their own; every render test still green. | Missing source → `PROMPT_VARIABLE_SOURCE_MISSING` + render-block (never guess); deferred ops render-block; `unverified` surfaced; 0,0-derived `dominant_element` never bound to a real person. `fufire.responseInterpreter.test.ts` |
| REQ-A-002 (OpenRouter default) | boundary (shipped env/config) | "Gateway configured." | A forced `GEMINI_API_KEY` / OpenAI default still ships in `.env.example`; OpenRouter is NOT the single default. Config 'works' yet the value promise breaks. | Grep shipped `.env.example`: `OPENROUTER_*` present + server-side only; no forced `GEMINI_API_KEY`/`OPENAI_API_KEY` default. `openrouter.gateway.test.ts` |
| REQ-D-001 / REQ-O-002 (no fake success; mode boundary) | boundary (mode-driven side effects) | "Dispatch/persistence returns a result." | DEMO_LOCAL fake-success leaks into a path read as production → mock dispatch success while operator believes production. Tests pass because they only exercise DEMO_LOCAL. | Drive REAL `PodDispatchService` with NON-DEMO `APP_MODE` → `ok:false` (no `mock_success`); pin mode boundary at the REAL `getAppMode()` source. `no-fake-success.mode.test.ts` |
| REQ-O-001 (health/readiness/CORS) | boundary (HTTP + env-driven readiness) | "Health 200; readiness returns a status." | Readiness returns READY though required env missing (mock 'works') → operator trusts a system that can't serve. | With required env unset, readiness = 503 NOT_READY + names missing. `operational.routes.test.ts` |

No counter-thesis is forced for the **pure** REQ-F-001 (no boundary to cross); no invented
overflow/NaN/degradation tests were added for it — only contract-shape logic.

---

## 1. Coverage map — every AC + VCHK + "Risks if Misbuilt" → concrete test or recorded blocker

Legend — testability: `now` = surface exists, test runs today; `coder-creates-module-first` =
red contract that imports the intended module path / asserts not-yet-built behavior.
Evidence: `RBS` = real-boundary-smoke, `IF` = integration-fake (real sample, no live call),
`PCG` = pure-config/source-grep, `PURE` = pure-logic.

### REQ-S-001 / REQ-S-002 — auth, role, MFA (VCHK-SFB-003)

| AC | Test (file::name) | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-S-001a | `security.matrix.routes.test.ts::AC-S-001a — public health stays open` | now | RBS | PASS |
| AC-S-001b | `security.matrix.routes.test.ts::AC-S-001b — default-deny on unlisted routes` | now | RBS | PASS |
| AC-S-001c | `security.matrix.routes.test.ts::AC-S-001c / §6 matrix — every sensitive POST route denies without auth` (incl. fufire test-run, pod/dispatch, secret-references/check) | now | RBS | PASS |
| AC-S-002a | `security.matrix.routes.test.ts::AC-S-002a — invalid token / unverified email` | now | RBS | PASS |
| AC-S-002b | `security.matrix.routes.test.ts::AC-S-002b — role gate on every sensitive route` | now (validate-dispatch row RED) | RBS | PARTIAL — validate-dispatch RED |
| AC-S-002c | `security.matrix.routes.test.ts::AC-S-002c — MFA/AAL2 gate on every sensitive route` | now (validate-dispatch row RED) | RBS | PARTIAL — validate-dispatch RED |
| AC-S-002d | `bundle.secret-hygiene.test.ts::AC-S-002d — no service-role key value in the frontend bundle/source` | now | RBS if `dist/` built, else PCG | PASS (PCG ceiling) |
| §6 finding: validate-dispatch must be `sensitive` | `security.matrix.routes.test.ts::… /api/fulfillment/pod/validate-dispatch …` | now | RBS | **RED CONTRACT** (returns 400, route only `session`-classified) |
| VCHK-SFB-003 | covered by all AC-S-001/002 rows above | now | RBS | mostly PASS, 1 RED |

Existing `server/tests/auth.routes.test.ts` already covers the fufire test-run + pod/dispatch
auth path (PASS). This plan's `security.matrix.routes.test.ts` adds the missing matrix rows.

### REQ-A-001 — remove SSRF/config-bypass proxy (VCHK-SFB-002)

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-A-001a (generic proxy removed) | `fufire.ssrf.routes.test.ts::AC-A-001a` | now | RBS | **RED CONTRACT** (proxy live at server/index.ts:196) |
| AC-A-001b (body can't steer URL/secret) | `fufire.ssrf.routes.test.ts::AC-A-001b / VCHK-SFB-002` | now | RBS | **RED CONTRACT** |
| AC-A-001c (server owns config) | covered by AC-A-001a/b assertions (no attacker URL/secret reaches outbound) | now | RBS | **RED CONTRACT** |
| AC-A-001d (unknown op controlled) | `fufire.ssrf.routes.test.ts::AC-A-001d — FUFIRE_OPERATION_NOT_ALLOWED` | now | RBS | **RED CONTRACT** |
| AC-A-001e (stale classifier removed) | `fufire.ssrf.routes.test.ts::AC-A-001e — dead /fufire/* entry gone` | now | RBS (source grep of auth.ts) | **RED CONTRACT** (entry present at auth.ts:143) |
| VCHK-SFB-002 | `fufire.ssrf.routes.test.ts` (whole file) | now | RBS | **RED CONTRACT** |

### REQ-F-001 — request builders (pure)

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-F-001a (chronometry nested) | `fufire.requestBuilders.test.ts::AC-F-001a` | coder-creates-module-first | PURE | **RED CONTRACT** (module missing) |
| AC-F-001b (bazi/bazi_trace flat) | `fufire.requestBuilders.test.ts::AC-F-001b` | coder-creates-module-first | PURE | **RED CONTRACT** |
| AC-F-001c (wuxing flat, lat/lon required) | `fufire.requestBuilders.test.ts::AC-F-001c` | coder-creates-module-first | PURE | **RED CONTRACT** |
| AC-F-001d (default-noon) | `fufire.requestBuilders.test.ts::AC-F-001d` | coder-creates-module-first | PURE | **RED CONTRACT** |
| AC-F-001e (missing geo → NO_GEOCODER_CONFIGURED) | covered at the endpoint level (FuFireDataService already returns NO_GEOCODER_CONFIGURED). Recorded as `now`-testable at the boundary if the coder routes the operation-only endpoint through the geocoder check; otherwise add an endpoint assertion in T3. | partial | RBS | **RECORDED** — see note (1) |
| AC-F-001f (asserted from output, not literals) | `fufire.requestBuilders.test.ts::AC-F-001f — output is computed, not constant` | coder-creates-module-first | PURE | **RED CONTRACT** |
| AC-F-001g (no secret in body/metadata) | `fufire.requestBuilders.test.ts::AC-F-001g` | coder-creates-module-first | PURE | **RED CONTRACT** |

### REQ-F-002 / REQ-F-003 — response interpreter + prompt mapper (VCHK-SFB-001/004/005/007)

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-F-002a (mapping paths recorded; locale de/en) | `fufire.responseInterpreter.test.ts::AC-F-002a` | coder-creates-module-first | IF | **RED CONTRACT** |
| AC-F-002b (missing field blocks, no guess) | `fufire.responseInterpreter.test.ts::AC-F-002b / VCHK-SFB-001` | coder-creates-module-first | IF | **RED CONTRACT** |
| AC-F-002c (response sanitized, no secret) | folded into AC-F-001g + AC-A-001b boundary secret checks; add a dedicated sanitized-metadata assertion when the interpreter exists (note 2) | partial | IF | **RECORDED** — see note (2) |
| AC-F-002d (deferred ops render-block) | `fufire.responseInterpreter.test.ts::AC-F-002d / VCHK-SFB-007` (bazi_trace + chronometry) | coder-creates-module-first | IF | **RED CONTRACT** |
| AC-F-002e (day-pillar unverified surfaced) | `fufire.responseInterpreter.test.ts::AC-F-002e / VCHK-SFB-004` | coder-creates-module-first | IF | **RED CONTRACT** |
| AC-F-002f (wuxing real lat/lon; 0,0 not bound) | `fufire.responseInterpreter.test.ts::AC-F-002f — 0,0-derived dominant_element never bound` (+ positive path) | coder-creates-module-first | IF | **RED CONTRACT** |
| AC-F-003a (only safe mapped vars) | `fufire.responseInterpreter.test.ts::AC-F-003a` | coder-creates-module-first | PURE | **RED CONTRACT** |
| AC-F-003b (missing var blocks render) | `fufire.responseInterpreter.test.ts::AC-F-003b` | coder-creates-module-first | PURE | **RED CONTRACT** |
| AC-F-003c (no deterministic fortune / no verified-truth) | `fufire.responseInterpreter.test.ts::AC-F-003c / VCHK-SFB-005` | coder-creates-module-first | IF | **RED CONTRACT** |
| VCHK-SFB-001/004/005/007 | covered by the AC-F-002/003 rows above | coder-creates-module-first | IF | **RED CONTRACT** |

### REQ-A-002 — OpenRouter default gateway

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-A-002a (OpenRouter default, server-side) | `openrouter.gateway.test.ts::AC-A-002a` | now | RBS (.env.example artifact) | **RED CONTRACT** (no OPENROUTER_* in .env.example) |
| AC-A-002b (no forced Gemini/OpenAI default) | `openrouter.gateway.test.ts::AC-A-002b` | now | PCG | **RED CONTRACT** (GEMINI_API_KEY forced in .env.example) |
| AC-A-002c (UI labels Model Gateway/OpenRouter) | **RECORDED BLOCKER (test-debt)** — UI label assertion deferred to T5; needs the modelGateway UI surface which does not exist yet. Add a component/source test when `src/lib/modelGateway/**` lands. | coder-creates-module-first | PCG | **RECORDED — note (3)** |
| AC-A-002d (MODEL_CAPABILITY_MISMATCH) | **RECORDED BLOCKER (test-debt)** — needs the model gateway module (not in this file set); add when `src/lib/modelGateway/**` lands in T5. | coder-creates-module-first | PURE | **RECORDED — note (3)** |

### REQ-D-001 — production persistence boundary (VCHK-SFB-006)

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-D-001a (production → SUPABASE_NOT_CONFIGURED) | **RECORDED** — no persistence-dependent endpoint is wired this run (canvas: no real persistence). The mode boundary that backs it is pinned in `no-fake-success.mode.test.ts`. When the coder adds the production guard in a persistence path (T6), add a `SUPABASE_NOT_CONFIGURED` boundary assertion. | partial | RBS | **RECORDED — note (4)** |
| AC-D-001b (no silent localStorage in prod paths) | `no-fake-success.mode.test.ts` (mode boundary) + repository-source guard to add in T6 | partial | RBS | **RECORDED — note (4)** |
| AC-D-001c (DEMO_LOCAL explicit, only mock site) | `no-fake-success.mode.test.ts::AC-D-001c — DEMO_LOCAL is the ONLY mode where a mock success may be returned` | now | RBS | PASS |
| AC-D-001d (mode boundary at real getAppMode()) | `no-fake-success.mode.test.ts::AC-D-001d — mode boundary pinned at the real getAppMode() source` (+ unset-default guard) | now | RBS | PASS — see note (5) on the server/index.ts:90 vs default inconsistency |

### REQ-O-001 — health public + readiness truthful + CORS

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-O-001a | `operational.routes.test.ts::AC-O-001a — health always 200` | now | RBS | PASS |
| AC-O-001b | `operational.routes.test.ts::AC-O-001b — readiness 503 when config missing; never READY on mock` | now | RBS | PASS |
| AC-O-001c | `operational.routes.test.ts::AC-O-001c — unknown origin no 500; static not gated` | now | RBS | PASS |

### REQ-O-002 — Gelato dispatch safe / no fake success / idempotency (VCHK-SFB-006)

| AC | Test | Testability | Evidence | Status now |
|---|---|---|---|---|
| AC-O-002a (disabled/missing contract → controlled error) | `no-fake-success.mode.test.ts::AC-O-002a` | now | RBS | PASS |
| AC-O-002b (no fake success outside DEMO_LOCAL) | `no-fake-success.mode.test.ts::AC-O-002b / VCHK-SFB-006` (PRODUCTION/CONFIG_REQUIRED/SUPABASE_READY/PRODUCTION_NOT_READY) | now | RBS | PASS |
| AC-O-002c (idempotency key logged before dispatch) | **RECORDED BLOCKER (test-debt)** — `PodDispatchService` does not yet generate/log an idempotency key; assertion deferred to T7. When the key is added, assert it is generated + sanitized-logged before any real dispatch work. | coder-creates-module-first | RBS | **RECORDED — note (6)** |

---

## 2. "Risks if Misbuilt" (Vision) → falsifying test or recorded blocker

The project's historical miss was a failure-mode written down then shipped because it never
became a test. Every Vision risk below is bound to a concrete test (no risk left as prose).

| Risk if Misbuilt (Vision) | Falsifying test | Status |
|---|---|---|
| Re-authing the SSRF proxy instead of removing it | `fufire.ssrf.routes.test.ts` (whole file — fetch-spy proves the body-controlled primitive is gone, not merely behind auth) | RED CONTRACT |
| Mapping prompt vars against guessed response shapes (bazi_trace/chronometry as verified) | `fufire.responseInterpreter.test.ts::AC-F-002d` | RED CONTRACT |
| Silent mock/localStorage in production | `no-fake-success.mode.test.ts` (mode boundary) + AC-D-001b recorded for T6 repository guard | PASS (mode) + RECORDED (repo path) |
| Fake Gelato success outside DEMO_LOCAL | `no-fake-success.mode.test.ts::AC-O-002b` | PASS |
| Claiming interpretation as truth / day-pillar as verified | `fufire.responseInterpreter.test.ts::AC-F-002e + AC-F-003c` | RED CONTRACT |
| Demo-mode leakage (demo success leaks into a production-read path) | `no-fake-success.mode.test.ts::AC-D-001d` (unset-default guard) + AC-O-002b | PASS |

---

## 3. Recorded notes / test-debt (explicit, not silently dropped)

1. **AC-F-001e (NO_GEOCODER_CONFIGURED):** the existing `FuFireDataService.executeTestRun`
   already returns this when manual lat/lon are absent. Once the coder routes the
   operation-only endpoint through the server-owned builders/client (T3), add a boundary
   assertion that a geo-missing request returns the controlled `NO_GEOCODER_CONFIGURED`
   gateway issue (not a guessed coordinate). Currently exercised indirectly; promote to a
   dedicated assertion in T3.
2. **AC-F-002c (sanitized response, no secret):** add a dedicated sanitized-response-metadata
   assertion once the interpreter exists (T4). Partial coverage today via the outbound-secret
   checks in `fufire.ssrf.routes.test.ts` and `fufire.requestBuilders.test.ts::AC-F-001g`.
3. **AC-A-002c/d (UI labels + MODEL_CAPABILITY_MISMATCH):** require `src/lib/modelGateway/**`
   which does not exist. Recorded as test-debt for T5; add a component/source test + a
   capability-mismatch unit test when the module lands. NOT silently passed.
4. **AC-D-001a/b (production → SUPABASE_NOT_CONFIGURED; no localStorage in prod paths):** no
   persistence-dependent endpoint is wired this run (canvas: clean-block only, no real
   persistence). The mode boundary that gates it is pinned in `no-fake-success.mode.test.ts`.
   Add the `SUPABASE_NOT_CONFIGURED` boundary + repository-source guard in T6.
5. **AC-D-001d inconsistency (audit note N5):** `server/index.ts:90` defaults `appMode` to
   `CONFIG_REQUIRED` while `getAppMode()` (the real source, `src/lib/app/appMode.ts`) defaults
   to `DEMO_LOCAL`. The mode-boundary tests pin behavior at the REAL `getAppMode()` source and
   require the unset default to never be an implicit production mode. The coder must reconcile
   the two so demo-success cannot leak into a production-read path; the test documents the
   required invariant.
6. **AC-O-002c (idempotency key):** `PodDispatchService` has no idempotency-key generation yet.
   Recorded as test-debt for T7; assert generated + sanitized-logged before any real dispatch.

---

## 4. `npm test` result (authored 2026-06-13)

`npm test` = `vitest run`. After `npm install`:

```
Test Files  5 failed | 7 passed (12)
      Tests  8 failed | 84 passed (92)
```

### Intended RED contracts (the coder makes these GREEN — do NOT touch them to force green)

- `server/tests/fufire.requestBuilders.test.ts` — fails at LOAD: imports
  `../services/fufireRequestBuilders` (T3, not built). 0 tests collected until the module exists.
- `server/tests/fufire.responseInterpreter.test.ts` — fails at LOAD: imports
  `../services/fufireResponseInterpreter` (T4, not built). 0 tests collected until the module exists.
- `server/tests/fufire.ssrf.routes.test.ts` — 4 fail: SSRF proxy still live (T1).
- `server/tests/security.matrix.routes.test.ts` — 2 fail: `validate-dispatch` is `session`-only
  (returns 400 instead of 403) — the §6 misclassification finding (T2). The other 18 PASS.
- `src/tests/openrouter.gateway.test.ts` — 2 fail: `.env.example` forces `GEMINI_API_KEY` and
  has no `OPENROUTER_*` defaults (T5). 1 PASS (no forced SECRET_REF_GEMINI_* default).

### Already-GREEN (verifies shipped behavior — guards against regression)

- `server/tests/operational.routes.test.ts` — health/readiness/CORS (REQ-O-001). All PASS.
- `server/tests/no-fake-success.mode.test.ts` — mode boundary + no-fake-dispatch (REQ-D-001d,
  REQ-O-002b, AC-D-001c). All PASS.
- `server/tests/security.matrix.routes.test.ts` — 18/20 PASS (all but validate-dispatch).
- `src/tests/bundle.secret-hygiene.test.ts` — AC-S-002d (PCG ceiling; PASS).
- `server/tests/auth.routes.test.ts` (pre-existing) + `src/tests/*` (pre-existing) — PASS.

### `npm run lint` (`tsc --noEmit`) — KNOWN intended RED

`tsc --noEmit` exits **2** with exactly 2 errors (TS2307) — the two not-yet-existing module
imports in `fufire.requestBuilders.test.ts` and `fufire.responseInterpreter.test.ts`. This is
the intended TDD red state; it resolves the moment the coder creates those two modules (T3, T4).
No other type errors. Do not silence these by deleting the imports — the imports ARE the
contract for the module path + public surface.

> NOTE on `src/tests/fufire.test.ts` (pre-existing): it is **test theater** — every "contract"
> case asserts hardcoded literals against locally-defined objects and never invokes a builder
> (e.g. `expect(baziBody.standard).toBe('CIVIL')`). It proves nothing about production code.
> `fufire.requestBuilders.test.ts` replaces its intent with output-asserted contracts. The coder
> / reviewer should treat the old file as superseded (deletion is a coder/reviewer call — out of
> the tester's allowed scope to remove production-adjacent fixtures beyond tests/docs, but flagged
> here as a finding).

---

## 5. Honest evidence ceilings (Reality Ledger inputs)

- API auth / SSRF / health / readiness / dispatch-mode: **real-boundary-smoke** (production
  `createApp()` + real `apiGuard` + real `PodDispatchService`). NOT a live FuFire/Gelato call.
- FuFire request builders: **pure-logic** asserted from real builder output against the
  authoritative contract — verifiable (`belegt`).
- FuFire response mapping (bazi + wuxing): **integration-fake** — real captured samples, NOT a
  live FuFire call. The best achievable without live network this run.
- `bazi_trace` + `chronometry/resolve` response mapping: **render-blocked / unverified** (no real
  samples) — tested to PROVE they render-block, never asserted as verified.
- Day-pillar anchor: provider-declared `unverified` — surfaced, never laundered.
- AC-S-002d frontend secret hygiene: real-boundary-smoke only after `npm run build` populates
  `dist/`; otherwise pure-source-grep (lower ceiling, recorded).
- `value-risk` routed to plumbline-watcher: AC-A-002c/d, AC-O-002c, AC-D-001a/b, AC-F-001e,
  AC-F-002c carry recorded test-debt this iteration — value not yet fully provable; not silently
  passed.
