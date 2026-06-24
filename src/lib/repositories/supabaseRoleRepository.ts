/**
 * Real server-side Supabase persistence for the RBAC vertical
 * (feat/supabase-data-layer — the ROLES/RBAC data domain, mirrors
 * `supabaseProductRepository.ts` exactly).
 *
 * SECURITY: this class is constructed ONLY on the server with a service-role
 * supabase client. The service-role key never reaches the browser bundle (no
 * VITE_ prefix; the client is built server-side and injected here). This module
 * takes an already-built `SupabaseClient` so it stays test-mockable and free of
 * any key-reading itself.
 *
 * Column mapping (supabase-schema.sql):
 *   app_roles        : role (PK), description, created_at         (READ only)
 *   permissions      : id (PK), name, description, created_at     (READ only)
 *   role_permissions : (role, permission_id) link rows            (UPSERT)
 *   app_users        : id (PK), email, role, created_at, ...      (UPSERT)
 *
 * Active-role home (mirrors the Local's single-value semantics): the Local store
 * keeps the "active role" as ONE value under a single `active_role` key
 * (defaulting to 'Owner'); there is no per-table column for it. We replicate that
 * exact home with a single key-value settings row (`app_settings`, key
 * `active_role`) — one logical value, default 'Owner', upserted by key. See
 * supabase-schema.sql (`app_settings`).
 *
 * Every Supabase call checks `{ data, error }` and FAILS LOUD on `error` — no
 * silent empty-array / default fallback that would mask a misconfigured boundary.
 *
 * `role_permissions` is stored in the DB as one row per (role, permission_id)
 * link, but the domain contract is `RolePermissions[]` (one entry per role with a
 * `permissions: string[]`). So getRolePermissions AGGREGATES the link rows by role
 * and saveRolePermissions FLATTENS each role's list back into link rows.
 *
 * Contract: implements THIS branch's `RoleRepository`
 * (src/lib/repositories/interfaces.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role, AppUser, AppRoleName, Permission, RolePermissions } from "../domain/models";
import type { RoleRepository } from "./interfaces";

const TABLE_ROLES = "app_roles";
const TABLE_PERMISSIONS = "permissions";
const TABLE_ROLE_PERMISSIONS = "role_permissions";
const TABLE_USERS = "app_users";
const TABLE_SETTINGS = "app_settings";

/** The single settings key the active role is stored under (mirrors Local). */
const ACTIVE_ROLE_KEY = "active_role";
/** Default active role when no settings row has been written yet (mirrors Local). */
const DEFAULT_ACTIVE_ROLE: AppRoleName = "Owner";

const ROLE_COLUMNS = "role,description";
const PERMISSION_COLUMNS = "id,name,description";
const ROLE_PERMISSION_COLUMNS = "role,permission_id";
const USER_COLUMNS = "id,email,role,created_at";
const SETTINGS_COLUMNS = "key,value";

/** Shape of an `app_roles` row as Supabase returns it (snake_case). */
interface RoleRow {
  role: AppRoleName;
  description: string;
}

/** Shape of a `permissions` row as Supabase returns it. */
interface PermissionRow {
  id: string;
  name: string;
  description: string;
}

/** Shape of a `role_permissions` link row (one per role↔permission edge). */
interface RolePermissionRow {
  role: AppRoleName;
  permission_id: string;
}

/** Shape of an `app_users` row as Supabase returns it (snake_case). */
interface UserRow {
  id: string;
  email: string;
  role: AppRoleName;
  created_at: string;
}

/** Shape of an `app_settings` key-value row. */
interface SettingsRow {
  key: string;
  value: string;
}

/** Map a snake_case `app_roles` row → the domain `Role` (AppRole). */
function rowToRole(row: RoleRow): Role {
  return { role: row.role, description: row.description };
}

/** Map a snake_case `permissions` row → the domain `Permission`. */
function rowToPermission(row: PermissionRow): Permission {
  return { id: row.id, name: row.name, description: row.description };
}

/** Map a snake_case `app_users` row → the camelCase domain `AppUser`. */
function rowToUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** Map a camelCase domain `AppUser` → a snake_case `app_users` row. */
function userToRow(u: AppUser): UserRow {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    created_at: u.createdAt,
  };
}

/** Throw with table+op context when a supabase call returns an error. */
function assertNoError(op: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`SUPABASE_ROLE_STORE_ERROR (${op}): ${error.message ?? "unknown error"}`);
  }
}

export class SupabaseRoleRepository implements RoleRepository {
  constructor(private readonly client: SupabaseClient) {}

  // ── Reads: roles + permissions are static reference data ────────────────────

  async getRoles(): Promise<Role[]> {
    const { data, error } = await this.client.from(TABLE_ROLES).select(ROLE_COLUMNS);
    assertNoError("getRoles", error);
    return ((data as RoleRow[] | null) ?? []).map(rowToRole);
  }

  async getPermissions(): Promise<Permission[]> {
    const { data, error } = await this.client.from(TABLE_PERMISSIONS).select(PERMISSION_COLUMNS);
    assertNoError("getPermissions", error);
    return ((data as PermissionRow[] | null) ?? []).map(rowToPermission);
  }

  // ── role_permissions: link rows ⇄ aggregated RolePermissions[] ──────────────

  /**
   * Read every (role, permission_id) link row and AGGREGATE into the domain
   * `RolePermissions[]` (one entry per role, `permissions` = its permission ids).
   */
  async getRolePermissions(): Promise<RolePermissions[]> {
    const { data, error } = await this.client
      .from(TABLE_ROLE_PERMISSIONS)
      .select(ROLE_PERMISSION_COLUMNS);
    assertNoError("getRolePermissions", error);
    const rows = (data as RolePermissionRow[] | null) ?? [];

    // Preserve role first-seen order; collect permission ids per role.
    const byRole = new Map<AppRoleName, string[]>();
    for (const row of rows) {
      const list = byRole.get(row.role);
      if (list) {
        list.push(row.permission_id);
      } else {
        byRole.set(row.role, [row.permission_id]);
      }
    }
    return Array.from(byRole.entries()).map(([role, permissions]) => ({ role, permissions }));
  }

  /**
   * FLATTEN each role's `permissions: string[]` back into (role, permission_id)
   * link rows and UPSERT by the composite key `(role, permission_id)`. FAILS LOUD
   * on any `{ error }`.
   */
  async saveRolePermissions(bindings: RolePermissions[]): Promise<void> {
    const rows: RolePermissionRow[] = bindings.flatMap((b) =>
      b.permissions.map((permission_id) => ({ role: b.role, permission_id })),
    );
    const { error } = await this.client
      .from(TABLE_ROLE_PERMISSIONS)
      .upsert(rows, { onConflict: "role,permission_id" });
    assertNoError("saveRolePermissions", error);
  }

  // ── app_users ───────────────────────────────────────────────────────────────

  async getUsers(): Promise<AppUser[]> {
    const { data, error } = await this.client
      .from(TABLE_USERS)
      .select(USER_COLUMNS)
      .order("created_at", { ascending: false });
    assertNoError("getUsers", error);
    return ((data as UserRow[] | null) ?? []).map(rowToUser);
  }

  /** Bulk UPSERT users by primary key (`onConflict: id`). FAILS LOUD on error. */
  async saveUsers(users: AppUser[]): Promise<void> {
    const rows = users.map(userToRow);
    const { error } = await this.client.from(TABLE_USERS).upsert(rows, { onConflict: "id" });
    assertNoError("saveUsers", error);
  }

  // ── Active role: single key-value settings row (mirrors Local's single value)

  /**
   * Read the active role from the single `app_settings` row keyed `active_role`.
   * Defaults to 'Owner' when no row exists yet — mirroring the Local store's
   * `getStorageItem('active_role', 'Owner')`. FAILS LOUD on a supabase error
   * (a missing row is NOT an error: `maybeSingle` yields `data: null`).
   */
  async getActiveRole(): Promise<AppRoleName> {
    const { data, error } = await this.client
      .from(TABLE_SETTINGS)
      .select(SETTINGS_COLUMNS)
      .eq("key", ACTIVE_ROLE_KEY)
      .maybeSingle();
    assertNoError("getActiveRole", error);
    const row = data as SettingsRow | null;
    return (row?.value as AppRoleName | undefined) ?? DEFAULT_ACTIVE_ROLE;
  }

  /**
   * Write the active role to the single `app_settings` row keyed `active_role`
   * (UPSERT by `key`) — mirroring the Local store's `setStorageItem('active_role')`.
   * FAILS LOUD on error.
   */
  async setActiveRole(role: AppRoleName): Promise<void> {
    const row: SettingsRow = { key: ACTIVE_ROLE_KEY, value: role };
    const { error } = await this.client.from(TABLE_SETTINGS).upsert(row, { onConflict: "key" });
    assertNoError("setActiveRole", error);
  }
}
