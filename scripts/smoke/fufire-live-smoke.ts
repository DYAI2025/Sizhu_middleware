/**
 * Live FuFire boundary smoke (north-star slice #1, REQ-F-002 / REQ-F-001).
 *
 * Exercises the ALREADY-WIRED FuFire call path end-to-end against the REAL API:
 *   buildBaziRequest/buildWuxingRequest → live fetch (fufireDataService:343)
 *   → resolvePromptVariables ("no invented data" interpreter).
 *
 * This is an EVIDENCE harness, not product code. It makes ONE real API call,
 * asserts the live responses still satisfy the contract the interpreter assumes
 * (LF3 drift guard), self-checks that NO secret leaks into the output, and exits
 * non-zero on any failure. It is opt-in (NOT part of `npm test`, NOT a CI gate).
 *
 * Run:   npm run smoke:fufire            (real call; needs .env with the key)
 *        npm run smoke:fufire -- --dry-run            (stubbed; no network/secret)
 *        npm run smoke:fufire -- --dry-run --inject-drift   (proves the guard bites)
 *
 * SECURITY: never prints the API key. Prints the base-URL HOST only. A final
 * secret-hygiene self-check fails the run if the resolved key value appears
 * anywhere in the serialized report. The subject is SYNTHETIC (no real PII).
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run") || process.env.SMOKE_DRY_RUN === "1";
const INJECT_DRIFT = ARGS.has("--inject-drift");
const CAPTURE = ARGS.has("--capture");
/** Capture date for sample filenames — passed in so the script stays deterministic. */
const CAPTURE_DATE = process.env.SMOKE_CAPTURE_DATE || "live";

// ── minimal .env loader (no dependency) — only sets keys not already present ───
function loadDotEnv(file = resolve(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key] = m;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/**
 * Bridge the user's .env names to the CANONICAL names the service reads, and
 * LOUDLY report any mismatch (a real prod/Railway config finding). The service
 * reads:
 *   - base URL: process.env.FUFIRE_BASE_URL  (default https://api.fufire.space)
 *   - secret  : process.env[secretRef], secretRef = FUFIRE_API_KEY_SECRET_REF
 *               || "SECRET_REF_FUFIRE_API_KEY"
 */
function bridgeConfigNames(): { warnings: string[]; canonicalKeyVar: string } {
  const warnings: string[] = [];

  // base URL: accept FUFIRE_API_URL as an alias for FUFIRE_BASE_URL.
  if (!process.env.FUFIRE_BASE_URL && process.env.FUFIRE_API_URL) {
    process.env.FUFIRE_BASE_URL = process.env.FUFIRE_API_URL;
    warnings.push(
      'CONFIG MISMATCH: service reads FUFIRE_BASE_URL but .env has FUFIRE_API_URL. ' +
        "Bridged for this run — set FUFIRE_BASE_URL in prod/Railway.",
    );
  }

  // secret: the canonical env var is the VALUE of secretRef.
  const secretRef = process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
  if (!process.env[secretRef] && process.env.FUFIRE_API_KEY) {
    process.env[secretRef] = process.env.FUFIRE_API_KEY;
    warnings.push(
      `CONFIG MISMATCH: service resolves the key from "${secretRef}" but .env has it under ` +
        'FUFIRE_API_KEY. Bridged for this run — set the secret under the secret-ref name ' +
        "in prod/Railway (or set FUFIRE_API_KEY_SECRET_REF=FUFIRE_API_KEY).",
    );
  }
  return { warnings, canonicalKeyVar: secretRef };
}

// ── synthetic subject (the Berlin sample subject — no real PII) ───────────────
const SUBJECT = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  manualLat: 52.52,
  manualLon: 13.405,
  manualTimezone: "Europe/Berlin",
  standard: "CIVIL",
  boundary: "midnight",
  ambiguousTime: "earlier",
  nonexistentTime: "error",
  requestedOperations: ["bazi", "wuxing", "fusion"],
  locale: "en",
};

// ── dry-run fetch stub: returns the captured samples, with input coords set to
//    the subject so dominant_element binds (mirroring what the real call should
//    do). --inject-drift removes a contract key to prove the LF3 guard bites. ──
function installDryRunFetch(): void {
  const sample = (name: string): any =>
    JSON.parse(readFileSync(resolve(REPO_ROOT, "docs/contracts/fufire-samples", name), "utf8"));

  const bazi = sample("bazi.response.json");
  const wuxing = sample("wuxing.response.json");
  // The real call uses the subject coords; reflect that so the 0,0 trap clears.
  wuxing.input = { ...wuxing.input, lat: SUBJECT.manualLat, lon: SUBJECT.manualLon };

  if (INJECT_DRIFT) {
    // Simulate FuFire renaming a field the interpreter depends on.
    delete bazi.pillars.year.element;
  }

  (globalThis as any).fetch = async (url: string): Promise<any> => {
    const body = url.includes("/wuxing") ? wuxing : bazi;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
}

// ── LF3 contract-drift guard: assert the live response carries the exact keys
//    the interpreter reads. Returns a list of drift failures (empty == ok). ────
function checkContractDrift(responses: Array<{ operation: string; data?: unknown; error?: string }>): string[] {
  const drift: string[] = [];
  const get = (root: any, path: string): unknown =>
    path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), root);

  const bazi = responses.find((r) => r.operation === "bazi")?.data as any;
  const wuxing = responses.find((r) => r.operation === "wuxing")?.data as any;

  if (!bazi) {
    drift.push("bazi: no successful response data to validate");
  } else {
    for (const p of [
      "pillars.year.stamm",
      "pillars.year.zweig",
      "pillars.year.tier",
      "pillars.year.element",
      "chinese.year.animal",
      "transition.solar_year",
      "derivation_trace.day.day_anchor_evidence.anchor_verification",
    ]) {
      if (get(bazi, p) === undefined) drift.push(`bazi: contract path missing → ${p}`);
    }
  }

  if (!wuxing) {
    drift.push("wuxing: no successful response data to validate");
  } else {
    if (get(wuxing, "dominant_element") === undefined)
      drift.push("wuxing: contract path missing → dominant_element");
    // The interpreter's 0,0 guard relies on the response echoing input coords.
    if (get(wuxing, "input.lat") === undefined || get(wuxing, "input.lon") === undefined)
      drift.push("wuxing: response does not echo input.lat/input.lon (0,0 location guard relies on it)");
  }
  return drift;
}

async function main(): Promise<void> {
  loadDotEnv();
  const { warnings, canonicalKeyVar } = bridgeConfigNames();
  const resolvedKey = process.env[canonicalKeyVar];

  if (DRY_RUN) installDryRunFetch();

  // Import AFTER env is populated (the config reads env at import-eval time).
  const { FuFireDataService } = await import("../../server/services/fufireDataService");
  const { fufireDataConfig } = await import("../../src/lib/apiConnections/dataRequestConfig");

  const baseUrlHost = (() => {
    try {
      return new URL(fufireDataConfig.baseUrl).host;
    } catch {
      return "<invalid base URL>";
    }
  })();

  console.log("── Live FuFire boundary smoke ───────────────────────────────");
  console.log(`mode            : ${DRY_RUN ? "DRY-RUN (stubbed)" : "REAL CALL"}${INJECT_DRIFT ? " + INJECT-DRIFT" : ""}`);
  console.log(`base URL host   : ${baseUrlHost}`);
  console.log(`auth header     : ${fufireDataConfig.authHeaderName}`);
  console.log(`secret-ref var  : ${canonicalKeyVar} (key ${resolvedKey ? "PRESENT" : "ABSENT"})`);
  console.log(`subject         : 1990-06-15 14:30 @ 52.52,13.405 Europe/Berlin (synthetic)`);
  for (const w of warnings) console.log(`⚠  ${w}`);
  console.log("─────────────────────────────────────────────────────────────");

  const svc = new FuFireDataService();
  const result = await svc.executeTestRun(SUBJECT as any);

  console.log(`readinessStatus : ${result.readinessStatus}`);
  console.log(`requests        : ${result.requests.map((r) => r.operation).join(", ")}`);
  console.log(`responses       : ${result.responses.map((r) => `${r.operation}:${"data" in r ? "ok" : r.error}`).join(", ")}`);
  console.log("promptVariables :", JSON.stringify(result.promptVariables ?? {}, null, 2));
  console.log(`promptVarIssues : ${(result.promptVariableIssues ?? []).length ? "\n  - " + (result.promptVariableIssues ?? []).join("\n  - ") : "(none)"}`);
  console.log(`gatewayIssues   : ${result.gatewayIssues.length ? "\n  - " + result.gatewayIssues.map((g) => `${g.errorCode}: ${g.message}`).join("\n  - ") : "(none)"}`);

  // ── LF3 drift guard ─────────────────────────────────────────────────────────
  const drift = checkContractDrift(result.responses);
  console.log(`contract drift  : ${drift.length ? "\n  ✗ " + drift.join("\n  ✗ ") : "(none — live shape matches interpreter contract)"}`);

  // ── secret-hygiene self-check ───────────────────────────────────────────────
  const serialized = JSON.stringify(result);
  const secretLeak = !!resolvedKey && resolvedKey.length > 0 && serialized.includes(resolvedKey);
  console.log(`secret hygiene  : ${secretLeak ? "✗ SECRET VALUE FOUND IN OUTPUT" : "✓ no secret in result"}`);

  // ── verdict ─────────────────────────────────────────────────────────────────
  const coreVars = result.promptVariables ?? {};
  const coreResolved =
    coreVars.animal !== undefined &&
    coreVars.element !== undefined &&
    coreVars.birth_year !== undefined;
  const dominantBound = coreVars.western_dominant !== undefined;
  // FX9: with the fusion op requested + coords matching, eastern (located) dominance binds too.
  console.log(`western_dominant : ${coreVars.western_dominant ?? "(unbound)"}`);
  console.log(`eastern_dominant : ${coreVars.eastern_dominant ?? "(unbound)"}  ← needs fusion + coord match`);

  const fail =
    result.readinessStatus !== "READY" ||
    result.gatewayIssues.length > 0 ||
    drift.length > 0 ||
    secretLeak ||
    !coreResolved;

  // ── LF4 capture: persist the raw live responses (synthetic subject, no PII)
  //    + a secret-free verdict report for the Reality-Ledger evidence. ──────────
  if (CAPTURE && !DRY_RUN) {
    if (secretLeak) {
      console.log("✗ refusing to capture — secret leak detected in result");
    } else {
      const samplesDir = resolve(REPO_ROOT, "docs/contracts/fufire-samples");
      const realityDir = resolve(REPO_ROOT, "docs/reality");
      mkdirSync(samplesDir, { recursive: true });
      mkdirSync(realityDir, { recursive: true });
      const baziData = result.responses.find((r) => r.operation === "bazi" && "data" in r)?.data;
      const wuxingData = result.responses.find((r) => r.operation === "wuxing" && "data" in r)?.data;
      const wrap = (d: unknown, op: string) => ({
        _note: `REAL live /v1/calculate/${op} response (smoke ${CAPTURE_DATE}). Synthetic subject `
          + `1990-06-15T14:30 @ 52.52,13.405 Europe/Berlin — no real customer PII.`,
        data: d,
      });
      writeFileSync(resolve(samplesDir, `bazi.${CAPTURE_DATE}.response.json`), JSON.stringify(wrap(baziData, "bazi"), null, 2));
      writeFileSync(resolve(samplesDir, `wuxing.${CAPTURE_DATE}.response.json`), JSON.stringify(wrap(wuxingData, "wuxing"), null, 2));
      writeFileSync(resolve(realityDir, `fufire-live-smoke-${CAPTURE_DATE}.report.json`), JSON.stringify({
        date: CAPTURE_DATE,
        baseUrlHost,
        authHeaderName: fufireDataConfig.authHeaderName,
        readinessStatus: result.readinessStatus,
        promptVariables: result.promptVariables,
        promptVariableIssues: result.promptVariableIssues ?? [],
        gatewayIssues: result.gatewayIssues.map((g) => g.errorCode),
        contractDrift: drift,
        secretHygiene: secretLeak ? "LEAK" : "clean",
        configWarnings: warnings,
        verdict: drift.length || secretLeak || result.gatewayIssues.length || result.readinessStatus !== "READY" || !coreResolved ? "FAIL" : "PASS",
      }, null, 2));
      console.log(`captured        : docs/contracts/fufire-samples/{bazi,wuxing}.${CAPTURE_DATE}.response.json + docs/reality/fufire-live-smoke-${CAPTURE_DATE}.report.json`);
    }
  }

  console.log("─────────────────────────────────────────────────────────────");
  console.log(`core vars (animal/element/birth_year) resolved: ${coreResolved}`);
  console.log(`dominant_element bound (live coords match)     : ${dominantBound}${dominantBound ? "" : "  ← note: blocked (0,0 trap / no coord echo)"}`);
  console.log(`VERDICT         : ${fail ? "✗ FAIL" : "✓ PASS"}`);

  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ smoke harness crashed:", err?.message ?? err);
  process.exit(2);
});
