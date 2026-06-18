/**
 * Live OpenRouter COMPILE (Lane-2 prose) boundary smoke (REQ-009 / AC-005 guard).
 *
 * Exercises the REAL Lane-2 prose path of promptCompilationService against the
 * live OpenRouter API:
 *   1. compileLane1() runs the deterministic Lane-1 compile on a small inline
 *      synthetic bazi sample (no LLM, no network) → fills the symbol placeholders.
 *   2. compileLane2() runs with the REAL createOpenRouterProseClient() — ONE real
 *      OpenRouter chat completion — to formulate the `imageGenerationPrompt` prose.
 *   3. Asserts:
 *        (a) a non-empty `imageGenerationPrompt` string came back;
 *        (b) AC-005 — `templatePlaceholders` are BYTE-IDENTICAL before/after Lane 2
 *            (the real LLM changed zero symbol values);
 *        (c) secret hygiene — the resolved OpenRouter key never appears in output.
 *
 * EVIDENCE harness, not product code. Opt-in (NOT part of `npm test`, NOT a CI
 * gate). Makes ONE real API call, prints the base-URL HOST only, exits non-zero
 * on any failure.
 *
 * Run:   npm run smoke:compile-openrouter                  (real call; needs .env)
 *        npm run smoke:compile-openrouter -- --dry-run     (fake client; no network/secret)
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

/** Registered template the Lane-1/Lane-2 compile runs against. */
const TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

/**
 * Small inline synthetic bazi sample — the exact §2 fields Lane-1 reads, with the
 * `data.` FuFire envelope. Synthetic Berlin subject; no real PII. Inlined (not a
 * fixture file) so the smoke is self-contained and deterministic.
 */
const SAMPLE_BAZI = {
  data: {
    pillars: { year: { stamm: "Geng", zweig: "Wu", tier: "Pferd", element: "Metall" } },
    chinese: { year: { stem: "Geng", branch: "Wu", animal: "Horse" } },
    dates: {
      birth_local: "1990-06-15T14:30:00+02:00",
      birth_utc: "1990-06-15T12:30:00+00:00",
      lichun_local: "1990-02-04T03:14:00+01:00",
    },
    transition: { solar_year: 1990, is_before_lichun: false },
    provenance: { engine_version: "1.0.0-rc1-20260220" },
  },
};

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

async function main(): Promise<void> {
  loadDotEnv();

  // Free-model routing for this smoke: the prod prose model (gemini-2.5-flash) needs paid
  // credits (a real call 402'd). Route to a FREE OpenRouter model so we can verify the model
  // actually responds + AC-005 holds, without credits. The prose lane reads the text-op model
  // OPENROUTER_MODEL_QUALITY_GATE. Overridable via SMOKE_PROSE_MODEL. Set BEFORE the gateway import.
  const FREE_PROSE_MODEL =
    process.env.SMOKE_PROSE_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
  if (!process.env.OPENROUTER_MODEL_QUALITY_GATE) {
    process.env.OPENROUTER_MODEL_QUALITY_GATE = FREE_PROSE_MODEL;
  }

  // Import AFTER env is populated (the gateway reads env at import-eval time).
  const { compileLane1, compileLane2, createOpenRouterProseClient } = await import(
    "../../server/services/promptCompilationService"
  );
  const { resolveOpenRouterCredentials, selectModelForOperation } = await import(
    "../../src/lib/modelGateway/openRouterGateway"
  );

  const creds = resolveOpenRouterCredentials();
  const resolvedKey = process.env[creds.secretRef];
  const model = selectModelForOperation("quality_gate");
  const baseUrlHost = (() => {
    try {
      return new URL(creds.baseUrl).host;
    } catch {
      return "<invalid base URL>";
    }
  })();

  console.log("── Live OpenRouter compile (Lane-2 prose) smoke ─────────────");
  console.log(`mode            : ${DRY_RUN ? "DRY-RUN (fake client)" : "REAL CALL"}`);
  console.log(`base URL host   : ${baseUrlHost}`);
  console.log(`secret-ref var  : ${creds.secretRef} (key ${creds.present ? "PRESENT" : "ABSENT"})`);
  console.log(`prose model     : ${model}`);
  console.log(`templateId      : ${TEMPLATE_ID}`);
  console.log("─────────────────────────────────────────────────────────────");

  if (!creds.present && !DRY_RUN) {
    console.log("✗ FAIL: no OpenRouter key present under the resolved secret-ref var.");
    process.exit(1);
  }

  // ── Lane 1 — deterministic compile (no LLM, no network) ─────────────────────
  const lane1 = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: SAMPLE_BAZI, locale: "en" });
  const placeholdersBefore = JSON.stringify(lane1.templatePlaceholders);
  console.log(`lane1 symbols   : year_pillar_hanzi=${lane1.templatePlaceholders["{{year_pillar_hanzi}}"]} · year_animal_pinyin=${lane1.templatePlaceholders["{{year_animal_pinyin}}"]}`);

  // ── Lane 2 — REAL OpenRouter prose formulation (one real call) ──────────────
  // --dry-run injects a fake client so no network/secret is touched.
  const client = DRY_RUN
    ? {
        async formulateImagePrompt(): Promise<string> {
          return "A serene modern Beijing-inspired poster background with calm negative space "
            + "reserved for the deterministic symbol zones. (dry-run stub prose)";
        },
      }
    : createOpenRouterProseClient();

  const lane2 = await compileLane2(lane1, TEMPLATE_ID, client);
  const placeholdersAfter = JSON.stringify(lane2.templatePlaceholders);

  // ── assertion (a): non-empty imageGenerationPrompt ──────────────────────────
  const prose = lane2.imageGenerationPrompt;
  const proseOk = typeof prose === "string" && prose.trim().length > 0;
  console.log(`imagePrompt     : ${proseOk ? `ok (${prose!.trim().length} chars) — "${prose!.trim().slice(0, 60)}…"` : "✗ EMPTY / not a string"}`);

  // ── assertion (b): AC-005 — placeholders byte-identical before/after Lane 2 ──
  const placeholdersIdentical = placeholdersBefore === placeholdersAfter;
  console.log(`AC-005 symbols  : ${placeholdersIdentical ? "✓ templatePlaceholders BYTE-IDENTICAL (LLM changed zero symbols)" : "✗ templatePlaceholders MUTATED by Lane 2"}`);

  // ── assertion (c): secret hygiene ───────────────────────────────────────────
  const serialized = JSON.stringify(lane2);
  const secretLeak = !!resolvedKey && resolvedKey.length > 0 && serialized.includes(resolvedKey);
  console.log(`secret hygiene  : ${secretLeak ? "✗ SECRET VALUE FOUND IN OUTPUT" : "✓ no secret in result"}`);

  const fail = !proseOk || !placeholdersIdentical || secretLeak;
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`VERDICT         : ${fail ? "✗ FAIL" : "✓ PASS"}`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ smoke harness crashed:", err?.message ?? err);
  process.exit(2);
});
