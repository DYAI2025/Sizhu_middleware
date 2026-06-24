/**
 * Real server-side Supabase persistence for API providers
 * (feat/supabase-data-layer — the PROVIDERS data vertical, mirrors the Products
 * reference `supabaseProductRepository.ts` exactly).
 *
 * SECURITY: this class is constructed ONLY on the server with a service-role
 * supabase client (see `server/index.ts`). The service-role key never reaches the
 * browser bundle (no VITE_ prefix; the client is built server-side and injected
 * here). This module takes an already-built `SupabaseClient` so it stays
 * test-mockable and free of any key-reading itself.
 *
 * Column mapping (live table verified, supabase-schema.sql):
 *   api_providers : id, name, type, status, base_url, secret_ref, last_checked,
 *                   error_message, created_at
 *
 * Every Supabase call checks `{ data, error }` and FAILS LOUD on `error` — no
 * silent empty-array fallback that would mask a misconfigured boundary as "no
 * providers".
 *
 * Contract: implements `ProviderRepository`
 * (src/lib/repositories/interfaces.ts) — `getProviders(): Promise<ApiProvider[]>`,
 * `saveProvider(provider): Promise<void>`, and
 * `performHealthCheck(providerId): Promise<ApiProvider['status']>`.
 *
 * performHealthCheck mirrors `LocalProviderRepository.performHealthCheck` EXACTLY:
 * `'ERROR'` for an unknown provider id, else `'MOCK'`. It NEVER reports `'LIVE'`
 * without a real, implemented health-check execution. The Local impl persists
 * nothing, so this one computes + returns the status with no provider_health_checks
 * write (no fabricated liveness, no schema drift).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiProvider } from "../domain/models";
import type { ProviderRepository } from "./interfaces";

const TABLE_PROVIDERS = "api_providers";

const PROVIDER_COLUMNS =
  "id,name,type,status,base_url,secret_ref,last_checked,error_message,created_at";

/** Shape of an `api_providers` row as Supabase returns it (snake_case). */
interface ProviderRow {
  id: string;
  name: string;
  type: ApiProvider["type"];
  status: ApiProvider["status"];
  base_url: string | null;
  secret_ref: string | null;
  last_checked: string | null;
  error_message: string | null;
  created_at?: string;
}

/** Map a snake_case DB row → the camelCase domain `ApiProvider`. */
function rowToProvider(row: ProviderRow): ApiProvider {
  const provider: ApiProvider = {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    baseUrl: row.base_url ?? "",
    secretRef: row.secret_ref ?? "",
  };
  // `lastChecked` / `errorMessage` are optional on the domain type; only attach
  // them when the row carries a value so we never introduce a spurious key.
  if (row.last_checked != null) {
    provider.lastChecked = row.last_checked;
  }
  if (row.error_message != null) {
    provider.errorMessage = row.error_message;
  }
  return provider;
}

/** Map a camelCase domain `ApiProvider` → a snake_case `api_providers` row. */
function providerToRow(p: ApiProvider): ProviderRow {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    base_url: p.baseUrl,
    secret_ref: p.secretRef,
    last_checked: p.lastChecked ?? null,
    error_message: p.errorMessage ?? null,
  };
}

/** Throw with table+op context when a supabase call returns an error. */
function assertNoError(op: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`SUPABASE_PROVIDER_STORE_ERROR (${op}): ${error.message ?? "unknown error"}`);
  }
}

export class SupabaseProviderRepository implements ProviderRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getProviders(): Promise<ApiProvider[]> {
    const { data, error } = await this.client
      .from(TABLE_PROVIDERS)
      .select(PROVIDER_COLUMNS)
      .order("created_at", { ascending: false });
    assertNoError("getProviders", error);
    return ((data as ProviderRow[] | null) ?? []).map(rowToProvider);
  }

  /**
   * UPSERT a single row by primary key (`onConflict: id`). Maps the camelCase
   * `ApiProvider` → its snake_case row. FAILS LOUD on any `{ error }`.
   */
  async saveProvider(provider: ApiProvider): Promise<void> {
    const row = providerToRow(provider);
    const { error } = await this.client
      .from(TABLE_PROVIDERS)
      .upsert(row, { onConflict: "id" });
    assertNoError("saveProvider", error);
  }

  /**
   * Health check, mirroring `LocalProviderRepository.performHealthCheck` EXACTLY:
   * look the provider up by id; an UNKNOWN id yields `'ERROR'`, an existing one
   * yields `'MOCK'`. It NEVER claims `'LIVE'` without a real implemented check.
   * No provider_health_checks row is written (the Local persists nothing), so we
   * compute + return the status without fabricating liveness.
   */
  async performHealthCheck(providerId: string): Promise<ApiProvider["status"]> {
    const providers = await this.getProviders();
    const found = providers.find((p) => p.id === providerId);
    if (!found) return "ERROR";
    return "MOCK";
  }
}
