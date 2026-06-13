# Plan: sizhu-secure-fufire-baseline (Phase 1, authoritative)

Status: ready-for-build
Owner: planner
Date: 2026-06-13
Branch: feat/sizhu-secure-fufire-baseline
Working dir: /Users/benjaminpoersch/Projects/SaaS/Sizhu/Sizhu_middleware

Upstream (read these first):
- PRD: `docs/prd/sizhu-secure-fufire-baseline.prd.md` (REQ-IDs §2, security matrix §6, data shapes §3, task seed §7)
- Canvas (value baseline, wins on divergence): `docs/canvas/sizhu-secure-fufire-baseline.canvas.md`
- Request contract (authoritative): `docs/contracts/fufire-api-reference.md`
- Real response samples: `docs/contracts/fufire-samples/{bazi,wuxing}.response.json`
- Tester coverage map: `docs/plans/2026-06-13-sizhu-secure-fufire-baseline.tests.md` *(NOT YET PRESENT — see Preconditions; this plan defines the per-task test contracts the tester refines)*

This plan is the authoritative Phase-1 task sequence. It refines PRD §7 into atomic,
dependency-ordered, TDD tickets. **Code/altitude rule for this run: docs + plan only here;
each ticket is executed later by coder/tester within Allowed change scope.**

---

## Goal

Ship a secure, testable Sizhu middleware baseline that (1) removes the body-controlled FuFire
proxy SSRF/config-bypass primitive and replaces it with a server-owned operation-only endpoint,
(2) builds FuFire request bodies server-side against the authoritative contract, (3) maps
**verified** FuFire response data into prompt variables **for bazi + wuxing only**
(render-blocking on missing fields), (4) makes OpenRouter the only default model gateway,
(5) keeps production persistence and Gelato dispatch explicitly blocked (no silent
mock/localStorage fallback, no fake dispatch success outside `DEMO_LOCAL`) — verified against
the production composition root (`createApp()`) and the real captured samples.

## Non-goals (do not build — PRD §1 "out of scope", canvas §7)

- No Etsy webhook automation.
- No real Gelato order/draft creation (stays `MISSING_POD_CONTRACT`-blocked).
- No real Supabase production persistence (block, do not fake).
- No autonomous prompt-learning writeback.
- No new paid runtime provider dependency beyond Supabase/FuFire/OpenRouter/Gelato.
- No response-mapping **assertion** for `bazi_trace` / `chronometry/resolve` (no real samples →
  render-block as `PROMPT_VARIABLE_SOURCE_MISSING`, never asserted verified).
- **Permanent constraint:** no inventing BaZi/Wu-Xing/zodiac/element/birth data; never label
  FuFirE *interpretation* "verified truth" (claim-discipline binds UI/log/report/QA wording).

---

## Preconditions and known gaps

**Confirmed grounding (read by planner 2026-06-13):**
- Production composition root is `createApp()` in `server/index.ts`; tests import it directly
  and drive it with `supertest` + `vitest` (pattern established in `server/tests/auth.routes.test.ts`).
- JWT/AAL fixtures already exist: `signJwtHS256` from `server/lib/jwt` produces tokens with
  `aal`, `email_confirmed_at`, `sub`, `email`, `exp`. Auth env keys:
  `SUPABASE_JWT_SECRET`, `ADMIN_EMAIL_ALLOWLIST`, `AUTH_REQUIRED`, `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS`.
- The SSRF primitive is live at `server/index.ts:196-262` (`POST /api/fufire/*`) — reads
  `fuFireConfig.{baseUrl,apiKeySecretRef,enabled,timeoutMs}` and `fufirePath` from `req.body`.
- Wrong request bodies: `server/services/fufireDataService.ts:116-140` emits
  `{year,month,day,hour}` for bazi/baziTrace and `{elements:[]}` for wuxing.
- Dead classifier entry: `server/middleware/auth.ts:143` `{ POST, /^\/fufire(\/.*)?$/ }`.
- `validate-dispatch` gap: `POST /api/fulfillment/pod/validate-dispatch` (server/index.ts:156)
  is NOT in `SENSITIVE_API_ROUTES` → currently `session`-only. PRD §6 RESOLVED: make `sensitive`.
- Mode source: `getAppMode()` in `src/lib/app/appMode.ts` (defaults `DEMO_LOCAL`). `server/index.ts:90`
  defaults the `/api/config/*` snapshot `appMode` to `CONFIG_REQUIRED` — **inconsistency to resolve** (AC-D-001d).
- `PodDispatchService` (`server/services/podDispatchService.ts:8`) already gates mock behind
  `getAppMode() === 'DEMO_LOCAL'` and returns `MISSING_POD_CONTRACT` otherwise — T7 verifies + adds idempotency.
- Real samples confirmed: bazi `pillars.year.tier="Pferd"`, `chinese.year.animal="Horse"`,
  `transition.solar_year=1990`, `derivation_trace.day.day_anchor_evidence.anchor_verification="unverified"`;
  wuxing `dominant_element="Holz"` computed at `input.lat/lon = 0,0` → **shape fixture only** (AC-F-002f).
- Baseline gates (must stay green): `npm run lint` (`tsc --noEmit`), `npm run build`, `npm test` (vitest run).
- `src/lib/modelGateway/**` does not exist yet — T5 may create it within scope. `package.json`
  has no `test:api`/`test:e2e` (ASSUMPTION: not gates this run; do not invent them).

**Known gaps / carried items (PRD §9 — not closed here):**
- DEFERRED-UNVERIFIED: response-mapping for `bazi_trace` + `chronometry/resolve` (no samples) → render-block only.
- ASSUMPTION: Supabase Auth is the auth provider (not re-verified this run).
- MISSING (non-blocking for code): Railway env values, Supabase first-owner ID, final auth-key setup.

**Tester coverage map:** `docs/plans/2026-06-13-sizhu-secure-fufire-baseline.tests.md` is **not present yet**.
Each task below names its gating test(s) and evidence-class. Where the tester later authors a
contract test for a task, the coder consumes it; where no tester contract exists at execution
time, the coder writes the failing unit/supertest first (TDD red) before production code.

**Allowed change scope (hard boundary — any file a task touches MUST be inside this set; canvas §"Allowed change scope"):**
`server/index.ts`, `server/middleware/**`, `server/routes/**`, `server/contracts/**`,
`server/services/**`, `server/tests/**`, `src/lib/auth/**`, `src/lib/apiConnections/**`,
`src/lib/modelGateway/**`, `src/lib/repositories/**` (boundary/production guard ONLY),
`src/components/auth/**`, `src/components/FuFireTestConsole.tsx`, `src/components/fufire/**`,
`src/tests/**`, `tests/**`, the listed docs, `.env.example`, `package.json` (test/dev scripts only —
no new runtime provider dependency).

**Loop caps (governance):** `MAX_DEVREVIEW_LOOPS=4`, `MAX_QA_RETURNS=3` per task.

**Evidence classes used below:**
- `real-boundary-smoke` — supertest against the real `createApp()` composition root (no live FuFire network).
- `integration-fake` — logic exercised against the **real captured samples** (real data, not a live call).
- `unit` — pure function / builder assertion.
- `grep/checklist` — static assertion over bundle/env/source.

---

## Iteration model

**M = 8 build iterations.** Each task T1–T8 is one iteration (one TDD red→green→review→QA loop,
one Watcher value-check, one increment of evidence). This is the honest, re-scopable count: it
mirrors the PRD's atomic task seed (§7), keeps the SSRF fix as its own shippable increment, and
keeps each verifiable concern (auth gate, builders, interpreter, gateway, persistence boundary,
dispatch safety, verification log) independently reviewable. Do not round it; if a task splits
during execution, increment M and renumber rather than silently merging concerns.

**Critical path:** T1 → T3 → T4 → T8.
**Parallelizable:** after T1 → {T2, T3} may run in parallel; after T2 → {T5, T6, T7} may run in
parallel. T4 is strictly after T3 (needs builders + real client wiring). T8 is strictly last
(needs all green).

```
T1 (SSRF fix + Sprint-0, standalone)
 ├─► T2 (auth/role/MFA lock) ──► T5 (OpenRouter)  ┐
 │                              T6 (persistence)  ├─► T8 (verification log)
 │                              T7 (Gelato safety)┘
 └─► T3 (request builders) ──► T4 (bazi+wuxing interpreter + prompt mapper) ─► T8
```

---

## Task list

### T1 — Remove SSRF proxy, add operation-only endpoint, fold in Sprint-0 stabilization
- **Goal:** Eliminate the body-controlled FuFire proxy primitive. Server resolves
  baseUrl/path/auth-header/secret exclusively from env/config; client may send only
  `operation`/`requestedOperations`/`input`/`options`. Ignore/reject `fuFireConfig`, `fufirePath`,
  `baseUrl`, `apiKeySecretRef`, `authHeaderName`. Unknown operation → `FUFIRE_OPERATION_NOT_ALLOWED`.
  Remove the dead `/^\/fufire(\/.*)?$/` classifier entry. Fold Sprint-0: health public+200, static
  not behind CORS, unknown origin no unhandled 500. **Standalone shippable increment.**
- **REQ-IDs / AC-IDs:** REQ-A-001 (AC-A-001a/b/c/d/e), REQ-O-001 (AC-O-001a/c).
- **blockedBy:** none (FIRST).
- **Files (within scope):**
  `server/index.ts` (remove `POST /api/fufire/*` block lines 196-262; ensure the operation-only
  endpoint `POST /api/data-requests/fufire/test-run` strips/ignores config-steering body fields),
  `server/middleware/auth.ts` (remove dead `SENSITIVE_API_ROUTES` entry at line 143),
  `server/services/fufireDataService.ts` (ensure server-owned config resolution; no body-driven
  URL/secret — wiring only, builder bodies are T3),
  optional `server/contracts/fufireOperations.ts` (allowed-operation allowlist enum),
  `server/tests/fufire.boundary.test.ts` (new), `server/tests/health.cors.test.ts` (new).
- **Tests that gate it (TDD red first):**
  - `real-boundary-smoke`: `POST /api/fufire/<anything>` no longer reaches an outbound-fetch handler
    (default-deny / not-found, never an outbound fetch) — AC-A-001a.
  - `real-boundary-smoke`: a body carrying `fuFireConfig`/`fufirePath`/`baseUrl`/`apiKeySecretRef`
    to the operation-only endpoint does NOT change the outbound URL/header/secret env read
    (assert via a spy/fake on the outbound boundary or by asserting the resolved target is the
    env-config value, never the body value) — AC-A-001b/c.
  - `unit`/`real-boundary-smoke`: unknown `operation` → `FUFIRE_OPERATION_NOT_ALLOWED` — AC-A-001d.
  - `unit`: `classifyApiRoute("POST","/fufire/x")` no longer returns `"sensitive"` via the removed
    entry; classification table has no dangling sensitive route, default-deny posture unchanged — AC-A-001e.
  - `real-boundary-smoke`: `GET /api/health` → 200 `{status:"ok"}` no auth; `GET /assets/*` not
    401/403; unknown API origin in production-mode CORS yields a controlled response, not unhandled 500 — AC-O-001a/c.
- **Evidence-class:** `real-boundary-smoke` (+ `unit` for classifier).
- **Watcher value-question:** Does removing the body-controlled URL/secret primitive (not merely
  re-authing it) deliver the operator's confirmed value — "no public/arbitrary backend access; the
  server, never the caller, decides where the FuFire secret goes"? (canvas §4, risk §8.)
- **Rollback:** revert `server/index.ts` + `server/middleware/auth.ts` to prior commit; the removed
  route and classifier entry are self-contained.

### T2 — Verify + lock auth/role/MFA gate (and validate-dispatch classification)
- **Goal:** Lock the default-deny + role + AAL2 posture against `createApp()`. Resolve the
  `validate-dispatch` classification (make it `sensitive`). Confirm the built frontend bundle
  exposes no service-role key.
- **REQ-IDs / AC-IDs:** REQ-S-001 (AC-S-001a/b/c), REQ-S-002 (AC-S-002a/b/c/d).
- **blockedBy:** T1 (route surface stable; `/api/fufire/*` gone).
- **Files (within scope):**
  `server/middleware/auth.ts` (add `{ method:"POST", pattern:/^\/fulfillment\/pod\/validate-dispatch\/?$/ }`
  to `SENSITIVE_API_ROUTES`),
  `server/tests/auth.routes.test.ts` (extend with the matrix below),
  `src/tests/auth.frontend.test.ts` and/or `server/tests/bundle.nosecret.test.ts` (no service-role key in bundle).
- **Tests that gate it (TDD red first):**
  - `real-boundary-smoke`: no token → 401 `AUTH_REQUIRED` on every non-public `/api/*`
    (incl. `test-run`, `pod/dispatch`, `pod/validate-dispatch`, `secret-references/check`) — AC-S-001b/c.
  - `real-boundary-smoke`: invalid token → 401 `INVALID_AUTH_TOKEN`; valid token `emailVerified=false`
    → 403 `EMAIL_VERIFICATION_REQUIRED` — AC-S-002a.
  - `real-boundary-smoke`: valid+verified, role∉{owner,admin,operator} → 403 `ADMIN_ROLE_REQUIRED` — AC-S-002b.
  - `real-boundary-smoke`: `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true` + admin `aal1` → 403
    `MFA_REQUIRED_FOR_ACTION`; same with `aal2` → passes the guard — AC-S-002c.
  - `real-boundary-smoke`: `pod/validate-dispatch` now enforces 401/403/aal2 like `dispatch` — PRD §6 RESOLVED.
  - `grep/checklist`: built bundle contains no Supabase service-role key value (only refs) — AC-S-002d.
- **Evidence-class:** `real-boundary-smoke` (+ `grep/checklist` for bundle).
- **Watcher value-question:** Does the locked gate guarantee that only an email-verified,
  admin-role, MFA-satisfied operator can trigger sensitive FuFire/fulfillment actions — the
  operator-trust half of the value promise (canvas §4)?
- **Rollback:** revert the single `SENSITIVE_API_ROUTES` addition + test edits; no handler logic changes.

### T3 — FuFire request builders against the authoritative contract
- **Goal:** Replace the wrong request bodies with contract-correct server-side builders:
  chronometry (nested `birth.*`), bazi/bazi_trace (flat, `bazi_trace` sets `include_trace:true`),
  wuxing (flat, `lat`+`lon` REQUIRED). Combine birth date+time into a single ISO `date`. Default-noon
  rule (`12:00:00`, `birth_time_known:false`, source `default_noon`, warning
  `BIRTH_TIME_UNKNOWN_DEFAULT_NOON`). Missing geo/tz → `NO_GEOCODER_CONFIGURED` (no guessed coords).
  No secret in `sanitizedRequestMetadata`/logs.
- **REQ-IDs / AC-IDs:** REQ-F-001 (AC-F-001a/b/c/d/e/f/g).
- **blockedBy:** T1 (server-owned client wiring in place).
- **Files (within scope):**
  `server/contracts/fufireContract.ts` (new — request shape types/validators mirroring contract §3.1),
  `server/services/birthInputNormalizer.ts` (new — normalize birth input → ISO `date`, default-noon, geo guard),
  `server/services/fufireRequestBuilders.ts` (new — `buildChronometry/buildBazi/buildBaziTrace/buildWuxing`),
  `server/services/fufireClient.ts` (new — server-owned outbound call: env baseUrl/path/header/secret,
  AbortController+timeout → `FUFIRE_TIMEOUT`),
  `server/services/fufireDataService.ts` (replace lines 116-140; call the new builders),
  `server/tests/fufireRequestBuilders.test.ts` (new), `server/tests/birthInputNormalizer.test.ts` (new).
- **Tests that gate it (TDD red first):**
  - `unit`: chronometry body equals `{birth:{calendar_policy,datetime:<ISO>,location:{lat,lon},timezone}}`
    (no flat `date`/`time`) — AC-F-001a.
  - `unit`: bazi/bazi_trace body uses flat ISO `date` + allowed optionals; `bazi_trace.include_trace===true`;
    no `{year,month,day,hour}` — AC-F-001b.
  - `unit`: wuxing body flat ISO `date` with `lat`+`lon` present (required) + optional `tz`/ambiguous/nonexistent;
    no `{elements:[]}` — AC-F-001c.
  - `unit`: birth time unknown → ISO time `12:00:00`, `birth_time_known:false`, source `default_noon`,
    warning `BIRTH_TIME_UNKNOWN_DEFAULT_NOON` — AC-F-001d.
  - `unit`: missing lat/lon (no geocoder) → controlled `NO_GEOCODER_CONFIGURED`, not a guessed coordinate — AC-F-001e.
  - `unit`: bodies asserted from invoking the builder/service output (snapshot/derive), NOT a re-hardcoded literal copy — AC-F-001f.
  - `unit`: no API-key value appears in any produced `sanitizedRequestMetadata` — AC-F-001g.
- **Evidence-class:** `unit` (builders are pure; the live outbound call is faked/stubbed — no live FuFire network this run).
- **Watcher value-question:** Do contract-correct, server-built request bodies ensure FuFire is asked
  the *right* question about the customer's *real* birth data — the precondition for any non-invented
  personalization (canvas §4, core use case §6)?
- **Rollback:** revert `fufireDataService.ts` to prior builder block; new files are additive and unimported elsewhere.

### T4 — bazi + wuxing response interpreter + prompt-variable mapper
- **Goal:** Map prompt variables from the **real samples**: `animal` (locale: `de`→`pillars.year.tier`,
  `en`→`chinese.year.animal`; paired same-pillar, never mixed), `element`←`pillars.year.element`,
  `birth_year`←`transition.solar_year`, `dominant_element`←`wuxing.dominant_element`. Missing required
  source → `PROMPT_VARIABLE_SOURCE_MISSING` + render-block (no guessed substitution). Surface day-pillar
  `anchor_verification="unverified"` (never laundered to verified). Render only safe mapped variables;
  no deterministic fortune claims; no "verified truth" for interpretation. `bazi_trace`/`chronometry`
  mapping render-blocks (deferred). Guard: a `0,0`-derived wuxing `dominant_element` must never bind to a
  real person's prompt (the captured wuxing sample is a shape fixture computed at `lat/lon 0,0`).
- **REQ-IDs / AC-IDs:** REQ-F-002 (AC-F-002a/b/c/d/e/f), REQ-F-003 (AC-F-003a/b/c).
- **blockedBy:** T3 (needs builders + the real client to produce subject-correct wuxing lat/lon).
- **Files (within scope):**
  `server/services/fufireResponseInterpreter.ts` (new — path-ordered resolution, matched-path recording,
  missing→`PROMPT_VARIABLE_SOURCE_MISSING`, unverified-anchor surfacing, response sanitization),
  `server/services/promptVariableMapper.ts` (new — locale-driven `animal`, safe-var-only render, render-block),
  `server/services/fufireDataService.ts` (wire interpreter into the test-run result),
  `src/components/FuFireTestConsole.tsx` and/or `src/components/fufire/**` (surface mapped vars,
  render-block state, unverified-anchor caveat in the transfer-chain UI — claim-discipline wording),
  `server/tests/fufireResponseInterpreter.test.ts` (new, uses real samples),
  `server/tests/promptVariableMapper.test.ts` (new), `src/tests/fufire.test.ts` (extend).
- **Tests that gate it (TDD red first), against real samples:**
  - `integration-fake`: each prompt var resolved from its declared source path; matched path recorded — AC-F-002a.
  - `integration-fake`: response missing a required source → `PROMPT_VARIABLE_SOURCE_MISSING`, no guessed value — AC-F-002b/AC-F-003b.
  - `unit`: stored/sanitized response metadata contains no secret/API key — AC-F-002c.
  - `unit`: `bazi_trace`/`chronometry` mapping → `PROMPT_VARIABLE_SOURCE_MISSING` + render-block; nothing asserted verified — AC-F-002d.
  - `integration-fake`: bazi sample `anchor_verification=="unverified"` is surfaced, not laundered — AC-F-002e.
  - `integration-fake`/`unit`: wuxing must be called with the subject's REAL birth lat/lon; a `0,0`-derived
    `dominant_element` is never bound to a real person's prompt (sample is shape-fixture only) — AC-F-002f.
  - `integration-fake`: render output contains only mapped vars; no free-text invented element/animal/year — AC-F-003a.
  - `integration-fake`: no deterministic fortune/career/health/relationship claim string injected;
    text does not assert interpretation as objective truth — AC-F-003c.
  - `integration-fake`: locale `de` binds `animal`="Pferd" from `pillars.year.tier`, `en` binds "Horse"
    from `chinese.year.animal`; sources kept paired, never mixed in one render.
- **Evidence-class:** `integration-fake` (real captured samples, not a live call — honestly recorded in Reality Ledger).
- **Watcher value-question:** Does the interpreter guarantee the end customer's personalization is
  built ONLY from verified FuFirE data — blocking (not guessing) on gaps, and never claiming
  interpretation as truth — i.e. the "no invented data" core boundary (canvas §4/§6, claim-discipline §7)?
- **Rollback:** revert `fufireDataService.ts` wiring + UI edits; new interpreter/mapper files are additive.

### T5 — OpenRouter is the only default model gateway
- **Goal:** Make `OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY` the server-side-only model-gateway defaults;
  remove forced Gemini/OpenAI defaults; UI labels read "Model Gateway / OpenRouter" with per-operation
  model IDs; capability mismatch → `MODEL_CAPABILITY_MISMATCH`.
- **REQ-IDs / AC-IDs:** REQ-A-002 (AC-A-002a/b/c/d).
- **blockedBy:** T2 (sensitive-route posture for `/api/model-gateway/*` locked).
- **Files (within scope):**
  `.env.example` (OpenRouter defaults; drop required Gemini/OpenAI defaults),
  `src/lib/modelGateway/**` (new — config/types/capability check; server-side only),
  `src/lib/apiConnections/**` (gateway config wiring if present),
  relevant `src/components/**` within scope only (label text — note: model-gateway UI is in scope
  only insofar as it lives under the allowed UI paths; do not edit out-of-scope components),
  `server/tests/modelGateway.test.ts` and/or `src/tests/modelGateway.test.ts` (new).
- **Tests that gate it (TDD red first):**
  - `grep/checklist`: `.env.example`/default config use `OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY`,
    server-side only (never in the frontend bundle) — AC-A-002a.
  - `grep/checklist`: no **required** default `GEMINI_API_KEY`/`OPENAI_API_KEY`/`SECRET_REF_GEMINI_*`/`SECRET_REF_OPENAI_*` in default UI/env — AC-A-002b.
  - `unit`: UI label resolves to "Model Gateway / OpenRouter" with configurable per-operation model IDs — AC-A-002c.
  - `unit`: a model lacking a required capability → `MODEL_CAPABILITY_MISMATCH` — AC-A-002d.
- **Evidence-class:** `grep/checklist` + `unit`.
- **Watcher value-question:** Does a single OpenRouter default gateway simplify secret-management and
  align the build with the chosen architecture (canvas §4) without adding a new paid provider dependency (non-goal)?
- **Rollback:** revert `.env.example` + remove the additive `src/lib/modelGateway/**`.

### T6 — Production persistence boundary guard (block, do not fake)
- **Goal:** Production mode returns explicit `SUPABASE_NOT_CONFIGURED` before any persistence-dependent
  action; no silent localStorage/mock fallback in production paths; `DEMO_LOCAL` stays explicit and the
  only mode where mock is permitted. Pin the mode boundary at the REAL `getAppMode()` source and resolve
  the `server/index.ts:90` `CONFIG_REQUIRED` vs app-default `DEMO_LOCAL` inconsistency.
- **REQ-IDs / AC-IDs:** REQ-D-001 (AC-D-001a/b/c/d).
- **blockedBy:** T2.
- **Files (within scope):**
  `src/lib/repositories/**` (boundary/production guard ONLY — return `SUPABASE_NOT_CONFIGURED` in
  production; NO real Supabase persistence),
  `src/lib/app/appMode.ts` is the canonical source — tests pin against it; if the config snapshot
  default must change for consistency, edit `server/index.ts:90` (in scope),
  `src/tests/appMode.boundary.test.ts` (new), `src/tests/repository.boundary.test.ts` (new).
- **Tests that gate it (TDD red first):**
  - `unit`: production mode + Supabase not configured → `SUPABASE_NOT_CONFIGURED` before acting (no silent mock) — AC-D-001a.
  - `unit`/`grep`: production-mode execution paths contain no localStorage/mock-provider fallback — AC-D-001b.
  - `unit`: `DEMO_LOCAL` remains explicit and visibly labeled; only mode where mock is permitted — AC-D-001c.
  - `unit`: production-vs-`DEMO_LOCAL` distinction asserted at the REAL `getAppMode()` source (not a
    re-implemented check); exact env var/value selecting production vs `DEMO_LOCAL` is pinned; the
    `server/index.ts:90` inconsistency is resolved and bound to this test — AC-D-001d (shared with REQ-O-002 via T7).
- **Evidence-class:** `unit` (+ `grep` for fallback absence).
- **Watcher value-question:** Does an explicit production block prevent silent fake persistence —
  protecting the operator from believing data was stored when it was not (canvas §8 demo-leakage risk)?
- **Rollback:** revert the repository guard + the `server/index.ts:90` default; mode source unchanged elsewhere.

### T7 — Gelato dispatch safety + idempotency-ready
- **Goal:** Disabled/missing-contract dispatch → controlled error (`POD dispatch disabled` /
  `MISSING_POD_CONTRACT`), no outbound order. No mock success outside `DEMO_LOCAL`. Generate + log
  (sanitized) an idempotency key before any real dispatch work (even though no real dispatch happens).
- **REQ-IDs / AC-IDs:** REQ-O-002 (AC-O-002a/b/c).
- **blockedBy:** T2.
- **Files (within scope):**
  `server/services/podDispatchService.ts` (verify existing `MISSING_POD_CONTRACT`/disabled guards;
  add idempotency-key generation + sanitized logging before any real dispatch branch),
  `server/index.ts` (dispatch route already gated sensitive via T2; no posture change),
  `server/tests/podDispatch.test.ts` (new).
- **Tests that gate it (TDD red first):**
  - `unit`: dispatch disabled or `MISSING_POD_CONTRACT` → controlled error, no outbound order — AC-O-002a.
  - `unit`: non-`DEMO_LOCAL` mode without a real contract → NO mock success returned (pinned to real
    `getAppMode()` per AC-D-001d) — AC-O-002b.
  - `unit`: an idempotency key is generated and logged (sanitized — no secret/PII) before any real dispatch work — AC-O-002c.
- **Evidence-class:** `unit`.
- **Watcher value-question:** Does the dispatch boundary guarantee no fake order success can leak into a
  real customer fulfillment outside the explicit demo mode (canvas §8, non-goal: no real Gelato send)?
- **Rollback:** revert idempotency additions in `podDispatchService.ts`; existing guards untouched.

### T8 — Verification log
- **Goal:** Produce the run's verification log: green `npm run lint`, `npm run build`, `npm test`;
  negative/boundary evidence (401/403 without auth; ignored `baseUrl`/`fufirePath` payloads;
  `PROMPT_VARIABLE_SOURCE_MISSING` on missing field; no fake success outside `DEMO_LOCAL`);
  grep/checklist evidence (no forced Gemini/OpenAI defaults; OpenRouter server-side only; no
  service-role key in bundle). Reality-Ledger honesty: bazi+wuxing mapping = `integration-fake`;
  `bazi_trace`/`chronometry` mapping = deferred/render-blocked/unverified.
- **REQ-IDs / AC-IDs:** all (evidence aggregation; canvas §9 evidence items 3–5).
- **blockedBy:** T1, T2, T3, T4, T5, T6, T7 (all green).
- **Files (within scope):**
  `docs/plans/2026-06-13-sizhu-production-middleware-hardening.md` (or a verification-log doc listed in
  scope) — record commands, outputs, evidence-class per REQ, and Reality-Ledger caveats.
- **Tests that gate it:** N/A (aggregation) — but it must FAIL the run if any of the three baseline
  commands is not green or any negative/boundary evidence is missing.
- **Evidence-class:** aggregation of `real-boundary-smoke` + `integration-fake` + `unit` + `grep/checklist`.
- **Watcher value-question:** Does the verification log prove — with honest evidence-classes and no
  laundered "verified" claims — that the shipped baseline actually delivers the confirmed value and
  respects every core boundary (canvas §5/§9, claim-discipline §7)?
- **Rollback:** doc-only; revert the log file.

---

## Parallelism & sequencing summary

| Wave | Tasks | Notes |
|---|---|---|
| 1 | **T1** | FIRST, standalone, shippable (SSRF removed + Sprint-0). |
| 2 | **T2**, **T3** | Parallel after T1 (independent: auth-lock vs builders). |
| 3 | **T4** | Strictly after T3 (interpreter needs builders + subject-correct wuxing lat/lon). |
| 3 | **T5**, **T6**, **T7** | Parallel after T2. |
| 4 | **T8** | Strictly last; needs all green. |

Critical path: **T1 → T3 → T4 → T8**.

---

## Risks and rollback notes

- **R1 — REQ-A-001 weakened to "behind auth."** The proxy is already behind `apiGuard`; removing it
  must *delete the primitive*, not re-gate it. T1's AC-A-001a/b/c tests assert the body can never steer
  URL/secret. Mitigation: spy/fake the outbound boundary in tests; reject (not silently drop) config-steering fields.
- **R2 — Builder bodies hardcoded as literals.** AC-F-001f forbids re-hardcoding expected bodies; tests
  must derive from builder output. Mitigation: tester contract asserts shape from invocation, not a copied literal.
- **R3 — `0,0` wuxing sample laundered into a real prompt.** The captured wuxing sample is a shape fixture
  (`lat/lon 0,0`, `dominant_element="Holz"` is a null-point argmax). AC-F-002f guard prevents binding it to
  a real person. Mitigation: T4 test fails if a `0,0`-derived `dominant_element` reaches a subject prompt.
- **R4 — Day-pillar anchor laundered to "verified."** AC-F-002e + claim-discipline: surface
  `anchor_verification="unverified"`; QA may certify chart *calculation* (minus day anchor) but never interpretation.
- **R5 — Mode-boundary inconsistency causes silent fake success.** `server/index.ts:90` defaults to
  `CONFIG_REQUIRED` while app default is `DEMO_LOCAL`. T6 pins the real `getAppMode()` boundary and resolves it;
  T7 reuses the same pinned source. Mitigation: one canonical source, bound to a test (AC-D-001d).
- **R6 — Scope creep beyond Allowed change scope.** Any edit outside the canvas scope set fails review.
  Mitigation: each task above lists only in-scope files; model-gateway/UI edits restricted to allowed paths.
- **R7 — Deferred ops re-classified as working premises.** `bazi_trace`/`chronometry` response-mapping must
  stay render-blocked/unverified (PRD §9 DEFERRED-UNVERIFIED). Mitigation: AC-F-002d test + Reality-Ledger entry in T8.

**Global rollback:** every task is a self-contained increment on `feat/sizhu-secure-fufire-baseline`;
revert per-task by commit. T1 is independently shippable; T8 is doc-only. No task introduces a new
runtime provider dependency, so dependency rollback is not required.
