/**
 * Unit tests for the REAL server-side Supabase product store
 * (feat/supabase-data-layer — the FIRST data-domain vertical, REFERENCE pattern).
 *
 * Contract under test: THIS branch's `ProductRepository`
 * (getProducts(): Promise<Product[]>, saveProducts(products): Promise<void>).
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload, opts) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method,
 *   - snake_case → camelCase mapping (read) and camelCase → snake_case (write),
 *   - optional activeTemplateId / nullable external_variant_id handling,
 *   - upsert uses onConflict: "id",
 *   - fail-loud on a supabase `error` (no silent empty fallback).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseProductRepository } from "../lib/repositories/supabaseProductRepository";
// `Product` is the `ShopProduct` alias; src/types.ts exports `ShopProduct`.
import type { ShopProduct as Product } from "../types";

// ── Mock supabase-js query builder ──────────────────────────────────────────

interface RecordedCall {
  table: string;
  op: string;
  payload?: unknown;
  opts?: unknown;
}

/**
 * A programmable mock. `responses` is a queue of `{ data, error }` consumed in the
 * order terminal calls resolve. Every chain segment is recorded for assertions.
 */
function makeMockClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: RecordedCall[] = [];
  let cursor = 0;
  const nextResponse = () => responses[cursor++] ?? { data: null, error: null };

  function builder(table: string, op: string, payload?: unknown, opts?: unknown) {
    const rec: RecordedCall = { table, op, payload, opts };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const resolve = () => Promise.resolve(nextResponse());
    chain.select = () => chain;
    chain.order = () => resolve();
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        select: (_cols?: string) => builder(table, "select"),
        upsert: (payload: unknown, opts?: unknown) => builder(table, "upsert", payload, opts),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const PRODUCT_ROW = {
  id: "prod_1",
  // Use 'Eatsy' (not the schema's more common 'Etsy') so a mutation that
  // hardcodes the provider would diverge — the mapping is load-bearing, not a
  // coincidence with a fixture default.
  shop_provider: "Eatsy" as const,
  external_product_id: "ext-prod-1",
  external_variant_id: "ext-var-1",
  title: "Personalized BaZi Print",
  product_type: "poster",
  is_active: true,
  active_template_id: "tpl_1",
  created_at: "2026-01-01T00:00:00.000Z",
};

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_1",
    shopProvider: "Etsy",
    externalProductId: "ext-prod-1",
    externalVariantId: "ext-var-1",
    title: "Personalized BaZi Print",
    productType: "poster",
    isActive: true,
    activeTemplateId: "tpl_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SupabaseProductRepository", () => {
  describe("getProducts", () => {
    it("queries shop_products and maps snake_case → camelCase", async () => {
      const { client, calls } = makeMockClient([{ data: [PRODUCT_ROW], error: null }]);
      const repo = new SupabaseProductRepository(client);
      const result = await repo.getProducts();

      expect(calls[0].table).toBe("shop_products");
      expect(calls[0].op).toBe("select");
      expect(result).toEqual([
        {
          id: "prod_1",
          shopProvider: "Eatsy",
          externalProductId: "ext-prod-1",
          externalVariantId: "ext-var-1",
          title: "Personalized BaZi Print",
          productType: "poster",
          isActive: true,
          activeTemplateId: "tpl_1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("maps a null active_template_id to an absent activeTemplateId (no spurious key)", async () => {
      const { client } = makeMockClient([
        { data: [{ ...PRODUCT_ROW, active_template_id: null, external_variant_id: null }], error: null },
      ]);
      const repo = new SupabaseProductRepository(client);
      const [product] = await repo.getProducts();
      expect("activeTemplateId" in product).toBe(false);
      // A null variant id collapses to "" (the domain type is a non-optional string).
      expect(product.externalVariantId).toBe("");
    });

    it("returns [] for a null data set without throwing", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseProductRepository(client);
      await expect(repo.getProducts()).resolves.toEqual([]);
    });

    it("FAILS LOUD on a supabase error (no silent empty fallback)", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseProductRepository(client);
      await expect(repo.getProducts()).rejects.toThrow(/getProducts.*boom/);
    });
  });

  describe("saveProducts", () => {
    it("upserts shop_products with camel→snake mapping and onConflict: id", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseProductRepository(client);
      await repo.saveProducts([makeProduct({ id: "prod_a" }), makeProduct({ id: "prod_b" })]);

      expect(calls[0]).toMatchObject({ table: "shop_products", op: "upsert" });
      expect(calls[0].opts).toMatchObject({ onConflict: "id" });

      const rows = calls[0].payload as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        id: "prod_a",
        shop_provider: "Etsy",
        external_product_id: "ext-prod-1",
        external_variant_id: "ext-var-1",
        title: "Personalized BaZi Print",
        product_type: "poster",
        is_active: true,
        active_template_id: "tpl_1",
        created_at: "2026-01-01T00:00:00.000Z",
      });
      expect(rows[1].id).toBe("prod_b");
    });

    it("maps an absent activeTemplateId to a null active_template_id column", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseProductRepository(client);
      const product = makeProduct();
      delete product.activeTemplateId;
      await repo.saveProducts([product]);
      const rows = calls[0].payload as Array<Record<string, unknown>>;
      expect(rows[0].active_template_id).toBeNull();
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
      const repo = new SupabaseProductRepository(client);
      await expect(repo.saveProducts([makeProduct()])).rejects.toThrow(
        /saveProducts.*rls denied/,
      );
    });
  });
});
