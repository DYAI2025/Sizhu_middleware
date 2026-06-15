# AGENTS.md — Sizhu Middleware (Bazzi Console)

## Essential commands

| Command | What it does | Notes |
|---|---|---|
| `npm run dev` | Single Express server + Vite HMR middleware | NOT `vite`, NOT two processes |
| `npm run build` | `vite build` (client→dist/) + `esbuild` (server→dist/server.cjs) | Two-phase |
| `npm run start` | `node dist/server.cjs` | Production |
| `npm run lint` | `tsc --noEmit` | Type-check only. No ESLint. |
| `npm run test` | `vitest run` | No vitest.config — defaults apply. |
| `npm run test:mutation` | `stryker run` | Opt-in on curated modules in `stryker.config.json` |
| `npm run mcp:stdio` | Start embedded MCP server (stdio) | Entry in `server/mcp/server.ts` |
| `npm run test:mcp` | `vitest run server/mcp/tests` | Focused MCP test run |
| `npm run smoke:fufire` | `tsx scripts/smoke/fufire-live-smoke.ts` | Real-boundary FuFire smoke test |
| `npm run probe:fufire-location` | `tsx scripts/smoke/fufire-location-probe.ts` | Adversarial location-probe |
| `npm run smoke:openrouter` | `tsx scripts/smoke/openrouter-live-smoke.ts` | Real-boundary OpenRouter smoke |

Test shortcuts:
- Single file: `npx vitest run server/tests/auth.routes.test.ts`
- By name: `npx vitest run -t "rejects admin users at aal1"`

## Repo structure

```
server/          — Express API (auth, services, MCP tools, tests)
  index.ts       — createApp() + startServer(); dotenv loaded here
  tests/         — 24 route/service test files
  mcp/           — Embedded MCP server (stdio transport, inside main process)
  mcp/tests/     — 7 MCP tool + registry tests
src/             — React 19 frontend (Vite, Tailwind v4, Motion)
  tests/         — 8 frontend tests
  lib/app/       — appMode, appServices facade, serviceFactory
  lib/workflow/  — WorkflowRunner pipeline (DI-based), state machine
  lib/repositories/  — Repository interfaces + Local* + Supabase stub
  lib/providers/ — Model gateway interfaces (FuFire, OpenRouter, mock)
  lib/domain/    — DB-mapped entity types (re-export barrel at domain/models.ts)
  types.ts       — UI/runtime types
  mockStorage.ts — LEGACY — do not import in UI
mcp-server/      — **Separate package**, standalone MCP HTTP proxy over /api
  src/           — Express + streamable HTTP transport, stateless per-request
  tsconfig.json  — Node16 resolution (not bundler), own package.json
scripts/smoke/   — Live real-boundary smoke tests (FuFire, OpenRouter)
docs/            — Deployment, security, architecture, PRD, reality tracking
```

## Two MCP servers (watch this)

**Internal (`server/mcp/`)** — embedded in main Express, stdio transport, reads config from main process env. Started via `npm run mcp:stdio`.

**Standalone (`mcp-server/`)** — separate npm package (`package.json` at `/mcp-server/`), HTTP streamable transport, proxies all tool calls to `SIZHU_BASE_URL/api`. Stateless per-request: creates a fresh client+server+transport for each POST to `/mcp`. Has its own `tsconfig.json` (Node16 resolution, not bundler).

## Single-server model (non-obvious)

`npm run dev` runs `tsx server/index.ts` — Express mounts Vite as middleware (`middlewareMode`). Dev gives HMR + real /api on single port (default 3000). Vite is never standalone.

`createApp()` is import-safe — `startServer()` guards on `process.env.VITEST !== "true"`. Tests import `createApp()` and drive it with supertest.

`dotenv.config()` is called at the top of `server/index.ts` — `.env` is loaded at the server entrypoint, not by a separate config module.

## Mode-switched data layer (key architecture)

`getAppMode()` (`src/lib/app/appMode.ts`) reads `VITE_APP_MODE` / `APP_MODE`, defaulting to `DEMO_LOCAL`. The single facade `appServices.ts` returns mode-appropriate repository/provider instances:

- **`DEMO_LOCAL`** (default): `Local*` repositories (localStorage) + `Mock*` providers. Entire pipeline runs in-browser; nothing hits Supabase or the network.
- **`CONFIG_REQUIRED`**, **`SUPABASE_READY`**, **`PRODUCTION`**: `Supabase*` repositories — currently `supabaseRepository.stub.ts` throws "Supabase integration is offline". Bringing up a real backend = implement those stubs against `repositories/interfaces.ts`.

## Security model essentials

- **Default-deny**: `app.use("/api", apiGuard)` before all routes. `/api/health` is registered *before* the guard — stays public.
- **Route classification**: `public | session | sensitive`. Default = `session` (valid token + verified email). Any new `/api/*` route gets session-level protection automatically.
- **Sensitive routes**: admin role (owner/admin/operator) + MFA (aal2). Adding a privileged endpoint = add its pattern to `SENSITIVE_API_ROUTES`.
- **Feature flags**: `AUTH_REQUIRED` and `MFA_REQUIRED_FOR_SENSITIVE_ACTIONS` — read at request time, fail closed (default `true`).
- **Token verification**: HS256 verified locally in `server/lib/jwt.ts` (no network round-trip). Uses `timingSafeEqual`. Rejects any alg ≠ HS256.
- **Key hygiene**: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` must **never** get a `VITE_` prefix — that would leak them into the browser bundle.
- **Secret-ref pattern**: Provider configs store a *reference name* (e.g. `SECRET_REF_FUFIRE_API_KEY`), code reads `process.env[ref]`. Status endpoints report `present: boolean` only, never echo the value.

## Type homes

Types funnel through `src/lib/domain/models.ts` (re-export barrel):
- `src/types.ts` — UI/runtime types (WorkflowRun, ImageArtifact, PromptTemplate, Config types, RBAC)
- `src/lib/domain/types.ts` — db-mapped entities (aliases: Product=ShopProduct, Role=AppRole)

Imports mix `@/types` and `../domain/models`. Before adding/changing a field, check which source owns it.

`@/` path alias (tsconfig.json `paths`) resolves to project root — `@/types` → `./src/types.ts`, `@/server/...` → `./server/...`.

## Testing quirks

- No vitest config — vitest uses defaults.
- Frontend tests: `src/tests/`. API tests: `server/tests/`. MCP tests: `server/mcp/tests/`.
- Auth security matrix: `server/tests/security.matrix.routes.test.ts` — asserts every route's auth classification.
- MCP-specific: `npm run test:mcp` (runs `server/mcp/tests/`). Tests pass a `SizhuClient` to tools — the client can be backed by real or mock server.
- Stryker mutation testing targets **pure** modules only: `server/lib/jwt.ts`, `server/services/fufire*.ts`, `server/services/podDispatchService.ts`, `server/services/birthInputNormalizer.ts`. Not adopted broadly — opt-in per module via `stryker.config.json:mutate`.

## Deployment

- Railway: `npm run build` → `npm run start`, binds `0.0.0.0:$PORT`.
- Readiness (`/api/readiness`) returns `503 NOT_READY` until required secrets are present — by design never green in mock mode.
- See `docs/deployment/railway.md` and `docs/security/`.

## Branch hygiene

- `config/claude/` is gitignored (local PRIL enforcement shims; resolves hooks to global install).
- `.claude/` is gitignored (local agent state, homunculus observer — never product content).
- `reports/mutation/` and `.stryker-tmp/` are gitignored (Stryker transient output).

## P rules (terse reference from CLAUDE.md)

| Rule | Summary |
|---|---|
| P1 | Wired-in-prod = grep for ≥1 non-test production importer from `createApp()` |
| P2 | Negative/safety claims ship with a guard test that goes RED if false |
| P4 | Behaviour-change proof: revert guard, test goes RED, restore, document |
| P5 | Scope pre-declares artifact classes AND build files, never wildcard |
| P6 | Secret-ref indirection asymmetries (FuFire indirect, OpenRouter direct) — readiness test catches mis-wiring |
| P7 | Mock-only path = real-boundary smoke, not code rewrite. Adversarial verification required |
| P8 | Never trust agent self-report — verify with `git status` / Stryker / importer grep |
| P9 | Safety guarantee verified at the ENFORCING component, not assumed |

## MCP dispatch payment path — KNOWN GAP

`pod_dispatch` is OFF by default (`MCP_ENABLE_DISPATCH=true` to enable). The backend dispatch route does NOT enforce `assertDispatchAllowed` server-side — an agent could craft a fabricated artifact and get through. Do not use against real money without a server-side approval gate.
