import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import type { ProductRepository } from "../../src/lib/repositories/interfaces";
// `Product` is the `ShopProduct` alias; src/types.ts exports `ShopProduct`.
import type { ShopProduct as Product } from "../../src/types";

/**
 * Route-level tests for the Products data API (feat/supabase-data-layer).
 *
 * These prove the composition-root wiring (P1): the `/api/v1/products` routes are
 * mounted into createApp, backed by an INJECTED ProductRepository, gated by
 * apiGuard. Products CRUD is SESSION-class (a valid token + verified email is
 * enough) — NOT sensitive: it requires neither admin role nor MFA nor a scope.
 *
 * The repo is injected on an in-memory double so no Supabase / network is touched
 * and reads-after-writes prove a shared (not per-request) repo.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal1", // products are session-class: aal1 is sufficient
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}

function bearer(t: string): [string, string] {
  return ["Authorization", `Bearer ${t}`];
}

function validProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    shopProvider: "Etsy",
    externalProductId: "ext-prod-1",
    externalVariantId: "ext-var-1",
    title: "Personalized BaZi Print",
    productType: "poster",
    isActive: true,
    activeTemplateId: "tpl-1",
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Minimal in-memory ProductRepository double — no Supabase, no network. */
class InMemoryProductRepo implements ProductRepository {
  products: Product[] = [];
  async getProducts(): Promise<Product[]> {
    return [...this.products];
  }
  async saveProducts(products: Product[]): Promise<void> {
    // Upsert-by-id semantics, mirroring the real repo.
    for (const p of products) {
      const idx = this.products.findIndex((x) => x.id === p.id);
      if (idx >= 0) this.products[idx] = p;
      else this.products.push(p);
    }
  }
}

let app: Express;
let repo: InMemoryProductRepo;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.MFA_REQUIRED_FOR_SENSITIVE_ACTIONS = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;

  // Fresh shared repo per test, injected at the composition root.
  repo = new InMemoryProductRepo();
  app = createApp({ productRepo: repo });
});

describe("GET /api/v1/products", () => {
  it("rejects unauthenticated requests (default-deny session)", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("returns the products array for a valid session", async () => {
    repo.products = [validProduct()];
    const res = await request(app)
      .get("/api/v1/products")
      .set(...bearer(token()));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((p: Product) => p.id)).toContain("prod-1");
  });

  it("returns 500 when the repo fails loud (never a fabricated empty array)", async () => {
    const failingRepo: ProductRepository = {
      async getProducts() {
        throw new Error("SUPABASE_PRODUCT_STORE_ERROR (getProducts): boom");
      },
      async saveProducts() {},
    };
    const failApp = createApp({ productRepo: failingRepo });
    const res = await request(failApp)
      .get("/api/v1/products")
      .set(...bearer(token()));
    expect(res.status).toBe(500);
    expect(res.body.error_code).toBe("PRODUCT_STORE_ERROR");
    // The raw boundary message must NOT be relayed to the client.
    expect(JSON.stringify(res.body)).not.toContain("boom");
  });
});

describe("POST /api/v1/products", () => {
  const path = "/api/v1/products";

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).post(path).send([validProduct()]);
    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe("AUTH_REQUIRED");
  });

  it("saves products for a valid session and reads them back (shared repo)", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send([validProduct({ id: "prod-shared" })]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, count: 1 });

    // A SECOND, independent supertest call must see it (shared, not per-request).
    const list = await request(app)
      .get(path)
      .set(...bearer(token()));
    expect(list.status).toBe(200);
    expect(list.body.map((p: Product) => p.id)).toContain("prod-shared");
  });

  it("rejects a non-array body with 400 and does NOT persist", async () => {
    const res = await request(app)
      .post(path)
      .set(...bearer(token()))
      .send({ id: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe("INVALID_REQUEST");
    expect(await repo.getProducts()).toEqual([]);
  });

  it("does NOT require admin role or MFA (session-class, not sensitive)", async () => {
    // A plain aal1 session with a non-admin email still authorizes the write.
    const res = await request(app)
      .post(path)
      .set(...bearer(token({ email: "viewer@example.com", aal: "aal1" })))
      .send([validProduct({ id: "prod-session" })]);
    expect(res.status).toBe(200);
  });
});
