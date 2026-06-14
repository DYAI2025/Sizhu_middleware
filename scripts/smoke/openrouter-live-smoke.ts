/**
 * Live OpenRouter boundary smoke (FX2, REQ-A-002).
 *
 * Exercises the OpenRouter gateway against the REAL API to retire the
 * RED-for-confidence on REQ-A-002 (default model slugs marked "unverified vs the
 * live catalog; no live call"). It:
 *   1. resolves credentials via the REAL gateway (resolveOpenRouterCredentials),
 *   2. GETs the live /models catalog and CONFIRMS each default/overridden slug
 *      exists (the exact unverified-slug risk — FAIL LOUD if a slug is gone),
 *   3. makes ONE minimal chat completion to the quality_gate model to prove the
 *      key + call path end-to-end,
 *   4. self-checks that NO key value appears in the output.
 *
 * Opt-in (NOT part of `npm test` / CI). Run:
 *   npm run smoke:openrouter
 *   npm run smoke:openrouter -- --dry-run                 (no network/secret)
 *   npm run smoke:openrouter -- --dry-run --inject-drift  (proves the slug guard bites)
 *   npm run smoke:openrouter -- --no-completion           (catalog check only; no completion cost)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run") || process.env.SMOKE_DRY_RUN === "1";
const INJECT_DRIFT = ARGS.has("--inject-drift");
const NO_COMPLETION = ARGS.has("--no-completion");

function loadDotEnv(file = resolve(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

// Dry-run stub: a catalog that DOES contain the default slugs, + a completion echo.
// --inject-drift removes one default slug to prove the catalog guard fails loud.
function installDryRunFetch(defaultSlugs: string[]): void {
  const catalog = INJECT_DRIFT ? defaultSlugs.slice(1) : defaultSlugs.slice();
  (globalThis as any).fetch = async (url: string, init?: any): Promise<any> => {
    if (String(url).includes("/models")) {
      const body = { data: catalog.map((id) => ({ id })) };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }
    // chat/completions
    const body = { choices: [{ message: { role: "assistant", content: "pong" } }] };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

async function main(): Promise<void> {
  loadDotEnv();

  const { resolveOpenRouterCredentials, selectModelForOperation, buildOpenRouterGatewayConfig } =
    await import("../../src/lib/modelGateway/openRouterGateway");

  const creds = resolveOpenRouterCredentials();
  const config = buildOpenRouterGatewayConfig();
  // The two operations' resolved slugs (env-overridable; default if unset).
  const slugs = {
    image_generation: selectModelForOperation("image_generation"),
    quality_gate: selectModelForOperation("quality_gate"),
  };
  const wantedSlugs = [...new Set(Object.values(slugs))];
  const resolvedKey = process.env[creds.secretRef];

  if (DRY_RUN) installDryRunFetch(wantedSlugs);

  const baseUrlHost = (() => {
    try { return new URL(creds.baseUrl).host; } catch { return "<invalid base URL>"; }
  })();

  console.log("── Live OpenRouter boundary smoke ───────────────────────────");
  console.log(`mode            : ${DRY_RUN ? "DRY-RUN (stubbed)" : "REAL CALL"}${INJECT_DRIFT ? " + INJECT-DRIFT" : ""}${NO_COMPLETION ? " (catalog only)" : ""}`);
  console.log(`base URL host   : ${baseUrlHost}`);
  console.log(`secret-ref var  : ${creds.secretRef} (key ${creds.present ? "PRESENT" : "ABSENT"})`);
  console.log(`resolved slugs  : image_generation=${slugs.image_generation} · quality_gate=${slugs.quality_gate}`);

  if (!creds.present && !DRY_RUN) {
    console.log("✗ FAIL: no OpenRouter key present under the resolved secret-ref var.");
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resolvedKey ?? "dry-run"}`,
  };

  // 1. Catalog: confirm each wanted slug exists.
  let catalogIds: string[] = [];
  let catalogOk = false;
  try {
    const res = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/models`, { headers });
    catalogOk = res.ok;
    if (res.ok) {
      const body: any = await res.json();
      catalogIds = (body.data ?? []).map((m: any) => m.id);
    } else {
      console.log(`⚠ /models returned HTTP ${res.status}`);
    }
  } catch (e: any) {
    console.log(`⚠ /models call failed: ${e?.message ?? e}`);
  }

  const missingSlugs = wantedSlugs.filter((s) => !catalogIds.includes(s));
  console.log(`catalog         : ${catalogOk ? `${catalogIds.length} models` : "UNAVAILABLE"}`);
  console.log(`slug drift      : ${missingSlugs.length ? "\n  ✗ NOT in live catalog: " + missingSlugs.join(", ") : "(none — all resolved slugs exist in the live catalog)"}`);

  // 2. Minimal completion to prove the key + call path (quality_gate model).
  let completionOk = false;
  if (!NO_COMPLETION) {
    try {
      const res = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: slugs.quality_gate,
          messages: [{ role: "user", content: "Reply with the single word: pong" }],
          max_tokens: 5,
        }),
      });
      completionOk = res.ok;
      if (res.ok) {
        const body: any = await res.json();
        const text = body?.choices?.[0]?.message?.content ?? "";
        console.log(`completion      : ok — "${String(text).trim().slice(0, 40)}"`);
      } else {
        console.log(`completion      : ✗ HTTP ${res.status} (${(await res.text()).slice(0, 120)})`);
      }
    } catch (e: any) {
      console.log(`completion      : ✗ ${e?.message ?? e}`);
    }
  } else {
    console.log("completion      : skipped (--no-completion)");
  }

  // 3. Secret hygiene.
  const report = { baseUrlHost, secretRef: creds.secretRef, slugs, catalogCount: catalogIds.length, missingSlugs };
  const secretLeak = !!resolvedKey && resolvedKey.length > 0 && JSON.stringify(report).includes(resolvedKey);
  console.log(`secret hygiene  : ${secretLeak ? "✗ SECRET IN OUTPUT" : "✓ no secret in report"}`);

  const fail =
    !catalogOk ||
    missingSlugs.length > 0 ||
    secretLeak ||
    (!NO_COMPLETION && !completionOk);
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`VERDICT         : ${fail ? "✗ FAIL" : "✓ PASS"}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("✗ smoke harness crashed:", e?.message ?? e);
  process.exit(2);
});
