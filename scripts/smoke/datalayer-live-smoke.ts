/**
 * Real-boundary smoke for ALL Supabase data-layer repos against the LIVE schema.
 * Round-trips each domain repo (save → read-back → cleanup) via a service-role client,
 * catching camel↔snake mapping typos the mocked unit tests can't. Per-domain PASS/FAIL.
 *   npm run smoke:datalayer
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { SupabaseProviderRepository } from "../../src/lib/repositories/supabaseProviderRepository";
import { SupabaseArtifactRepository } from "../../src/lib/repositories/supabaseArtifactRepository";
import { SupabaseSettingsRepository } from "../../src/lib/repositories/supabaseSettingsRepository";
import { SupabaseWorkflowRepository } from "../../src/lib/repositories/supabaseWorkflowRepository";
import { SupabaseRoleRepository } from "../../src/lib/repositories/supabaseRoleRepository";

dotenv.config();
const url = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.VITE_SUPABASE_URL || "";
const key = process.env[process.env.SUPABASE_SERVICE_ROLE_SECRET_REF || "SECRET_REF_SUPABASE_SERVICE_ROLE"] || "";
if (!url || !key) throw new Error("BLOCKED: SUPABASE_URL + service-role key required");
const client = createClient(url, key, { auth: { persistSession: false } });
const sfx = `${process.pid}_${Math.floor(Number(process.hrtime.bigint() % 1000000n))}`;
const results: string[] = [];
async function domain(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(`✓ ${name}`); console.log(`✓ ${name}`); }
  catch (e) { results.push(`✗ ${name}: ${(e as Error).message}`); console.log(`✗ ${name}: ${(e as Error).message}`); }
}

console.log(`[live] host: ${new URL(url).host}`);

await domain("providers", async () => {
  const repo = new SupabaseProviderRepository(client);
  const id = `smk_prov_${sfx}`;
  await repo.saveProvider({ id, name: "Smk", type: "image", status: "MOCK" } as never);
  const back = (await repo.getProviders()).find((p) => p.id === id);
  if (!back || back.name !== "Smk") throw new Error("round-trip failed");
  await client.from("api_providers").delete().eq("id", id);
});

await domain("artifacts", async () => {
  const repo = new SupabaseArtifactRepository(client);
  const id = `smk_art_${sfx}`;
  await repo.saveImageArtifacts([{ id, orderNumber: "ORD", productId: null, iteration: 1, candidateIndex: 0, storagePath: "x", status: "not_selected" } as never]);
  const back = (await repo.getImageArtifacts()).find((a) => a.id === id);
  if (!back) throw new Error("round-trip failed");
  await client.from("image_artifacts").delete().eq("id", id);
});

await domain("workflows", async () => {
  const repo = new SupabaseWorkflowRepository(client);
  const id = `smk_run_${sfx}`;
  await repo.saveWorkflowRuns([{ id, orderNumber: "ORD", productId: null, customerName: "C", status: "running", startedAt: new Date().toISOString(), currentIteration: 1 } as never]);
  const back = (await repo.getWorkflowRuns()).find((r) => r.id === id);
  if (!back) throw new Error("run round-trip failed");
  // visual_workflows.product_id has an FK to shop_products — create a real parent.
  const pid = `smk_wfp_${sfx}`;
  await client.from("shop_products").insert({ id: pid, shop_provider: "Etsy", external_product_id: "e", title: "t" });
  const wf = { productId: pid, nodes: [], edges: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await repo.saveVisualWorkflow(pid, wf as never);
  const got = await repo.getVisualWorkflow(pid);
  if (got.productId !== pid) throw new Error("visual round-trip failed");
  await client.from("visual_workflows").delete().eq("product_id", pid);
  await client.from("shop_products").delete().eq("id", pid);
  await client.from("workflow_runs").delete().eq("id", id);
});

await domain("settings", async () => {
  const repo = new SupabaseSettingsRepository(client);
  const productId = `smk_set_${sfx}`;
  // shop_products FK — insert a parent first if gen_configs references it.
  await client.from("shop_products").insert({ id: productId, shop_provider: "Etsy", external_product_id: "e", title: "t" });
  await repo.saveGenConfigs([{ productId, numInitiallyGenerated: 4, imageFormat: "png", imageQuality: "standard", primaryProvider: "OpenRouter", primaryModel: "m", primarySecretRef: "r", fallbackProvider: "OpenRouter", fallbackModel: "m", fallbackLLM: "m", fallbackSecretRef: "r" } as never]);
  const back = (await repo.getGenConfigs()).find((c) => c.productId === productId);
  if (!back) throw new Error("gen config round-trip failed");
  await client.from("generation_configs").delete().eq("product_id", productId);
  await client.from("shop_products").delete().eq("id", productId);
});

await domain("roles (read seeded)", async () => {
  const repo = new SupabaseRoleRepository(client);
  const roles = await repo.getRoles();
  if (!roles.length) throw new Error("no seeded roles read");
  const perms = await repo.getPermissions();
  if (!perms.length) throw new Error("no seeded permissions read");
});

await client.from("shop_products").delete().like("id", `smk_%`);
const failed = results.filter((r) => r.startsWith("✗"));
console.log(`\nDATALAYER SMOKE: ${results.length - failed.length}/${results.length} domains PASS`);
if (failed.length) process.exit(1);
