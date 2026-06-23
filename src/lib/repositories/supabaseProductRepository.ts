/**
 * Real server-side Supabase persistence for shop products
 * (feat/supabase-data-layer — the FIRST data-domain vertical, REFERENCE pattern).
 *
 * SECURITY: this class is constructed ONLY on the server with a service-role
 * supabase client (see `server/index.ts`). The service-role key never reaches the
 * browser bundle (no VITE_ prefix; the client is built server-side and injected
 * here). This module takes an already-built `SupabaseClient` so it stays
 * test-mockable and free of any key-reading itself. Mirrors
 * `supabaseTemplateRepository.ts` exactly.
 *
 * Column mapping (live table verified, supabase-schema.sql):
 *   shop_products : id, shop_provider, external_product_id, external_variant_id,
 *                   title, product_type, is_active, active_template_id, created_at
 *
 * Every Supabase call checks `{ data, error }` and FAILS LOUD on `error` — no
 * silent empty-array fallback that would mask a misconfigured boundary as "no
 * products".
 *
 * Contract: implements THIS branch's `ProductRepository`
 * (src/lib/repositories/interfaces.ts) — `getProducts(): Promise<Product[]>` and
 * `saveProducts(products): Promise<void>`. `Product` is the `ShopProduct` alias.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "../domain/models";
import type { ProductRepository } from "./interfaces";

const TABLE_PRODUCTS = "shop_products";

const PRODUCT_COLUMNS =
  "id,shop_provider,external_product_id,external_variant_id,title,product_type,is_active,active_template_id,created_at";

/** Shape of a `shop_products` row as Supabase returns it (snake_case). */
interface ProductRow {
  id: string;
  shop_provider: Product["shopProvider"];
  external_product_id: string;
  external_variant_id: string | null;
  title: string;
  product_type: string;
  is_active: boolean;
  active_template_id: string | null;
  created_at: string;
}

/** Map a snake_case DB row → the camelCase domain `Product` (ShopProduct). */
function rowToProduct(row: ProductRow): Product {
  const product: Product = {
    id: row.id,
    shopProvider: row.shop_provider,
    externalProductId: row.external_product_id,
    externalVariantId: row.external_variant_id ?? "",
    title: row.title,
    productType: row.product_type,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
  // `activeTemplateId` is optional on the domain type; only attach it when the
  // row actually carries a binding so we don't introduce a spurious `undefined`.
  if (row.active_template_id != null) {
    product.activeTemplateId = row.active_template_id;
  }
  return product;
}

/** Map a camelCase domain `Product` → a snake_case `shop_products` row. */
function productToRow(p: Product): ProductRow {
  return {
    id: p.id,
    shop_provider: p.shopProvider,
    external_product_id: p.externalProductId,
    external_variant_id: p.externalVariantId,
    title: p.title,
    product_type: p.productType,
    is_active: p.isActive,
    active_template_id: p.activeTemplateId ?? null,
    created_at: p.createdAt,
  };
}

/** Throw with table+op context when a supabase call returns an error. */
function assertNoError(op: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`SUPABASE_PRODUCT_STORE_ERROR (${op}): ${error.message ?? "unknown error"}`);
  }
}

export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getProducts(): Promise<Product[]> {
    const { data, error } = await this.client
      .from(TABLE_PRODUCTS)
      .select(PRODUCT_COLUMNS)
      .order("created_at", { ascending: false });
    assertNoError("getProducts", error);
    return ((data as ProductRow[] | null) ?? []).map(rowToProduct);
  }

  /**
   * Bulk UPSERT all rows by primary key (`onConflict: id`). Maps each camelCase
   * `Product` → its snake_case row. FAILS LOUD on any `{ error }`.
   */
  async saveProducts(products: Product[]): Promise<void> {
    const rows = products.map(productToRow);
    const { error } = await this.client
      .from(TABLE_PRODUCTS)
      .upsert(rows, { onConflict: "id" });
    assertNoError("saveProducts", error);
  }
}
