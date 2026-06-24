/**
 * Unit tests for the REAL server-side Supabase settings store
 * (feat/supabase-data-layer — the SETTINGS data vertical). Mirrors
 * supabaseProductRepository.test.ts.
 *
 * Contract under test: `SettingsRepository`
 *   getGenConfigs / saveGenConfigs           (array, onConflict product_id)
 *   getQualityConfigs / saveQualityConfigs   (array, onConflict product_id)
 *   getPersonalizationConfig / save…         (single row, onConflict name)
 *   getPodConfig / savePodConfig             (single row, onConflict id)
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload, opts) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method,
 *   - snake_case → camelCase mapping (read) and camelCase → snake_case (write),
 *   - the personalization rich-field __config envelope round-trips losslessly,
 *   - upsert uses the right onConflict key,
 *   - secret-REFERENCE names (not raw keys) survive the round-trip,
 *   - fail-loud on a supabase `error` (no silent empty fallback).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseSettingsRepository } from "../lib/repositories/supabaseSettingsRepository";
import type {
  GenerationConfig,
  QualityGateConfig,
  PersonalizationApiConfig,
  PodProviderConfig,
} from "../lib/domain/models";

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
 * Supports: select().order() (array reads), select().limit().maybeSingle() (single
 * reads), and upsert(payload, opts) (writes).
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
    chain.limit = () => chain;
    chain.maybeSingle = () => resolve();
    chain.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => resolve().then(onFulfilled, onRejected);
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        select: (_cols?: string) => builder(table, "select"),
        upsert: (payload: unknown, opts?: unknown) =>
          builder(table, "upsert", payload, opts),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const GEN_ROW = {
  product_id: "prod_1",
  num_initially_generated: 3,
  image_format: "png" as const,
  image_quality: "hd" as const,
  primary_provider: "OpenRouter" as const,
  primary_model: "model-primary",
  primary_secret_ref: "SECRET_REF_OPENROUTER_API_KEY",
  fallback_provider: "Gemini" as const,
  fallback_model: "model-fallback",
  fallback_llm: "llm-fallback",
  fallback_secret_ref: "SECRET_REF_GEMINI_FALLBACK",
};

function makeGenConfig(overrides: Partial<GenerationConfig> = {}): GenerationConfig {
  return {
    productId: "prod_1",
    numInitiallyGenerated: 3,
    imageFormat: "png",
    imageQuality: "hd",
    primaryProvider: "OpenRouter",
    primaryModel: "model-primary",
    primarySecretRef: "SECRET_REF_OPENROUTER_API_KEY",
    fallbackProvider: "Gemini",
    fallbackModel: "model-fallback",
    fallbackLLM: "llm-fallback",
    fallbackSecretRef: "SECRET_REF_GEMINI_FALLBACK",
    ...overrides,
  };
}

const QUALITY_ROW = {
  product_id: "prod_1",
  llm_provider: "OpenRouter" as const,
  model: "qa-model",
  secret_ref: "SECRET_REF_OPENROUTER_API_KEY",
  fallback_provider: "OpenAI" as const,
  fallback_model: "qa-fallback",
  fallback_secret_ref: "SECRET_REF_OPENAI_QA",
  qa_prompt: "Evaluate the image.",
  fault_tolerance: "low" as const,
  min_acceptance_score: 82,
  max_rejected_before_escalation: 2,
  escalation_email_template: "Subject: escalation",
};

function makeQualityConfig(
  overrides: Partial<QualityGateConfig> = {},
): QualityGateConfig {
  return {
    productId: "prod_1",
    llmProvider: "OpenRouter",
    model: "qa-model",
    secretRef: "SECRET_REF_OPENROUTER_API_KEY",
    fallbackProvider: "OpenAI",
    fallbackModel: "qa-fallback",
    fallbackSecretRef: "SECRET_REF_OPENAI_QA",
    qaPrompt: "Evaluate the image.",
    referenceImages: [],
    faultTolerance: "low",
    minAcceptanceScore: 82,
    maxRejectedBeforeEscalation: 2,
    escalationEmailTemplate: "Subject: escalation",
    ...overrides,
  };
}

function makePersonalizationConfig(
  overrides: Partial<PersonalizationApiConfig> = {},
): PersonalizationApiConfig {
  return {
    name: "FuFire API",
    baseUrl: "https://api.fufire.space",
    apiKeySecretRef: "SECRET_REF_FUFIRE",
    enabled: true,
    endpointPaths: {
      chronometryResolve: "/v1/chronometry/resolve",
      bazi: "/v1/calculate/bazi",
      baziTrace: "/v1/calculate/bazi/trace",
      wuxing: "/v1/calculate/wuxing",
    },
    defaultStandard: "CIVIL",
    defaultBoundary: "midnight",
    ambiguousTimePolicy: "earlier",
    nonexistentTimePolicy: "error",
    timeoutMs: 10000,
    retryCount: 3,
    healthStatus: "unknown",
    ...overrides,
  };
}

/** Build the personalization DB row shape this repo writes, for read fixtures. */
function personalizationRowFor(config: PersonalizationApiConfig) {
  return {
    name: config.name,
    api_url: config.baseUrl,
    secret_ref: config.apiKeySecretRef,
    birth_time_fallback: {
      __config: {
        enabled: config.enabled,
        endpointPaths: config.endpointPaths,
        defaultStandard: config.defaultStandard,
        defaultBoundary: config.defaultBoundary,
        ambiguousTimePolicy: config.ambiguousTimePolicy,
        nonexistentTimePolicy: config.nonexistentTimePolicy,
        timeoutMs: config.timeoutMs,
        retryCount: config.retryCount,
        healthStatus: config.healthStatus,
      },
    },
  };
}

const POD_ROW = {
  id: "pod-001",
  name: "Gelato POD Default Engine",
  base_url: "https://api.gelato.com/v2/orders",
  secret_ref: "SECRET_REF_GELATO_PROD_TOKEN",
  dispatch_mode: "draft" as const,
  product_uid_mappings: { "prod-001": "canvas-40x50" },
};

function makePodConfig(overrides: Partial<PodProviderConfig> = {}): PodProviderConfig {
  return {
    id: "pod-001",
    name: "Gelato POD Default Engine",
    baseUrl: "https://api.gelato.com/v2/orders",
    secretRef: "SECRET_REF_GELATO_PROD_TOKEN",
    dispatchMode: "draft",
    productUidMappings: { "prod-001": "canvas-40x50" },
    ...overrides,
  };
}

// ── generation_configs ──────────────────────────────────────────────────────

describe("SupabaseSettingsRepository — generation configs", () => {
  it("queries generation_configs and maps snake_case → camelCase", async () => {
    const { client, calls } = makeMockClient([{ data: [GEN_ROW], error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    const result = await repo.getGenConfigs();

    expect(calls[0].table).toBe("generation_configs");
    expect(calls[0].op).toBe("select");
    expect(result).toEqual([makeGenConfig()]);
  });

  it("upserts generation_configs with camel→snake mapping and onConflict: product_id", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    await repo.saveGenConfigs([makeGenConfig(), makeGenConfig({ productId: "prod_2" })]);

    expect(calls[0]).toMatchObject({ table: "generation_configs", op: "upsert" });
    expect(calls[0].opts).toMatchObject({ onConflict: "product_id" });
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(GEN_ROW);
    // Secret-REFERENCE names survive (never a raw key).
    expect(rows[0].primary_secret_ref).toBe("SECRET_REF_OPENROUTER_API_KEY");
    expect(rows[1].product_id).toBe("prod_2");
  });

  it("FAILS LOUD on a supabase error (no silent empty fallback)", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
    const repo = new SupabaseSettingsRepository(client);
    await expect(repo.getGenConfigs()).rejects.toThrow(/getGenConfigs.*boom/);
  });
});

// ── quality_gate_configs ────────────────────────────────────────────────────

describe("SupabaseSettingsRepository — quality configs", () => {
  it("queries quality_gate_configs and maps the row (referenceImages defaults to [])", async () => {
    const { client, calls } = makeMockClient([{ data: [QUALITY_ROW], error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    const result = await repo.getQualityConfigs();

    expect(calls[0].table).toBe("quality_gate_configs");
    expect(result).toEqual([makeQualityConfig()]);
    // Reference images live in a separate table; this read defaults to [].
    expect(result[0].referenceImages).toEqual([]);
  });

  it("upserts quality_gate_configs (no reference_images column) with onConflict: product_id", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    // Even with referenceImages present on the type, it is NOT written as a column.
    await repo.saveQualityConfigs([makeQualityConfig({ referenceImages: ["a", "b"] })]);

    expect(calls[0]).toMatchObject({ table: "quality_gate_configs", op: "upsert" });
    expect(calls[0].opts).toMatchObject({ onConflict: "product_id" });
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual(QUALITY_ROW);
    expect("reference_images" in rows[0]).toBe(false);
    expect("referenceImages" in rows[0]).toBe(false);
  });

  it("FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
    const repo = new SupabaseSettingsRepository(client);
    await expect(repo.saveQualityConfigs([makeQualityConfig()])).rejects.toThrow(
      /saveQualityConfigs.*rls denied/,
    );
  });
});

// ── personalization_api_configs (single row) ────────────────────────────────

describe("SupabaseSettingsRepository — personalization config (single row)", () => {
  it("reads the single row and reconstructs the rich config from the __config envelope", async () => {
    const config = makePersonalizationConfig();
    const { client, calls } = makeMockClient([
      { data: personalizationRowFor(config), error: null },
    ]);
    const repo = new SupabaseSettingsRepository(client);
    const result = await repo.getPersonalizationConfig();

    expect(calls[0].table).toBe("personalization_api_configs");
    expect(result).toEqual(config);
  });

  it("round-trips losslessly: saved row reads back as the identical config", async () => {
    const config = makePersonalizationConfig({ enabled: false, timeoutMs: 5000 });
    // 1) save → capture the row the repo writes.
    const save = makeMockClient([{ data: null, error: null }]);
    const writeRepo = new SupabaseSettingsRepository(save.client);
    await writeRepo.savePersonalizationConfig(config);

    expect(save.calls[0]).toMatchObject({
      table: "personalization_api_configs",
      op: "upsert",
    });
    expect(save.calls[0].opts).toMatchObject({ onConflict: "name" });
    const writtenRow = save.calls[0].payload as Record<string, unknown>;

    // 2) feed that exact written row back into a read.
    const read = makeMockClient([{ data: writtenRow, error: null }]);
    const readRepo = new SupabaseSettingsRepository(read.client);
    expect(await readRepo.getPersonalizationConfig()).toEqual(config);
  });

  it("throws when no row exists (never fabricates a default config)", async () => {
    const { client } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    await expect(repo.getPersonalizationConfig()).rejects.toThrow(
      /getPersonalizationConfig/,
    );
  });

  it("FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "kaboom" } }]);
    const repo = new SupabaseSettingsRepository(client);
    await expect(repo.savePersonalizationConfig(makePersonalizationConfig())).rejects.toThrow(
      /savePersonalizationConfig.*kaboom/,
    );
  });
});

// ── pod_provider_configs (single row) ───────────────────────────────────────

describe("SupabaseSettingsRepository — pod config (single row)", () => {
  it("reads the single row and maps snake_case → camelCase", async () => {
    const { client, calls } = makeMockClient([{ data: POD_ROW, error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    const result = await repo.getPodConfig();

    expect(calls[0].table).toBe("pod_provider_configs");
    expect(result).toEqual(makePodConfig());
  });

  it("upserts the single pod row with onConflict: id (secret-ref preserved)", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    await repo.savePodConfig(makePodConfig());

    expect(calls[0]).toMatchObject({ table: "pod_provider_configs", op: "upsert" });
    expect(calls[0].opts).toMatchObject({ onConflict: "id" });
    const row = calls[0].payload as Record<string, unknown>;
    expect(row).toEqual(POD_ROW);
    expect(row.secret_ref).toBe("SECRET_REF_GELATO_PROD_TOKEN");
  });

  it("throws when no pod row exists", async () => {
    const { client } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseSettingsRepository(client);
    await expect(repo.getPodConfig()).rejects.toThrow(/getPodConfig/);
  });

  it("FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "nope" } }]);
    const repo = new SupabaseSettingsRepository(client);
    await expect(repo.getPodConfig()).rejects.toThrow(/getPodConfig.*nope/);
  });
});
