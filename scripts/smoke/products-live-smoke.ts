/**
 * Real-boundary smoke for the SUPABASE DATA LAYER (Products vertical) against the LIVE schema.
 *   npm run smoke:products            # real: save → read-back → cleanup
 *   npm run smoke:products -- --dry-run
 * Proves the SupabaseProductRepository's camel↔snake mapping works against the real shop_products
 * table (after A+B applied it). Service-role, server-side. Secret hygiene: host only, never the key.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { SupabaseProductRepository } from "../../src/lib/repositories/supabaseProductRepository";
import type { ShopProduct } from "../../src/lib/domain/models";

dotenv.config();
const DRY = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.VITE_SUPABASE_URL || "";
const key = process.env[process.env.SUPABASE_SERVICE_ROLE_SECRET_REF || "SECRET_REF_SUPABASE_SERVICE_ROLE"] || "";

async function main() {
  if (DRY) { console.log("[dry-run] PASS — would round-trip a product through SupabaseProductRepository."); return; }
  if (!url || !key) throw new Error("BLOCKED: SUPABASE_URL + service-role key required.");
  console.log(`[live] host: ${new URL(url).host}`);
  const client = createClient(url, key, { auth: { persistSession: false } });
  const repo = new SupabaseProductRepository(client);

  const id = `smoke_prod_${process.pid}_${Math.floor(Number(process.hrtime.bigint() % 1000000n))}`;
  const product = {
    id, shopProvider: "Etsy", externalProductId: "ext-123", externalVariantId: "var-1",
    title: "Smoke Test Product", productType: "poster", isActive: true, activeTemplateId: null,
  } as unknown as ShopProduct;

  try {
    await repo.saveProducts([product]);
    console.log(`save: upserted ${id}`);
    const all = await repo.getProducts();
    const back = all.find((p) => p.id === id);
    if (!back) throw new Error("FAIL: saved product not read back — mapping or persistence broke.");
    if (back.title !== "Smoke Test Product" || (back as { shopProvider?: string }).shopProvider !== "Etsy") {
      throw new Error(`FAIL: round-trip mismatch: ${JSON.stringify(back)}`);
    }
    console.log("read-back: product round-tripped, camel↔snake mapping OK");
    console.log("PASS: products live data-layer smoke succeeded.");
  } finally {
    await client.from("shop_products").delete().eq("id", id);
    console.log("cleanup: removed smoke row");
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
