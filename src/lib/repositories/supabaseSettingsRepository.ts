/**
 * Real server-side Supabase persistence for the SETTINGS data vertical — the four
 * config tables (feat/supabase-data-layer). Mirrors `supabaseProductRepository.ts`.
 *
 * SECURITY: constructed ONLY on the server with a service-role supabase client
 * (see `server/index.ts`). The service-role key never reaches the browser bundle.
 * This module takes an already-built `SupabaseClient` so it stays test-mockable and
 * reads no key itself.
 *
 * SECRET-REF INDIRECTION: these configs hold secret-REFERENCE names
 * (e.g. `SECRET_REF_OPENROUTER_API_KEY`), NEVER raw API keys — the indirection is
 * preserved end-to-end; the actual key is read elsewhere via `process.env[secretRef]`.
 *
 * Column mapping (authoritative: supabase-schema.sql):
 *   generation_configs        (PK product_id)  → GenerationConfig[]   upsert onConflict product_id
 *   quality_gate_configs      (PK product_id)  → QualityGateConfig[]  upsert onConflict product_id
 *   personalization_api_configs (PK name)      → PersonalizationApiConfig (single row)
 *   pod_provider_configs      (PK id)          → PodProviderConfig (single row)
 *
 * SCHEMA-GAP HANDLING (documented, deliberate — do not "fix" silently):
 *   - `quality_gate_configs` has NO reference_images column (reference images live in
 *     the `reference_images` table). `referenceImages` is therefore NOT persisted here
 *     and defaults to `[]` on read — mirroring the Local seed (`referenceImages: []`).
 *   - `generation_configs` has NO max_images_per_run / max_usd_per_run columns; those
 *     optional cost-cap fields are not persisted by this table (run-path concern).
 *   - `personalization_api_configs` is a NARROW table (name, api_url, secret_ref,
 *     birth_time_fallback) while `PersonalizationApiConfig` is RICH. To round-trip the
 *     full type LOSSLESSLY without inventing columns, the named columns carry their
 *     direct fields and ALL remaining rich fields are packed into the `birth_time_fallback`
 *     JSONB column under an explicit `__config` envelope key (a reversible escape, not a
 *     positional heuristic). The DB-shaped birth-time fallback stays alongside it.
 *
 * Every Supabase call checks `{ data, error }` and FAILS LOUD on `error` — no silent
 * empty fallback that would mask a misconfigured boundary as "no config".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GenerationConfig,
  QualityGateConfig,
  PersonalizationApiConfig,
  PodProviderConfig,
} from "../domain/models";
import type { SettingsRepository } from "./interfaces";

const TABLE_GEN = "generation_configs";
const TABLE_QUALITY = "quality_gate_configs";
const TABLE_PERSONALIZATION = "personalization_api_configs";
const TABLE_POD = "pod_provider_configs";

const GEN_COLUMNS =
  "product_id,num_initially_generated,image_format,image_quality,primary_provider,primary_model,primary_secret_ref,fallback_provider,fallback_model,fallback_llm,fallback_secret_ref";

const QUALITY_COLUMNS =
  "product_id,llm_provider,model,secret_ref,fallback_provider,fallback_model,fallback_secret_ref,qa_prompt,fault_tolerance,min_acceptance_score,max_rejected_before_escalation,escalation_email_template";

const PERSONALIZATION_COLUMNS = "name,api_url,secret_ref,birth_time_fallback";

const POD_COLUMNS = "id,name,base_url,secret_ref,dispatch_mode,product_uid_mappings";

/** Throw with table+op context when a supabase call returns an error (fail loud). */
function assertNoError(op: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(
      `SUPABASE_SETTINGS_STORE_ERROR (${op}): ${error.message ?? "unknown error"}`,
    );
  }
}

// ── generation_configs ──────────────────────────────────────────────────────

interface GenRow {
  product_id: string;
  num_initially_generated: number;
  image_format: GenerationConfig["imageFormat"];
  image_quality: GenerationConfig["imageQuality"];
  primary_provider: GenerationConfig["primaryProvider"];
  primary_model: string;
  primary_secret_ref: string;
  fallback_provider: GenerationConfig["fallbackProvider"];
  fallback_model: string;
  fallback_llm: string;
  fallback_secret_ref: string;
}

function genRowToConfig(row: GenRow): GenerationConfig {
  return {
    productId: row.product_id,
    numInitiallyGenerated: row.num_initially_generated,
    imageFormat: row.image_format,
    imageQuality: row.image_quality,
    primaryProvider: row.primary_provider,
    primaryModel: row.primary_model,
    primarySecretRef: row.primary_secret_ref,
    fallbackProvider: row.fallback_provider,
    fallbackModel: row.fallback_model,
    fallbackLLM: row.fallback_llm,
    fallbackSecretRef: row.fallback_secret_ref,
  };
}

function genConfigToRow(c: GenerationConfig): GenRow {
  return {
    product_id: c.productId,
    num_initially_generated: c.numInitiallyGenerated,
    image_format: c.imageFormat,
    image_quality: c.imageQuality,
    primary_provider: c.primaryProvider,
    primary_model: c.primaryModel,
    primary_secret_ref: c.primarySecretRef,
    fallback_provider: c.fallbackProvider,
    fallback_model: c.fallbackModel,
    fallback_llm: c.fallbackLLM,
    fallback_secret_ref: c.fallbackSecretRef,
  };
}

// ── quality_gate_configs ────────────────────────────────────────────────────

interface QualityRow {
  product_id: string;
  llm_provider: QualityGateConfig["llmProvider"];
  model: string;
  secret_ref: string;
  fallback_provider: QualityGateConfig["fallbackProvider"];
  fallback_model: string;
  fallback_secret_ref: string;
  qa_prompt: string;
  fault_tolerance: QualityGateConfig["faultTolerance"];
  min_acceptance_score: number;
  max_rejected_before_escalation: number;
  escalation_email_template: string;
}

function qualityRowToConfig(row: QualityRow): QualityGateConfig {
  return {
    productId: row.product_id,
    llmProvider: row.llm_provider,
    model: row.model,
    secretRef: row.secret_ref,
    fallbackProvider: row.fallback_provider,
    fallbackModel: row.fallback_model,
    fallbackSecretRef: row.fallback_secret_ref,
    qaPrompt: row.qa_prompt,
    // Reference images live in the `reference_images` table — not a column here.
    // Default to [] so the type round-trips (mirrors the Local seed).
    referenceImages: [],
    faultTolerance: row.fault_tolerance,
    minAcceptanceScore: row.min_acceptance_score,
    maxRejectedBeforeEscalation: row.max_rejected_before_escalation,
    escalationEmailTemplate: row.escalation_email_template,
  };
}

function qualityConfigToRow(c: QualityGateConfig): QualityRow {
  return {
    product_id: c.productId,
    llm_provider: c.llmProvider,
    model: c.model,
    secret_ref: c.secretRef,
    fallback_provider: c.fallbackProvider,
    fallback_model: c.fallbackModel,
    fallback_secret_ref: c.fallbackSecretRef,
    qa_prompt: c.qaPrompt,
    fault_tolerance: c.faultTolerance,
    min_acceptance_score: c.minAcceptanceScore,
    max_rejected_before_escalation: c.maxRejectedBeforeEscalation,
    escalation_email_template: c.escalationEmailTemplate,
  };
}

// ── personalization_api_configs (single row) ────────────────────────────────
//
// The table is narrow; the type is rich. We map the direct fields to their named
// columns and pack the remaining rich fields into the `birth_time_fallback` JSONB
// column under a `__config` envelope so the full type round-trips losslessly.

/** Shape of the JSONB `birth_time_fallback` column we read/write. */
interface PersonalizationJsonb {
  /** The DB-native birth-time fallback record (kept as-is for any DB consumer). */
  birth_time?: string;
  birth_time_known?: boolean;
  birth_time_source?: string;
  /** Reversible envelope carrying the rich type fields with no dedicated column. */
  __config?: {
    enabled: boolean;
    endpointPaths: PersonalizationApiConfig["endpointPaths"];
    defaultStandard: string;
    defaultBoundary: string;
    ambiguousTimePolicy: PersonalizationApiConfig["ambiguousTimePolicy"];
    nonexistentTimePolicy: PersonalizationApiConfig["nonexistentTimePolicy"];
    timeoutMs: number;
    retryCount: number;
    healthStatus?: PersonalizationApiConfig["healthStatus"];
  };
}

interface PersonalizationRow {
  name: string;
  api_url: string;
  secret_ref: string;
  birth_time_fallback: PersonalizationJsonb;
}

function personalizationRowToConfig(row: PersonalizationRow): PersonalizationApiConfig {
  const env = row.birth_time_fallback?.__config;
  if (!env) {
    // Fail loud: a row that predates / drifts from the envelope contract would
    // silently lose rich config. Surface it rather than fabricate defaults.
    throw new Error(
      "SUPABASE_SETTINGS_STORE_ERROR (getPersonalizationConfig): personalization row is missing its __config envelope",
    );
  }
  const config: PersonalizationApiConfig = {
    name: row.name,
    baseUrl: row.api_url,
    apiKeySecretRef: row.secret_ref,
    enabled: env.enabled,
    endpointPaths: env.endpointPaths,
    defaultStandard: env.defaultStandard,
    defaultBoundary: env.defaultBoundary,
    ambiguousTimePolicy: env.ambiguousTimePolicy,
    nonexistentTimePolicy: env.nonexistentTimePolicy,
    timeoutMs: env.timeoutMs,
    retryCount: env.retryCount,
  };
  if (env.healthStatus != null) {
    config.healthStatus = env.healthStatus;
  }
  return config;
}

function personalizationConfigToRow(c: PersonalizationApiConfig): PersonalizationRow {
  const envelope: PersonalizationJsonb["__config"] = {
    enabled: c.enabled,
    endpointPaths: c.endpointPaths,
    defaultStandard: c.defaultStandard,
    defaultBoundary: c.defaultBoundary,
    ambiguousTimePolicy: c.ambiguousTimePolicy,
    nonexistentTimePolicy: c.nonexistentTimePolicy,
    timeoutMs: c.timeoutMs,
    retryCount: c.retryCount,
  };
  if (c.healthStatus != null) {
    envelope.healthStatus = c.healthStatus;
  }
  return {
    name: c.name,
    api_url: c.baseUrl,
    secret_ref: c.apiKeySecretRef,
    birth_time_fallback: { __config: envelope },
  };
}

// ── pod_provider_configs (single row) ───────────────────────────────────────

interface PodRow {
  id: string;
  name: string;
  base_url: string;
  secret_ref: string;
  dispatch_mode: PodProviderConfig["dispatchMode"];
  product_uid_mappings: Record<string, string>;
}

function podRowToConfig(row: PodRow): PodProviderConfig {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    secretRef: row.secret_ref,
    dispatchMode: row.dispatch_mode,
    productUidMappings: row.product_uid_mappings ?? {},
  };
}

function podConfigToRow(c: PodProviderConfig): PodRow {
  return {
    id: c.id,
    name: c.name,
    base_url: c.baseUrl,
    secret_ref: c.secretRef,
    dispatch_mode: c.dispatchMode,
    product_uid_mappings: c.productUidMappings ?? {},
  };
}

export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  // ── gen configs (array) ───────────────────────────────────────────────────

  async getGenConfigs(): Promise<GenerationConfig[]> {
    const { data, error } = await this.client
      .from(TABLE_GEN)
      .select(GEN_COLUMNS)
      .order("product_id", { ascending: true });
    assertNoError("getGenConfigs", error);
    return ((data as GenRow[] | null) ?? []).map(genRowToConfig);
  }

  async saveGenConfigs(configs: GenerationConfig[]): Promise<void> {
    const rows = configs.map(genConfigToRow);
    const { error } = await this.client
      .from(TABLE_GEN)
      .upsert(rows, { onConflict: "product_id" });
    assertNoError("saveGenConfigs", error);
  }

  // ── quality configs (array) ───────────────────────────────────────────────

  async getQualityConfigs(): Promise<QualityGateConfig[]> {
    const { data, error } = await this.client
      .from(TABLE_QUALITY)
      .select(QUALITY_COLUMNS)
      .order("product_id", { ascending: true });
    assertNoError("getQualityConfigs", error);
    return ((data as QualityRow[] | null) ?? []).map(qualityRowToConfig);
  }

  async saveQualityConfigs(configs: QualityGateConfig[]): Promise<void> {
    const rows = configs.map(qualityConfigToRow);
    const { error } = await this.client
      .from(TABLE_QUALITY)
      .upsert(rows, { onConflict: "product_id" });
    assertNoError("saveQualityConfigs", error);
  }

  // ── personalization config (single row) ───────────────────────────────────

  async getPersonalizationConfig(): Promise<PersonalizationApiConfig> {
    const { data, error } = await this.client
      .from(TABLE_PERSONALIZATION)
      .select(PERSONALIZATION_COLUMNS)
      .limit(1)
      .maybeSingle();
    assertNoError("getPersonalizationConfig", error);
    if (!data) {
      throw new Error(
        "SUPABASE_SETTINGS_STORE_ERROR (getPersonalizationConfig): no personalization config row found",
      );
    }
    return personalizationRowToConfig(data as PersonalizationRow);
  }

  async savePersonalizationConfig(config: PersonalizationApiConfig): Promise<void> {
    const row = personalizationConfigToRow(config);
    const { error } = await this.client
      .from(TABLE_PERSONALIZATION)
      .upsert(row, { onConflict: "name" });
    assertNoError("savePersonalizationConfig", error);
  }

  // ── pod config (single row) ───────────────────────────────────────────────

  async getPodConfig(): Promise<PodProviderConfig> {
    const { data, error } = await this.client
      .from(TABLE_POD)
      .select(POD_COLUMNS)
      .limit(1)
      .maybeSingle();
    assertNoError("getPodConfig", error);
    if (!data) {
      throw new Error(
        "SUPABASE_SETTINGS_STORE_ERROR (getPodConfig): no pod provider config row found",
      );
    }
    return podRowToConfig(data as PodRow);
  }

  async savePodConfig(config: PodProviderConfig): Promise<void> {
    const row = podConfigToRow(config);
    const { error } = await this.client
      .from(TABLE_POD)
      .upsert(row, { onConflict: "id" });
    assertNoError("savePodConfig", error);
  }
}
