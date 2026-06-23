/**
 * Unit tests for the REAL server-side Supabase RBAC store
 * (feat/supabase-data-layer — the ROLES/RBAC vertical; mirrors
 * supabaseProductRepository.test.ts).
 *
 * Contract under test: THIS branch's `RoleRepository`
 * (src/lib/repositories/interfaces.ts).
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload, opts) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method,
 *   - snake_case → camelCase mapping (users) and camelCase → snake_case (write),
 *   - role_permissions link-row AGGREGATION (read) and FLATTENING (write),
 *   - upserts use the right onConflict key,
 *   - active-role single-value home (app_settings, key 'active_role', default Owner),
 *   - fail-loud on a supabase `error` (no silent empty / default fallback).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRoleRepository } from "../lib/repositories/supabaseRoleRepository";
import type { AppUser, RolePermissions } from "../types";

// ── Mock supabase-js query builder ──────────────────────────────────────────

interface RecordedCall {
  table: string;
  op: string;
  payload?: unknown;
  opts?: unknown;
  eq?: { col: string; val: unknown };
}

/**
 * A programmable mock. `responses` is a queue of `{ data, error }` consumed in the
 * order terminal calls resolve. Every chain segment is recorded for assertions.
 * Supports the terminals used by SupabaseRoleRepository:
 *   .select()            → thenable (and .order(), .eq().maybeSingle())
 *   .select().order()    → resolves
 *   .select().eq().maybeSingle() → resolves (active-role read)
 *   .upsert(payload,opts)→ thenable
 */
function makeMockClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: RecordedCall[] = [];
  let cursor = 0;
  const nextResponse = () => responses[cursor++] ?? { data: null, error: null };

  function builder(rec: RecordedCall) {
    calls.push(rec);
    const resolve = () => Promise.resolve(nextResponse());
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => resolve();
    chain.eq = (col: string, val: unknown) => {
      rec.eq = { col, val };
      return chain;
    };
    chain.maybeSingle = () => resolve();
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        select: (_cols?: string) => builder({ table, op: "select" }),
        upsert: (payload: unknown, opts?: unknown) => builder({ table, op: "upsert", payload, opts }),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("SupabaseRoleRepository", () => {
  describe("getRoles", () => {
    it("reads app_roles and maps to Role[]", async () => {
      const { client, calls } = makeMockClient([
        { data: [{ role: "Admin", description: "Full operational access." }], error: null },
      ]);
      const repo = new SupabaseRoleRepository(client);
      const result = await repo.getRoles();
      expect(calls[0]).toMatchObject({ table: "app_roles", op: "select" });
      expect(result).toEqual([{ role: "Admin", description: "Full operational access." }]);
    });

    it("returns [] for a null data set without throwing", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getRoles()).resolves.toEqual([]);
    });

    it("FAILS LOUD on a supabase error (no silent empty fallback)", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getRoles()).rejects.toThrow(/getRoles.*boom/);
    });
  });

  describe("getPermissions", () => {
    it("reads permissions and maps to Permission[]", async () => {
      const { client, calls } = makeMockClient([
        { data: [{ id: "view_dashboard", name: "View Dashboard", description: "see it" }], error: null },
      ]);
      const repo = new SupabaseRoleRepository(client);
      const result = await repo.getPermissions();
      expect(calls[0]).toMatchObject({ table: "permissions", op: "select" });
      expect(result).toEqual([{ id: "view_dashboard", name: "View Dashboard", description: "see it" }]);
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "denied" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getPermissions()).rejects.toThrow(/getPermissions.*denied/);
    });
  });

  describe("getRolePermissions", () => {
    it("AGGREGATES (role, permission_id) link rows into RolePermissions[]", async () => {
      const { client, calls } = makeMockClient([
        {
          data: [
            { role: "Owner", permission_id: "view_dashboard" },
            { role: "Owner", permission_id: "manage_roles" },
            { role: "Observer", permission_id: "view_dashboard" },
          ],
          error: null,
        },
      ]);
      const repo = new SupabaseRoleRepository(client);
      const result = await repo.getRolePermissions();
      expect(calls[0]).toMatchObject({ table: "role_permissions", op: "select" });
      expect(result).toEqual([
        { role: "Owner", permissions: ["view_dashboard", "manage_roles"] },
        { role: "Observer", permissions: ["view_dashboard"] },
      ]);
    });

    it("returns [] for a null data set", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getRolePermissions()).resolves.toEqual([]);
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "rls" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getRolePermissions()).rejects.toThrow(/getRolePermissions.*rls/);
    });
  });

  describe("saveRolePermissions", () => {
    it("FLATTENS RolePermissions[] into link rows and upserts onConflict role,permission_id", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseRoleRepository(client);
      const bindings: RolePermissions[] = [
        { role: "Owner", permissions: ["view_dashboard", "manage_roles"] },
        { role: "Observer", permissions: ["view_dashboard"] },
      ];
      await repo.saveRolePermissions(bindings);

      expect(calls[0]).toMatchObject({ table: "role_permissions", op: "upsert" });
      expect(calls[0].opts).toMatchObject({ onConflict: "role,permission_id" });
      expect(calls[0].payload).toEqual([
        { role: "Owner", permission_id: "view_dashboard" },
        { role: "Owner", permission_id: "manage_roles" },
        { role: "Observer", permission_id: "view_dashboard" },
      ]);
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "denied" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(
        repo.saveRolePermissions([{ role: "Owner", permissions: ["view_dashboard"] }]),
      ).rejects.toThrow(/saveRolePermissions.*denied/);
    });
  });

  describe("getUsers", () => {
    it("reads app_users and maps snake_case → camelCase", async () => {
      const { client, calls } = makeMockClient([
        {
          data: [
            { id: "usr-1", email: "a@b.com", role: "Admin", created_at: "2026-01-01T00:00:00.000Z" },
          ],
          error: null,
        },
      ]);
      const repo = new SupabaseRoleRepository(client);
      const result = await repo.getUsers();
      expect(calls[0]).toMatchObject({ table: "app_users", op: "select" });
      expect(result).toEqual([
        { id: "usr-1", email: "a@b.com", role: "Admin", createdAt: "2026-01-01T00:00:00.000Z" },
      ]);
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getUsers()).rejects.toThrow(/getUsers.*boom/);
    });
  });

  describe("saveUsers", () => {
    it("upserts app_users with camel→snake mapping and onConflict: id", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseRoleRepository(client);
      const users: AppUser[] = [
        { id: "usr-a", email: "a@b.com", role: "Owner", createdAt: "2026-01-01T00:00:00.000Z" },
      ];
      await repo.saveUsers(users);

      expect(calls[0]).toMatchObject({ table: "app_users", op: "upsert" });
      expect(calls[0].opts).toMatchObject({ onConflict: "id" });
      expect(calls[0].payload).toEqual([
        { id: "usr-a", email: "a@b.com", role: "Owner", created_at: "2026-01-01T00:00:00.000Z" },
      ]);
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "denied" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(
        repo.saveUsers([{ id: "x", email: "x@y.com", role: "Owner", createdAt: "2026-01-01T00:00:00.000Z" }]),
      ).rejects.toThrow(/saveUsers.*denied/);
    });
  });

  describe("getActiveRole", () => {
    it("reads the single app_settings row (key active_role) and returns its value", async () => {
      const { client, calls } = makeMockClient([
        { data: { key: "active_role", value: "Admin" }, error: null },
      ]);
      const repo = new SupabaseRoleRepository(client);
      const result = await repo.getActiveRole();
      expect(calls[0]).toMatchObject({ table: "app_settings", op: "select" });
      expect(calls[0].eq).toEqual({ col: "key", val: "active_role" });
      expect(result).toBe("Admin");
    });

    it("defaults to 'Owner' when no settings row exists (mirrors Local)", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getActiveRole()).resolves.toBe("Owner");
    });

    it("FAILS LOUD on a supabase error (a missing row is not an error)", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.getActiveRole()).rejects.toThrow(/getActiveRole.*boom/);
    });
  });

  describe("setActiveRole", () => {
    it("upserts the single app_settings row (key active_role) onConflict: key", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseRoleRepository(client);
      await repo.setActiveRole("Observer");

      expect(calls[0]).toMatchObject({ table: "app_settings", op: "upsert" });
      expect(calls[0].opts).toMatchObject({ onConflict: "key" });
      expect(calls[0].payload).toEqual({ key: "active_role", value: "Observer" });
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "denied" } }]);
      const repo = new SupabaseRoleRepository(client);
      await expect(repo.setActiveRole("Owner")).rejects.toThrow(/setActiveRole.*denied/);
    });
  });
});
