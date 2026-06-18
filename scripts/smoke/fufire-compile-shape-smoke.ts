/**
 * Live FuFire COMPILE-SHAPE boundary smoke (REQ-009 / CONTRA-002 guard).
 *
 * Companion to fufire-live-smoke.ts. Where that smoke proves the prompt-VARIABLE
 * interpreter contract still holds, THIS smoke proves the LANE-1 COMPILE contract
 * holds: it makes ONE real call to the live FuFire bazi endpoint (reusing the SAME
 * call path + credential resolution as fufire-live-smoke.ts — FuFireDataService),
 * then runs a FAIL-LOUD drift guard asserting the NEW compile fields that Lane-1
 * reads are present in the live response:
 *
 *   data.pillars.year.stamm
 *   data.pillars.year.zweig
 *   data.dates.lichun_local
 *   data.transition.is_before_lichun
 *   data.provenance.engine_version
 *
 * These are recorded with the `data.` FuFire-envelope prefix (mirroring §2 /
 * RAW_DATA_BINDINGS in promptCompilationService); on the `responses[].data`
 * object returned by executeTestRun the leading `data.` is already unwrapped, so
 * the guard checks the remainder (`pillars.year.stamm`, …). If ANY is missing →
 * print which + exit non-zero. This is the guard that keeps CONTRA-002 true.
 *
 * EVIDENCE harness, not product code. Opt-in (NOT part of `npm test`, NOT a CI
 * gate). It makes ONE real API call, self-checks that NO secret leaks into the
 * output, prints the base-URL HOST only, and exits non-zero on any failure.
 *
 * Run:   npm run smoke:compile-fufire                          (real call; needs .env)
 *        npm run smoke:compile-fufire -- --dry-run             (stubbed; no network/secret)
 *        npm run smoke:compile-fufire -- --dry-run --inject-drift  (proves the guard bites)
 *
 * SECURITY: never prints the API key. Prints the base-URL HOST only. A final
 * secret-hygiene self-check fails the run if the resolved key value appears
 * anywhere in the serialized report. The subject is SYNTHETIC (no real PII).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run") || process.env.SMOKE_DRY_RUN === "1";
const INJECT_DRIFT = ARGS.has("--inject-drift");

/**
 * The NEW Lane-1 compile fields, recorded with the `data.` FuFire-envelope prefix
 * (matching promptCompilationService §2 / RAW_DATA_BINDINGS). On the unwrapped
 * `responses[].data` object the leading `data.` is dropped — `relPath` is what we
 * actually read there.
 */
const COMPILE_FIELDS: ReadonlyArray<{ contractPath: string; relPath: string }> = [
  { contractPath: "data.pillars.year.stamm", relPath: "pillars.year.stamm" },
  { contractPath: "data.pillars.year.zweig", relPath: "pillars.year.zweig" },
  { contractPath: "data.dates.lichun_local", relPath: "dates.lichun_local" },
  { contractPath: "data.transition.is_before_lichun", relPath: "transition.is_before_lichun" },
  { contractPath: "data.provenance.engine_version", relPath: "provenance.engine_version" },
];

// ── minimal .env loader (no dependency) — only sets keys not already present ───
function loadDotEnv(file = resolve(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

/**
 * Bridge the user's .env names to the CANONICAL names the service reads, and
 * LOUDLY report any mismatch. Mirrors fufire-live-smoke.ts. The service reads:
 *   - base URL: process.env.FUFIRE_BASE_URL  (default https://api.fufire.space)
 *   - secret  : process.env[secretRef], secretRef = FUFIRE_API_KEY_SECRET_REF
 *               || "SECRET_REF_FUFIRE_API_KEY"
 */
function bridgeConfigNames(): { warnings: string[]; canonicalKeyVar: string } {
  const warnings: string[] = [];

  if (!process.env.FUFIRE_BASE_URL && process.env.FUFIRE_API_URL) {
    process.env.FUFIRE_BASE_URL = process.env.FUFIRE_API_URL;
    warnings.push(
      "CONFIG MISMATCH: service reads FUFIRE_BASE_URL but .env has FUFIRE_API_URL. " +
        "Bridged for this run — set FUFIRE_BASE_URL in prod/Railway.",
    );
  }

  const secretRef = process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
  if (!process.env[secretRef] && process.env.FUFIRE_API_KEY) {
    process.env[secretRef] = process.env.FUFIRE_API_KEY;
    warnings.push(
      `CONFIG MISMATCH: service resolves the key from "${secretRef}" but .env has it under ` +
        "FUFIRE_API_KEY. Bridged for this run — set the secret under the secret-ref name " +
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

// ── dry-run fetch stub: returns the captured bazi/wuxing samples. --inject-drift
//    deletes one NEW compile field from the bazi stub to prove the guard bites. ──
function installDryRunFetch(): void {
  const sample = (name: string): any =>
    JSON.parse(readFileSync(resolve(REPO_ROOT, "docs/contracts/fufire-samples", name), "utf8"));

  const bazi = sample("bazi.response.json");
  const wuxing = sample("wuxing.response.json");
  wuxing.input = { ...wuxing.input, lat: SUBJECT.manualLat, lon: SUBJECT.manualLon };

  if (INJECT_DRIFT) {
    // Simulate FuFire dropping a NEW compile field the Lane-1 compiler depends on.
    delete bazi.transition.is_before_lichun;
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

// ── FAIL-LOUD compile-shape drift guard: assert each NEW compile field is present
//    in the live bazi response. Returns a list of drift failures (empty == ok). ──
function checkCompileShapeDrift(
  responses: Array<{ operation: string; data?: unknown; error?: string }>,
): string[] {
  const drift: string[] = [];
  const get = (root: any, path: string): unknown =>
    path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), root);

  const bazi = responses.find((r) => r.operation === "bazi")?.data as any;
  if (!bazi) {
    drift.push("bazi: no successful response data to validate");
    return drift;
  }
  for (const f of COMPILE_FIELDS) {
    if (get(bazi, f.relPath) === undefined) {
      drift.push(`bazi: NEW compile field missing → ${f.contractPath}`);
    }
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

  console.log("── Live FuFire compile-shape smoke ──────────────────────────");
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
  console.log(`responses       : ${result.responses.map((r) => `${r.operation}:${"data" in r ? "ok" : r.error}`).join(", ")}`);
  console.log(`gatewayIssues   : ${result.gatewayIssues.length ? "\n  - " + result.gatewayIssues.map((g) => `${g.errorCode}: ${g.message}`).join("\n  - ") : "(none)"}`);

  // ── compile-shape drift guard (CONTRA-002) ───────────────────────────────────
  const drift = checkCompileShapeDrift(result.responses);
  console.log("compile fields  :");
  const bazi = result.responses.find((r) => r.operation === "bazi")?.data as any;
  const getRel = (path: string): unknown =>
    bazi ? path.split(".").reduce((o: any, k) => (o == null ? undefined : o[k]), bazi) : undefined;
  for (const f of COMPILE_FIELDS) {
    const present = getRel(f.relPath) !== undefined;
    console.log(`  ${present ? "✓" : "✗"} ${f.contractPath}`);
  }
  console.log(`compile drift   : ${drift.length ? "\n  ✗ " + drift.join("\n  ✗ ") : "(none — live shape carries every NEW compile field)"}`);

  // ── secret-hygiene self-check ───────────────────────────────────────────────
  const serialized = JSON.stringify(result);
  const secretLeak = !!resolvedKey && resolvedKey.length > 0 && serialized.includes(resolvedKey);
  console.log(`secret hygiene  : ${secretLeak ? "✗ SECRET VALUE FOUND IN OUTPUT" : "✓ no secret in result"}`);

  const fail =
    result.readinessStatus !== "READY" ||
    result.gatewayIssues.length > 0 ||
    drift.length > 0 ||
    secretLeak;

  console.log("─────────────────────────────────────────────────────────────");
  console.log(`VERDICT         : ${fail ? "✗ FAIL" : "✓ PASS"}`);

  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ smoke harness crashed:", err?.message ?? err);
  process.exit(2);
});
