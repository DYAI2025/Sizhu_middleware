# Fix Plan — remaining PR #4 issues (esbuild/vite advisory + cosmetic)

Status: EMPIRICALLY RESOLVED 2026-06-14 — synthesis found a working fix (override + build target).

## Empirical outcome (the synthesis, sharpened)
- Plain override C (esbuild ^0.28.1) → audit 0 vulnerabilities BUT vite 6.4.3 build FAILED with 366
  "Transforming destructuring to the configured target (chrome87/es2020...) is not supported yet"
  errors — esbuild 0.28 cannot lower destructuring to vite's old default build target. Reverted.
- **SHARPENED SYNTHESIS (works):** esbuild override ^0.28.1 + raise vite `build.target` to `es2022`
  (so esbuild 0.28 needs no destructuring lowering). Empirically verified: `npm audit` = 0
  vulnerabilities, `npm run build` exit 0 (client + server bundle produced), `npm test` 153/153,
  `npm run lint` exit 0.
- **Trade-off (the one real decision):** the client bundle now targets es2022 (modern browsers,
  ~Chrome 94+/Safari 16.4+/FF 93+) instead of the chrome87/safari14 baseline. Acceptable for an
  INTERNAL operator/admin console (confirmed target user) — surfaced to the user for explicit OK
  before commit (browser-support reduction is a genuine product axis).
- Touches `vite.config.ts` (added to Allowed change scope) + package.json/lock.


Owner: orchestrator
Branch: feat/sizhu-secure-fufire-baseline

## Goal
Clear the 2 high `npm audit` advisories (esbuild GHSA-gv7w-rqvm-qjhr + vite transitive) with the
least-breaking change that actually works, OR — if no safe fix exists — surface the honest
residual risk to the user for an explicit accept decision (escalation-asymmetry: a security
finding is never self-downgraded). Plus fold the one harmless cosmetic nit if cheap.

## Non-goals
- No vite major upgrade for its own sake (see critical review — it does NOT fix the advisory).
- No new feature work (T7/T8 remain separate).
- Not touching the broad-refactor deferrals (RequestBody rename, provider-union named types).

## Preconditions / known gaps
- Installed: vite 6.4.3, esbuild 0.25.12 (in vuln range 0.17.0–0.28.0; fix = esbuild ≥0.28.1).
- `tsx` already uses esbuild 0.28.1 (dev-only, not the issue).
- The advisory vector = esbuild's **Deno** module + malicious `NPM_CONFIG_REGISTRY` at install
  time. This is a **Node** project (no Deno usage); esbuild is **build-time only** (the deployed
  runtime is the esbuild-BUNDLED `dist/server.cjs` + node — esbuild itself is not shipped). So the
  practical exploitability here is ~nil, but the installed version is flagged high.
- Build = `vite build` (client) + `esbuild` bundle (server → dist/server.cjs). Both must keep working.

## Critical review of the naive plans (why the obvious fixes are wrong)
- **Naive A — `npm audit fix --force`:** REJECTED. No vite release depends on esbuild ≥0.28.1, so
  `--force` cannot resolve cleanly; it tends to downgrade/break the tree. High regression risk on
  the entire deploy path.
- **Alternative B — bump vite (6→7/latest):** REJECTED as a *fix*. Verified via `npm view`: every
  vite up to 7.3.x pins esbuild `^0.27.0` / `^0.25.0` — all `<0.28.0`, i.e. still in the vuln
  range. A vite major bump is breaking AND does not clear the advisory. Pure churn.
- **Alternative C — npm `overrides: { esbuild: "^0.28.1" }`:** the ONLY mechanism that forces the
  patched esbuild into vite's transitive slot + the direct dep. Risk: vite 6.4.3 expects esbuild
  `^0.25.0`; forcing 0.28.x is a 3-minor jump and esbuild minors can change the transform/build
  API vite calls. MUST be empirically verified (build + dev-middleware + full suite).
- **Alternative D — document + accept (won't-fix-now):** justified by the ~nil practical risk
  (Deno path unused, build-time only, not in the deployed runtime) + a separate dep-bump ticket
  and optional install hardening (pinned registry in CI). Honest, but leaves the audit red.

## Synthesized approach (best idea)
**Try C first, empirically gated; fall back to D with full honesty if C breaks the build.**
1. Add `overrides: { "esbuild": "^0.28.1" }` to package.json; also bump the direct `esbuild`
   devDependency spec to `^0.28.1` so the direct dep and the override agree.
2. `npm install` → re-resolve. Then EMPIRICALLY verify the whole build/deploy path still works:
   `npm run build` (vite client build + esbuild server bundle), `npm run lint`, `npm test`,
   and a dev-server smoke (`tsx server/index.ts` mounts vite middleware — at least typecheck/build
   proves the vite+esbuild integration compiles).
3. `npm audit` → confirm the 2 high are gone (0 high/critical).
4. If ALL green → ship C (real fix, minimal churn, no vite major bump).
5. If C breaks build/dev (esbuild 0.28 API incompat with vite 6.4.3) → REVERT C, switch to D:
   document the residual (low practical risk, build-time/Deno-unused/not-in-runtime) in the PR +
   a `docs/` security note + a separate ticket, and present the accept-vs-escalate decision to the
   user (only the user reclassifies a security finding).

## Tasks
### DEP1 — esbuild override + empirical build verification (the synthesized fix)
- Files: `package.json` (add `overrides`, bump direct esbuild spec), `package-lock.json` (regen).
- REQ: NFR/security (dependency hygiene); no product REQ changes.
- Tests/verify: `npm install` → `npm run build` (exit 0, client + server bundle), `npm run lint`
  (tsc exit 0), `npm test` (153/153 stay green), `npm audit` (0 high/critical).
- Acceptance evidence: `npm audit` shows 0 high; build artifacts produced; full suite green; tsc clean.
- Fallback: if build/dev breaks → revert package.json/lock, go to DEP2.

### DEP2 — (only if DEP1 fails) honest residual-risk note + user escalation
- Files: a short note in the PR body / `docs/` security section documenting the advisory, why the
  practical risk is ~nil here (Deno path unused; build-time; not in deployed runtime), and that no
  vite release yet bundles the patched esbuild.
- Acceptance: user makes an explicit accept-now-vs-defer decision (escalation-asymmetry — not
  self-downgraded).

### DEP3 — cosmetic (no-action confirmation)
- The `|| 'FUFIRE_API_KEY'` dead fallback-ref-name (fufireDataService.ts) was reviewed as harmless
  dead code (config.secretRef always resolves). Reviewer said "leave it." NO churn this pass —
  recorded as considered-no-action to avoid touching the security-boundary file for zero behavior gain.

## Risks & rollback
- **DEP1 main risk:** esbuild 0.28 ↔ vite 6.4.3 API incompat surfacing only at build/dev runtime,
  not at install. Mitigation: the empirical gate (build + dev + suite) catches it before commit;
  rollback = `git checkout package.json package-lock.json` + `npm install`.
- Supply-chain: the override pulls esbuild 0.28.1 — verify it is the genuine published patched
  version (npm registry), not a typosquat. (`npm view esbuild@0.28.1` resolves to the official pkg.)
- All changes reversible; DEP1 is one commit.
