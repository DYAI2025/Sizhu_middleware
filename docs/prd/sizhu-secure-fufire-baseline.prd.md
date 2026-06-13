# PRD: sizhu-secure-fufire-baseline

Status: confirmed
Confirmed by user: yes
Confirmation date: 2026-06-13
Owner: requirements-analyst
Canvas: docs/canvas/sizhu-secure-fufire-baseline.canvas.md
Product Vision: docs/vision/sizhu-secure-fufire-baseline.vision.md (planned, by product-owner)
Traceability: docs/traceability.md
Branch: feat/sizhu-secure-fufire-baseline
Source REQ-IDs: originating analysis = user-provided sprint plan (input `sizhu_iterative_sprint_plan_and_goal.md`, NOT stored in repo). This PRD SUPERSEDES it (per §2 "contract wins"). The authoritative Phase-1 plan will be written by the planner to `docs/plans/2026-06-13-sizhu-secure-fufire-baseline.md`. (Audit note N3: do not treat "the sprint plan said X" as authority where it conflicts with the contract.)
Request contract (authoritative): docs/contracts/fufire-api-reference.md
Real response samples (bazi + wuxing): docs/contracts/fufire-samples/{bazi,wuxing}.response.json

> This PRD is downstream of the **user-confirmed Product Canvas** (canvas `Status:
> user-confirmed`, confirmed 2026-06-13, v2 incl. evidence update). The canvas is the
> value baseline; where this PRD and the canvas could diverge, the canvas wins. This PRD
> may not be finalized (Status flipped to `confirmed`) until both the PRD and the Product
> Vision are explicitly confirmed by the user.

---

## 1. Goal

Build a secure, testable Sizhu middleware **baseline** that:

1. removes the body-controlled FuFire proxy primitive (SSRF / config-bypass),
2. sends FuFire requests through **server-side contract builders** that match the
   authoritative request contract,
3. maps **verified** FuFire response data into prompt variables **for bazi + wuxing only**
   (real samples exist), blocking on missing fields,
4. uses OpenRouter as the only default model gateway,
5. keeps production persistence and Gelato dispatch **explicitly blocked** (no silent
   mock/localStorage fallback, no fake dispatch success outside `DEMO_LOCAL`),

so SizhuAtelier has a trustworthy path from Etsy order data to validated BaZi/Wu-Xing
personalization **without fake data and without arbitrary/public backend access**.

**Claim-discipline (binds acceptance + NFR wording, from canvas §4/§7):**
The deterministic **chart calculation** (chronometry → four pillars / wu xing) may be
certified "correct / not invented / verifiable." The FuFirE **interpretation/meaning** may
**never** be certified as "verified truth." Correct phrasing: *"astronomically accurate
chart calculation; interpretation by FuFirE."* QA gates may only mark *calculation*
correctness as verified, never the interpretation. Additionally, the bazi day-pillar anchor
is engine-flagged `unverified` (see `derivation_trace.day.day_anchor_evidence.anchor_verification`
and `provenance_ids.day_anchor_id = "...jdn_2419451_unverified"` in the real sample) — so even
the "verifiable chart math" claim holds for year/month/time resolution but NOT for the day
pillar, which must be surfaced as provider-declared unverified.

### In scope (this run) — mirrors canvas
REQ-S-001, REQ-S-002, REQ-F-001, REQ-F-002 (bazi + wuxing), REQ-F-003 (bazi + wuxing),
REQ-A-001, REQ-A-002, REQ-D-001, REQ-O-001, REQ-O-002.
UI in scope: `src/components/auth/**` (login / account-security views) and
`src/components/FuFireTestConsole.tsx` (+ `src/components/fufire/**`) transfer-chain UI.

### Partly deferred (in this run, but render-blocked / unverified)
REQ-F-002 / REQ-F-003 **response-mapping for `bazi_trace` and `chronometry/resolve`** —
no real response samples exist. Request *builders* for those operations are in scope
(REQ-F-001); response *mapping* for them must mark a missing prompt variable
`PROMPT_VARIABLE_SOURCE_MISSING` and render-block. They stay `unverified` in the Reality
Ledger until real samples exist.

### Out of scope (deferred north-star) — mirrors canvas §7
- No Etsy webhook automation.
- No real Gelato order/draft creation (Gelato stays `MISSING_POD_CONTRACT`-blocked).
- No autonomous prompt-learning writeback without human review.
- No new paid provider dependency beyond Supabase/FuFire/OpenRouter/Gelato.
- No real Supabase production persistence (Sprint 6 deferred) — but production mode must
  not silently fall back to mock/localStorage.
- No QG2 print-readiness / Gelato adapter implementation (Sprint 7 deferred).
- **Permanent constraint (not just a non-goal):** no inventing of BaZi/Wu-Xing/zodiac/
  element/birth data; no "verified truth" claim for FuFirE interpretation.

---

## 2. Requirements with acceptance criteria (Given/When/Then)

Each REQ has a machine-checkable acceptance criterion. Where the sprint plan's wording
conflicts with the authoritative request contract, the **contract wins** and the
correction is noted inline.

### REQ-S-001 — Protect all admin/provider APIs server-side
Already largely satisfied by `apiGuard` (default-deny on `/api/*`). This run **verifies**
and locks it with tests against the production composition root.

- **AC-S-001a — public health stays open.**
  Given a running app built via `createApp()` and no `Authorization` header,
  When `GET /api/health`,
  Then HTTP 200 and `{ status: "ok" }`.
- **AC-S-001b — default-deny on unlisted routes.**
  Given `AUTH_REQUIRED=true` and no token,
  When any `/api/*` request other than the public allowlist (`GET /api/health`),
  Then HTTP 401 with `error_code: "AUTH_REQUIRED"`.
- **AC-S-001c — sensitive route denied without auth.**
  Given no token,
  When `POST /api/data-requests/fufire/test-run`,
  Then HTTP 401 `AUTH_REQUIRED` (and `POST /api/fulfillment/pod/dispatch`,
  `POST /api/secret-references/check` likewise).

### REQ-S-002 — Email-verified admin role + MFA/AAL2 for sensitive actions
Owner/admin role model only (canvas §2 decision); `checkAdminRole` accepts
`owner | admin | operator`.

- **AC-S-002a — invalid/unverified.**
  Given a token that fails verification, Then HTTP 401 `INVALID_AUTH_TOKEN`. Given a valid
  token whose `emailVerified=false`, When a sensitive route, Then HTTP 403
  `EMAIL_VERIFICATION_REQUIRED`.
- **AC-S-002b — role gate.**
  Given a valid, email-verified session whose `role` is none of `owner|admin|operator`,
  When `POST /api/data-requests/fufire/test-run`, Then HTTP 403 `ADMIN_ROLE_REQUIRED`.
- **AC-S-002c — MFA/AAL2 gate.**
  Given `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true` and an admin-role session at `aal1`,
  When a sensitive route, Then HTTP 403 `MFA_REQUIRED_FOR_ACTION`. Given the same with
  `aal2`, Then the request passes the guard.
- **AC-S-002d — UI exposes no service-role key.**
  Given the built frontend bundle, When grepped, Then no Supabase service-role key /
  `SUPABASE_SERVICE_ROLE` value is present (only refs).

### REQ-F-001 — Build FuFire request bodies from normalized birth input (server-side)
Builders for **chronometry/resolve, bazi, bazi_trace, wuxing** against
`docs/contracts/fufire-api-reference.md`. Current code (`server/services/fufireDataService.ts:116-140`)
is wrong and must be replaced.

> **Contract corrections vs. sprint-plan wording (use the CONTRACT):**
> - The plan's Sprint-2 row implied separate `date` + `time`. The contract uses a **single
>   ISO datetime `date`** string (e.g. `"1990-06-15T14:30:00"`). Combine birth date + time
>   into one ISO string.
> - The plan said chronometry uses nested `birth.*` and the others flat — the contract
>   **confirms** this: only `POST /v1/chronometry/resolve` is nested; bazi / bazi_trace /
>   wuxing are flat.
> - `wuxing` requires `lat` and `lon` (contract §wuxing). bazi/bazi_trace `lat`/`lon` are
>   optional per contract.

- **AC-F-001a — chronometry (nested).**
  Given normalized input, When the chronometry builder runs, Then the body equals
  `{ birth: { calendar_policy, datetime: <ISO>, location: { lat, lon }, timezone } }`
  (no flat `date`/`time`).
- **AC-F-001b — bazi / bazi_trace (flat).**
  Then the body uses flat `date` (ISO), and the allowed optional fields `tz, lon, lat,
  standard ("CIVIL"|"LMT"|"TLST"), boundary ("midnight"|"zi"), ambiguousTime
  ("earlier"|"later"), nonexistentTime ("error"|"shift_forward"), birth_time_known,
  include_trace`. bazi_trace sets `include_trace: true`. No `{year,month,day,hour}`.
- **AC-F-001c — wuxing (flat, lat/lon required).**
  Then the body uses flat `date` (ISO), `lat` and `lon` present (required), plus optional
  `tz, ambiguousTime, nonexistentTime`. No `{elements:[]}`.
- **AC-F-001d — default-noon rule.**
  Given birth time unknown, Then the ISO `date` time component is `12:00:00`,
  `birth_time_known: false`, and the run records source `default_noon`
  (warning `BIRTH_TIME_UNKNOWN_DEFAULT_NOON`).
- **AC-F-001e — missing geo / tz.**
  Given missing lat/lon (and no geocoder), Then the run returns a controlled
  `NO_GEOCODER_CONFIGURED` (or equivalent) gateway issue, not a guessed coordinate.
- **AC-F-001f — bodies asserted from service output, not literals.**
  Tests build bodies by invoking the builder/service and snapshot/assert the output; they
  do not re-hardcode the expected body as a literal copy.
- **AC-F-001g — no secret in metadata.**
  Then no API key value appears in any `sanitizedRequestMetadata` / logged request.

### REQ-F-002 — Interpret FuFire responses without guessing (bazi + wuxing)
Verifiable against the real samples `bazi.response.json` and `wuxing.response.json`.

- **AC-F-002a — known mapping paths tried in order; matched path recorded.**
  Given a real bazi response, When interpreted, Then each prompt variable is resolved from
  its declared source path and the matched path is recorded.
- **AC-F-002b — missing required field blocks.**
  Given a response missing a required prompt-variable source, Then the interpreter returns
  `PROMPT_VARIABLE_SOURCE_MISSING` and does NOT substitute a guessed value.
- **AC-F-002c — raw response sanitized/stored without secrets.**
  Then stored/sanitized response metadata contains no secret and no API key.
- **AC-F-002d — deferred operations render-block.**
  Given `bazi_trace` or `chronometry/resolve` (no real samples), When response mapping is
  attempted, Then any required prompt variable sourced from them yields
  `PROMPT_VARIABLE_SOURCE_MISSING` + render-block; no mapping is asserted as verified.
- **AC-F-002e — day-pillar anchor caveat surfaced.**
  Given a bazi response whose `derivation_trace.day.day_anchor_evidence.anchor_verification
  == "unverified"`, Then that unverified status is surfaced (not laundered into "verified").
- **AC-F-002f — wuxing called with the real birth lat/lon (audit note N4).**
  Given a wuxing request for a subject, Then it is sent with that subject's REAL birth `lat`/`lon`
  (never `0,0`). The captured `docs/contracts/fufire-samples/wuxing.response.json` was computed at
  `lat/lon 0,0` and is a **shape fixture only** — its `dominant_element` ("Holz", a western-vector
  argmax at the null point) MUST NOT be snapshotted/asserted as the Berlin-born bazi subject's
  real dominant element. A test must guard that a 0,0-derived `dominant_element` is never bound to
  a real person's prompt. (True-Line: "no invented data" — a value computed for the wrong location
  is invented data.)

### REQ-F-003 — Render prompt templates from safe prompt variables only (bazi + wuxing)
**Real prompt-variable source map (from `fufire-api-reference.md` §Response shapes, real data):**
- `animal` ← **locale-driven (RESOLVED, user 2026-06-13):** `de` → `bazi.pillars.year.tier`
  (`"Pferd"`); `en` → `bazi.chinese.year.animal` (`"Horse"`). Both are mapped; the active
  locale selects one. The two sources must be kept paired (same pillar), never mixed within
  one render.
- `element` ← `bazi.pillars.year.element` (year-pillar element, e.g. `"Metall"`).
- `birth_year` ← `bazi.transition.solar_year` (e.g. `1990`).
- `dominant_element` ← `wuxing.dominant_element` (e.g. `"Holz"` — western-vector argmax).

> Convention note (RESOLVED): `animal` is **locale-driven** — `de`→`pillars.year.tier`,
> `en`→`chinese.year.animal`; map both, select by locale, never mix within one render.
> wuxing top-level `dominant_element` is the **western-vector** dominance; the fusion
> endpoint (out of scope) separately reports the **eastern/bazi** dominance — the single
> provider-canonical value used this run is `wuxing.dominant_element`.

- **AC-F-003a — only safe mapped variables rendered.**
  Given resolved prompt variables, When the template renders, Then the output contains only
  mapped variables; no free-text invented element/animal/year.
- **AC-F-003b — missing var blocks render.**
  Given a required template variable with no resolved source, Then render is blocked with
  `PROMPT_VARIABLE_SOURCE_MISSING`.
- **AC-F-003c — no deterministic fortune claims.**
  Then no deterministic fortune/career/health/relationship claim string is injected; the
  rendered text does not assert FuFirE interpretation as objective truth.

### REQ-A-001 — Remove arbitrary client-controlled FuFire proxy (SSRF / config-bypass)
**Framing (canvas §8 risk):** the fix is to **REMOVE the body-controlled URL/secret
primitive**, NOT to "put it behind auth." `POST /api/fufire/*`
(`server/index.ts:196-262`) reads `fuFireConfig.baseUrl`, `fuFireConfig.apiKeySecretRef`
and `fufirePath` from `req.body` and fetches that arbitrary URL with the FuFire secret.
Being behind `apiGuard` (server/index.ts:59) does NOT remove the primitive — any
authenticated caller can still steer the server's outbound request and which env secret it
reads.

- **AC-A-001a — generic proxy removed.**
  Given the app, When `POST /api/fufire/<anything>`, Then it no longer reaches any
  arbitrary-URL fetch handler (route removed/disabled; returns the default-deny / not-found
  behavior, not an outbound fetch).
- **AC-A-001b — body cannot steer URL/secret.**
  Given the operation-only endpoint, When a request includes `fuFireConfig`, `fufirePath`,
  `baseUrl`, or `apiKeySecretRef` in the body, Then those fields are **ignored/rejected**
  and never influence the outbound URL, header, or which secret env var is read.
- **AC-A-001c — server owns config.**
  Then base URL, auth header name, and secret are resolved exclusively from server config /
  env (e.g. `FUFIRE_BASE_URL`, `FUFIRE_API_KEY` / `FUFIRE_API_KEY_SECRET_REF`).
- **AC-A-001d — unknown operation controlled.**
  Given the operation-only endpoint and an unknown `operation`, Then HTTP error with
  `FUFIRE_OPERATION_NOT_ALLOWED`.
- **AC-A-001e — stale classification cleaned.**
  When `/api/fufire/*` is removed, Then the now-dead `SENSITIVE_API_ROUTES` entry
  `/^\/fufire(\/.*)?$/` in `server/middleware/auth.ts` is removed or repointed so the
  classification table has no dangling sensitive route. (ADR-eligible implementation detail
  — but it must not weaken the default-deny posture.)

### REQ-A-002 — OpenRouter is the only default model gateway
- **AC-A-002a — default env.**
  Given `.env.example` / default config, Then `OPENROUTER_BASE_URL` and
  `OPENROUTER_API_KEY` are the model-gateway defaults and are server-side only.
- **AC-A-002b — no forced Gemini/OpenAI defaults.**
  Then a grep/checklist test confirms no **required** default `GEMINI_API_KEY`,
  `OPENAI_API_KEY`, `SECRET_REF_GEMINI_*`, `SECRET_REF_OPENAI_*` in default UI/env.
- **AC-A-002c — UI labels.**
  Then UI labels read "Model Gateway / OpenRouter" with configurable per-operation model
  IDs.
- **AC-A-002d — capability mismatch.**
  Given a model lacking a required capability, Then `MODEL_CAPABILITY_MISMATCH` is returned.

### REQ-D-001 — Supabase is the production persistence boundary (block, do not fake)
No real persistence this run (canvas §3 decision). Production mode must **not** silently
fall back to mock/localStorage.

- **AC-D-001a — production-mode explicit block.**
  Given production mode and Supabase not configured, When a persistence-dependent action,
  Then it returns explicit `SUPABASE_NOT_CONFIGURED` before acting (no silent mock).
- **AC-D-001b — no silent localStorage in production paths.**
  Then production-mode execution paths contain no localStorage/mock-provider fallback.
- **AC-D-001c — demo mode explicit.**
  Then `DEMO_LOCAL` remains explicit and visibly labeled; it is the only mode where mock is
  permitted.
- **AC-D-001d — mode boundary pinned at the real source (audit note N5).**
  Tests assert the production-vs-`DEMO_LOCAL` distinction at the REAL `getAppMode()` source
  (`src/lib/app/appMode.ts`), not a re-implemented mode check, and pin exactly which env var/value
  selects production vs `DEMO_LOCAL`. Resolve the current inconsistency: `server/index.ts:90`
  defaults `appMode` to `CONFIG_REQUIRED` while the app default is `DEMO_LOCAL` (commit 4980ee9).
  This same source backs the no-fake-success gate (AC-O-002b) — bind it to a test, do not leave it
  prose. (Shared by REQ-D-001 + REQ-O-002.)

### REQ-O-001 — Keep health public + readiness truthful
- **AC-O-001a — health public + always 200 while alive.**
  Given the process is alive, When `GET /api/health` (no auth), Then HTTP 200.
- **AC-O-001b — readiness truthful.**
  Given a required env var (e.g. `FUFIRE_BASE_URL`, `SUPABASE_URL`, secret refs) missing,
  When `GET /api/readiness`, Then HTTP 503 `{ status: "NOT_READY", missing: [...] }`;
  readiness never returns READY merely because mock mode works.
- **AC-O-001c — static not behind CORS / no unhandled 500 on unknown origin.**
  (Sprint 0 stabilization, folded into the SSRF/boundary task.) Static assets are not
  gated by CORS middleware; an unknown API origin never produces an unhandled 500.

### REQ-O-002 — Gelato dispatch safe, explicit, idempotency-ready
- **AC-O-002a — disabled / missing contract.**
  Given POD dispatch disabled or `MISSING_POD_CONTRACT`, When dispatch is attempted, Then a
  controlled error (`POD dispatch disabled` / `MISSING_POD_CONTRACT`); no outbound order.
- **AC-O-002b — no fake success outside DEMO_LOCAL.**
  Given a non-`DEMO_LOCAL` mode, When dispatch is attempted without a real contract, Then
  no mock success is returned.
- **AC-O-002c — idempotency-ready.**
  Then an idempotency key is generated and logged (sanitized) before any real dispatch work
  — even though no real dispatch happens this run.

---

## 3. Data model / types touched

### 3.1 FuFire request shapes (authoritative — `fufire-api-reference.md`)
```
ChronometryResolveRequest = {            // POST /v1/chronometry/resolve  (ONLY nested)
  birth: {
    calendar_policy: string,             // e.g. "gregorian"
    datetime: string,                    // ISO datetime
    location: { lat: number, lon: number },
    timezone: string,                    // IANA tz, e.g. "Europe/Berlin"
  }
}

BaziRequest = {                          // POST /v1/calculate/bazi (flat)
  date: string,                          // ISO datetime (REQUIRED)
  tz?: string, lon?: number, lat?: number,
  standard?: "CIVIL" | "LMT" | "TLST",
  boundary?: "midnight" | "zi",
  ambiguousTime?: "earlier" | "later",
  nonexistentTime?: "error" | "shift_forward",
  birth_time_known?: boolean,
  include_trace?: boolean,
}
BaziTraceRequest = BaziRequest           // POST /v1/calculate/bazi/trace, include_trace:true

WuxingRequest = {                        // POST /v1/calculate/wuxing (flat)
  date: string,                          // ISO datetime (REQUIRED)
  lon: number,                           // REQUIRED
  lat: number,                           // REQUIRED
  tz?: string,
  ambiguousTime?: "earlier" | "later",
  nonexistentTime?: "error" | "shift_forward",
}
```

### 3.2 FuFire response shapes (real samples — bazi + wuxing only)
```
BaziResponse (sample fufire-samples/bazi.response.json):
  input, pillars.{year|month|day|hour}.{stamm,zweig,tier,element},
  chinese.year.{stem,branch,animal}, chinese.{month_master,day_master,hour_master},
  dates, transition.solar_year, solar_terms_count, provenance, precision,
  derivation_trace.day.day_anchor_evidence.anchor_verification  // ← "unverified" caveat

WuxingResponse (sample fufire-samples/wuxing.response.json):
  input, wu_xing_vector.{Holz,Feuer,Erde,Metall,Wasser},
  dominant_element: string,              // western-vector argmax
  equation_of_time, true_solar_time, contribution_ledger.western[], provenance
```
`bazi_trace` and `chronometry/resolve` response shapes are **NOT** modeled as verified (no
samples) — mapping for them render-blocks.

### 3.3 Prompt variables (REQ-F-003 source map — real)
```
animal           ← locale: de→bazi.pillars.year.tier ("Pferd") | en→bazi.chinese.year.animal ("Horse")
element          ← bazi.pillars.year.element
birth_year       ← bazi.transition.solar_year
dominant_element ← wuxing.dominant_element        // western-vector dominance (provider-canonical)
missing required var → PROMPT_VARIABLE_SOURCE_MISSING + render-block
```

### 3.4 Operation-only endpoint contract (replaces the SSRF proxy)
```
POST /api/data-requests/fufire/test-run
  body (client-supplied, allowed):
    { operation | requestedOperations: ("chronometry"|"bazi"|"baziTrace"|"wuxing")[],
      input: <normalized birth input>, options?: {...} }
  body fields IGNORED/REJECTED (must not steer execution):
    fuFireConfig, fufirePath, baseUrl, apiKeySecretRef, authHeaderName
  server-resolved (never from body): baseUrl, path, auth header name, secret
  errors: FUFIRE_OPERATION_NOT_ALLOWED, NO_GEOCODER_CONFIGURED, NO_FUFIRE_API_KEY_CONFIGURED,
          NO_FUFIRE_BASE_URL_CONFIGURED, FUFIRE_*_FAILED, FUFIRE_TIMEOUT
(Optional) POST /api/data-requests/fufire/operations/:operation — same server-owned config.
```

---

## 4. Architecture constraints

- **Single Express server.** All routes live on the `createApp()` factory in
  `server/index.ts`; tests import `createApp` directly (production composition root).
- **Server-owned FuFire config.** baseUrl / path / auth-header / secret resolution are
  server-side only. The client sends only `operation`/`input`/`options`. No body field may
  influence the outbound URL or which secret env var is read. (REQ-A-001)
- **OpenRouter is server-side only.** `OPENROUTER_BASE_URL` / `OPENROUTER_API_KEY` never
  reach the frontend bundle. (REQ-A-002)
- **Production-mode persistence boundary.** Production mode returns
  `SUPABASE_NOT_CONFIGURED` rather than silently using mock/localStorage; no real Supabase
  persistence implemented this run. (REQ-D-001)
- **Default-deny preserved.** `apiGuard` stays the single gate; new routes are protected by
  default. Public allowlist is `GET /api/health` (and static `/`, `/assets/*` served
  outside the API). Removing `/api/fufire/*` must not open any route.
- **Allowed change scope (canvas §"Allowed change scope") — agents may only edit:**
  `server/index.ts`, `server/middleware/**`, `server/routes/**`, `server/contracts/**`,
  `server/services/**`, `server/tests/**`, `src/lib/auth/**`, `src/lib/apiConnections/**`,
  `src/lib/modelGateway/**`, `src/lib/repositories/**` (boundary/production guard ONLY),
  `src/components/auth/**`, `src/components/FuFireTestConsole.tsx` (+ `src/components/fufire/**`),
  `src/tests/**`, `tests/**`, the listed docs, `.env.example`, `package.json` (test/dev
  scripts only — no new runtime provider dependency).

---

## 5. Non-functional requirements (NFRs)

### Security
- **No secrets in frontend, logs, prompt variables, or test fixtures.** API key values
  never appear in `sanitizedRequestMetadata`, responses, prompt variables, or committed
  fixtures. Fixtures are PII-free.
- **SSRF removed (not re-authed).** No code path lets a request body determine the outbound
  URL or the secret env var read. (REQ-A-001)
- **CORS deterministic.** Allowed origins from `ALLOWED_ORIGINS`; in production an
  unallowed origin is rejected without an unhandled 500; static assets are not behind CORS.
- **Secret refs only.** `/api/secret-references/*` reports presence, never values.

### Reliability
- **Timeouts / abort already present** (`AbortController` + `setTimeout`) — preserve in the
  new operation-only path; FuFire timeout → `FUFIRE_TIMEOUT` (504-class controlled error).
- **No fake success.** No mock dispatch/persistence success outside `DEMO_LOCAL`.

### Observability
- **Sanitized gateway issues.** Gateway issues carry sanitized request/response metadata
  (no secrets, no PII) with stable `errorCode`s.
- **Readiness truthful.** `/api/readiness` reflects real env/config, never READY on mock.
- **Idempotency key logged (sanitized)** before any real dispatch work (REQ-O-002).

### Claim-discipline (NFR — binds wording in UI/logs/reports/QA)
- Only **chart calculation** correctness may be labeled "verified" — and even then NOT the
  day-pillar anchor (engine-flagged `unverified`). FuFirE **interpretation** is never
  labeled "verified truth." Violation in any UI text, log, report, or QA-gate statement is
  a defect.

### Test / coverage expectations
- Baseline that MUST stay green: `npm run lint` (`tsc --noEmit`), `npm run build`,
  `npm test` (vitest). A verification log must record all three passing (canvas §9).
- `npm run test:api` / `npm run test:e2e` **do not exist yet** — ASSUMPTION: they may be
  added if/when the corresponding tests are implemented; until then they are not a gate.
- Production-composition-root tests: supertest against `createApp()` for REQ-S-001/002,
  REQ-A-001, REQ-O-001 (reach `real-boundary-smoke`). FuFire response mapping
  (bazi + wuxing) is tested against the **real captured samples** — `integration-fake`
  (real sample data, not a live call); this is the best achievable this run without live
  network and must be stated honestly in the Reality Ledger.

---

## 6. Security matrix (per sensitive route → required auth class)

Mapped to the existing `classifyApiRoute` / `apiGuard` classification in
`server/middleware/auth.ts`. Auth classes: `session` (valid token + verified email),
`admin-role` (`owner|admin|operator`), `aal2` (verified second factor when
`MFA_REQUIRED_FOR_SENSITIVE_ACTIONS=true`).

| Route | Method | Class | Required | Notes |
|---|---|---|---|---|
| `/api/health` | GET | public | none | always 200 while alive (REQ-O-001) |
| `/api/readiness` | GET | session | session | truthful 503/200 (REQ-O-001) |
| `/api/config/*` | GET | session | session | read snapshot, refs only |
| `/api/config/*` | POST | sensitive | session + admin-role + aal2 | config write |
| `/api/secret-references/status` | GET | session | session | presence only |
| `/api/secret-references/check` | POST | sensitive | session + admin-role + aal2 | presence only, never values |
| `/api/gateway-issues` | GET | session | session | sanitized |
| `/api/workflows/*` | GET | session | session | |
| `/api/data-requests/fufire/test-run` | POST | sensitive | session + admin-role + aal2 | REQ-S-001/002, REQ-A-001 |
| `/api/data-requests/fufire/operations/:operation` | POST | sensitive | session + admin-role + aal2 | optional; same server-owned config |
| `/api/fulfillment/readiness` | GET | session | session | protected read (no escalation) |
| `/api/fulfillment/pod/validate-dispatch` | POST | **sensitive** | session + admin-role + aal2 | RESOLVED (user 2026-06-13): add to SENSITIVE_API_ROUTES + test |
| `/api/fulfillment/pod/dispatch` | POST | sensitive | session + admin-role + aal2 | REQ-O-002 |
| `/api/fufire/*` | POST | **REMOVED** | n/a | REQ-A-001; drop dead classifier entry |
| `/api/model-gateway/*` | POST | sensitive | session + admin-role + aal2 | REQ-A-002 |
| any other `/api/*` | any | session | session | default-deny |

> Security-matrix finding (RESOLVED, user 2026-06-13): `POST /api/fulfillment/pod/validate-dispatch`
> exists in `server/index.ts` but is NOT in `SENSITIVE_API_ROUTES` → currently `session` only.
> **Decision: make it `sensitive`** (admin-role + aal2), consistent with `dispatch`. Implementation:
> add `{ method: "POST", pattern: /^\/fulfillment\/pod\/validate-dispatch\/?$/ }` to
> `SENSITIVE_API_ROUTES` + a supertest asserting 401/403/aal2 behavior. Folded into T2 + T7.

---

## 7. Atomic task breakdown (dependency-ordered)

Sequencing follows council guidance: **SSRF removal FIRST and standalone** (shippable
increment), Sprint-0 stabilization folded into it; then request builders; then bazi+wuxing
response mapping; then OpenRouter. Each task is TDD (failing test first).

- **T0 — Sprint 0 stabilization, folded into T1.** Confirm `/api/health` public+200,
  static not behind CORS, unknown origin no unhandled 500; document/resolve the build-time
  `import.meta` CJS warning. (REQ-O-001) — *no standalone task; merged into T1.*
- **T1 — Remove the arbitrary FuFire proxy; add operation-only endpoint (SSRF fix).**
  Depends on: none (FIRST). Remove `POST /api/fufire/*` (server/index.ts:196-262); server
  resolves baseUrl/path/header/secret; ignore/reject `fuFireConfig`/`fufirePath`/`baseUrl`/
  `apiKeySecretRef`; unknown operation → `FUFIRE_OPERATION_NOT_ALLOWED`; remove the dead
  `/^\/fufire(\/.*)?$/` classifier entry. Add supertest against `createApp()`. Includes T0.
  (REQ-A-001, REQ-O-001) — **standalone shippable increment.**
- **T2 — Verify + lock auth/role/MFA gate.** Depends on: T1. Supertest + JWT/AAL fixtures
  for AC-S-001b/c, AC-S-002a-d against `createApp()`; confirm UI bundle has no service-role
  key. Resolve the validate-dispatch classification OPEN QUESTION before locking.
  (REQ-S-001, REQ-S-002)
- **T3 — FuFire request builders against the contract.** Depends on: T1. Replace wrong
  bodies in `server/services/fufireDataService.ts` (+ new
  `server/contracts/fufireContract.ts`, `server/services/birthInputNormalizer.ts`,
  `fufireRequestBuilders.ts`, `fufireClient.ts`). Build chronometry (nested), bazi/bazi_trace
  (flat), wuxing (flat, lat/lon required); default-noon; geo-missing → `NO_GEOCODER_CONFIGURED`;
  bodies asserted from service output; no secret in metadata. (REQ-F-001)
- **T4 — bazi + wuxing response interpreter + prompt-var mapper.** Depends on: T3. Map
  `animal/element/birth_year/dominant_element` from the real samples; missing →
  `PROMPT_VARIABLE_SOURCE_MISSING` + render-block; surface day-pillar `unverified`;
  render only safe vars; `bazi_trace`/`chronometry` mapping render-blocks (deferred).
  Tests use the real captured samples (`integration-fake`). (REQ-F-002, REQ-F-003)
- **T5 — OpenRouter default gateway cleanup.** Depends on: T2. `.env.example` +
  config/types/UI → OpenRouter defaults (server-side); remove forced Gemini/OpenAI defaults
  (grep test); `MODEL_CAPABILITY_MISMATCH`. (REQ-A-002)
- **T6 — Production persistence boundary guard.** Depends on: T2. Production mode returns
  `SUPABASE_NOT_CONFIGURED`; no silent localStorage/mock in production paths; `DEMO_LOCAL`
  explicit. No real persistence. (REQ-D-001)
- **T7 — Gelato dispatch safety + idempotency-ready.** Depends on: T2. Disabled/missing
  contract → controlled error; no fake success outside `DEMO_LOCAL`; idempotency key
  generated + sanitized-logged before any real dispatch. (REQ-O-002)
- **T8 — Verification log.** Depends on: all. Record green `npm run lint`, `npm run build`,
  `npm test`; negative/boundary evidence; grep/checklist evidence. (canvas §9)

---

## 8. Definition of Ready (Phase 0)

- [x] Product Canvas user-confirmed (v2, 2026-06-13).
- [x] Every in-scope REQ has a machine-checkable Given/When/Then acceptance criterion.
- [x] Request contract is `belegt` (authoritative doc read); bazi + wuxing response shapes
      `belegt` (real samples read).
- [x] Traceability matrix built (`docs/traceability.md`).
- [ ] Product Vision created + confirmed by `product-owner` (next handoff).
- [ ] User confirms this PRD (flip `Status` to `confirmed`, `Confirmed by user: yes`).
- [x] Product-critical open questions in §9 triaged with the user (animal convention +
      validate-dispatch classification resolved 2026-06-13). Remaining items are deployment
      MISSING (non-blocking for code) + carried ASSUMPTIONs.

> Phase 0 is **not** complete until BOTH this PRD and the Product Vision are confirmed by
> the user.

---

## 9. MISSING / OPEN QUESTION / ASSUMPTION / BLOCKER

These are **not** closed by the analyst. They go to the user (brainstorming) and to the
`product-owner` Vision gate.

- **RESOLVED (user 2026-06-13) — animal convention.** `animal` is **locale-driven**:
  `de`→`bazi.pillars.year.tier` ("Pferd"), `en`→`bazi.chinese.year.animal` ("Horse"); both
  mapped, locale selects, never mixed. (REQ-F-003, §3.3.)
- **RESOLVED (user 2026-06-13) — `validate-dispatch` classification.** Make
  `POST /api/fulfillment/pod/validate-dispatch` **`sensitive`** (admin-role + aal2); add to
  `SENSITIVE_API_ROUTES` + test (folded into T2/T7). (§6.)
- **RESOLVED (canvas §5) — outcome success signal.** Technical gate criteria are the only
  success measure for this run; a product-outcome metric is deliberately deferred to a
  follow-up run.
- **ASSUMPTION (test tooling) — `test:api` / `test:e2e`.** These npm scripts do not exist.
  Assumed they may be added only when those tests are implemented; until then only
  `lint`/`build`/`test` are gates. Needs user confirmation if added to `package.json`.
- **ASSUMPTION (auth provider).** Supabase Auth is the authentication provider (sprint-plan
  assumption). Carried forward, not independently re-verified this run.
- **MISSING (deployment/runtime, non-blocking for code scope).** Exact Railway env values;
  Supabase first-owner user ID; final auth-key setup. Must be resolved before live
  operation but do not block this run's code (canvas §8).
- **DEFERRED-UNVERIFIED (Reality Ledger).** Response-mapping for `bazi_trace` and
  `chronometry/resolve` — no real samples. Stays `unverified` / render-blocked; NOT a
  working premise. Re-opens only when PII-free real samples exist.
- **No open BLOCKER for this run.** The earlier "missing FuFire response samples" blocker
  was resolved by **deferral** (bazi+wuxing un-deferred via real samples; the other two
  stay deferred), not by weakening — per canvas §8. Do not re-classify any deferred item as
  a working assumption.

---

## 10. Handoffs

- → `product-owner`: this PRD path, REQ-IDs, acceptance criteria, non-goals, the §9
  MISSING/OPEN/ASSUMPTION list, customer/user statements (canvas §2), success metrics /
  value claims (canvas §4/§5). PO creates `docs/vision/sizhu-secure-fufire-baseline.vision.md`.
- → `spec-auditor` (Phase 0.5): frozen PRD + `docs/traceability.md`.
- → `planner` / `tester`: task breakdown §7, acceptance criteria §2.
- ↔ `context-keeper`: keep `state.md`, `decision-log.md`, ADRs consistent with the matrix
  (notably the §9 OPEN QUESTIONS and the REQ-A-001e classifier cleanup as an ADR-eligible
  technical decision).
