/**
 * Unit tests for the REAL server-side Supabase provider store
 * (feat/supabase-data-layer — the PROVIDERS data vertical, mirrors the Products
 * reference test `supabaseProductRepository.test.ts`).
 *
 * Contract under test: `ProviderRepository`
 *   getProviders(): Promise<ApiProvider[]>,
 *   saveProvider(provider): Promise<void>,
 *   performHealthCheck(providerId): Promise<ApiProvider['status']>.
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload, opts) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method,
 *   - snake_case → camelCase mapping (read) and camelCase → snake_case (write),
 *   - optional lastChecked / errorMessage and nullable base_url / secret_ref handling,
 *   - upsert uses onConflict: "id",
 *   - performHealthCheck mirrors the Local semantics EXACTLY (ERROR for unknown id,
 *     MOCK for an existing one; never a fabricated LIVE; no provider_health_checks write),
 *   - fail-loud on a supabase `error` (no silent empty fallback).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseProviderRepository } from "../lib/repositories/supabaseProviderRepository";
import type { ApiProvider } from "../lib/domain/models";

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

const PROVIDER_ROW = {
  id: "prov_1",
  name: "FuFire Personalization API",
  // Use 'personalization' so a mutation that hardcodes a default would diverge —
  // the mapping is load-bearing, not a coincidence with a fixture default.
  type: "personalization" as const,
  status: "CONFIGURED" as const,
  base_url: "https://api.fufire.io/v1/personalization",
  secret_ref: "SECRET_REF_FUFIRE_LIVE_KEY",
  last_checked: "2026-01-02T00:00:00.000Z",
  error_message: "previous timeout",
  created_at: "2026-01-01T00:00:00.000Z",
};

function makeProvider(overrides: Partial<ApiProvider> = {}): ApiProvider {
  return {
    id: "prov_1",
    name: "FuFire Personalization API",
    type: "personalization",
    status: "CONFIGURED",
    baseUrl: "https://api.fufire.io/v1/personalization",
    secretRef: "SECRET_REF_FUFIRE_LIVE_KEY",
    lastChecked: "2026-01-02T00:00:00.000Z",
    errorMessage: "previous timeout",
    ...overrides,
  };
}

describe("SupabaseProviderRepository", () => {
  describe("getProviders", () => {
    it("queries api_providers and maps snake_case → camelCase", async () => {
      const { client, calls } = makeMockClient([{ data: [PROVIDER_ROW], error: null }]);
      const repo = new SupabaseProviderRepository(client);
      const result = await repo.getProviders();

      expect(calls[0].table).toBe("api_providers");
      expect(calls[0].op).toBe("select");
      expect(result).toEqual([
        {
          id: "prov_1",
          name: "FuFire Personalization API",
          type: "personalization",
          status: "CONFIGURED",
          baseUrl: "https://api.fufire.io/v1/personalization",
          secretRef: "SECRET_REF_FUFIRE_LIVE_KEY",
          lastChecked: "2026-01-02T00:00:00.000Z",
          errorMessage: "previous timeout",
        },
      ]);
    });

    it("maps null last_checked / error_message to absent keys (no spurious undefined)", async () => {
      const { client } = makeMockClient([
        {
          data: [{ ...PROVIDER_ROW, last_checked: null, error_message: null, base_url: null, secret_ref: null }],
          error: null,
        },
      ]);
      const repo = new SupabaseProviderRepository(client);
      const [provider] = await repo.getProviders();
      expect("lastChecked" in provider).toBe(false);
      expect("errorMessage" in provider).toBe(false);
      // null base_url / secret_ref collapse to "" (the domain type is non-optional string).
      expect(provider.baseUrl).toBe("");
      expect(provider.secretRef).toBe("");
    });

    it("returns [] for a null data set without throwing", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseProviderRepository(client);
      await expect(repo.getProviders()).resolves.toEqual([]);
    });

    it("FAILS LOUD on a supabase error (no silent empty fallback)", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseProviderRepository(client);
      await expect(repo.getProviders()).rejects.toThrow(/getProviders.*boom/);
    });
  });

  describe("saveProvider", () => {
    it("upserts a single api_providers row with camel→snake mapping and onConflict: id", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseProviderRepository(client);
      await repo.saveProvider(makeProvider({ id: "prov_a" }));

      expect(calls[0]).toMatchObject({ table: "api_providers", op: "upsert" });
      expect(calls[0].opts).toMatchObject({ onConflict: "id" });

      expect(calls[0].payload).toEqual({
        id: "prov_a",
        name: "FuFire Personalization API",
        type: "personalization",
        status: "CONFIGURED",
        base_url: "https://api.fufire.io/v1/personalization",
        secret_ref: "SECRET_REF_FUFIRE_LIVE_KEY",
        last_checked: "2026-01-02T00:00:00.000Z",
        error_message: "previous timeout",
      });
    });

    it("maps absent lastChecked / errorMessage to null columns", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseProviderRepository(client);
      const provider = makeProvider();
      delete provider.lastChecked;
      delete provider.errorMessage;
      await repo.saveProvider(provider);
      const row = calls[0].payload as Record<string, unknown>;
      expect(row.last_checked).toBeNull();
      expect(row.error_message).toBeNull();
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
      const repo = new SupabaseProviderRepository(client);
      await expect(repo.saveProvider(makeProvider())).rejects.toThrow(
        /saveProvider.*rls denied/,
      );
    });
  });

  describe("performHealthCheck", () => {
    it("returns MOCK for an existing provider (never a fabricated LIVE)", async () => {
      const { client, calls } = makeMockClient([{ data: [PROVIDER_ROW], error: null }]);
      const repo = new SupabaseProviderRepository(client);
      const status = await repo.performHealthCheck("prov_1");
      expect(status).toBe("MOCK");
      // Mirrors the Local impl: it reads the providers list, it does NOT write a
      // provider_health_checks row (no fabricated liveness persistence).
      expect(calls.every((c) => c.op !== "upsert")).toBe(true);
      expect(calls.some((c) => c.table === "provider_health_checks")).toBe(false);
    });

    it("returns ERROR for an unknown provider id", async () => {
      const { client } = makeMockClient([{ data: [PROVIDER_ROW], error: null }]);
      const repo = new SupabaseProviderRepository(client);
      await expect(repo.performHealthCheck("does-not-exist")).resolves.toBe("ERROR");
    });

    it("FAILS LOUD when the underlying read errors", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseProviderRepository(client);
      await expect(repo.performHealthCheck("prov_1")).rejects.toThrow(/getProviders.*boom/);
    });
  });
});
