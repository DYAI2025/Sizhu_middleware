/**
 * Unit tests for the REAL server-side Supabase artifact store
 * (feat/supabase-data-layer — mirrors `supabaseProductRepository.test.ts`).
 *
 * Contract under test: THIS branch's `ArtifactRepository`
 * (getImageArtifacts(): Promise<ImageArtifact[]>, saveImageArtifacts(artifacts): Promise<void>).
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload, opts) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method,
 *   - snake_case → camelCase mapping (read) and camelCase → snake_case (write),
 *   - optional rejectionReason / nullable FK + qa columns handling,
 *   - upsert uses onConflict: "id",
 *   - fail-loud on a supabase `error` (no silent empty fallback).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseArtifactRepository } from "../lib/repositories/supabaseArtifactRepository";
import type { ImageArtifact } from "../types";

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

const ARTIFACT_ROW = {
  id: "art_1",
  workflow_run_id: "run_1",
  // Use a distinctive order number so a mutation hardcoding a value would diverge.
  order_number: "ORD-9001",
  product_id: "prod_1",
  template_id: "tpl_1",
  iteration: 2,
  candidate_index: 3,
  storage_path: "data:image/png;base64,AAAA",
  status: "accepted" as const,
  qa_score: 87,
  rejection_reason: "too dark",
  qa_result_json: '{"score":87}',
  generated_at: "2026-01-01T00:00:00.000Z",
};

function makeArtifact(overrides: Partial<ImageArtifact> = {}): ImageArtifact {
  return {
    id: "art_1",
    workflowRunId: "run_1",
    orderNumber: "ORD-9001",
    productId: "prod_1",
    templateId: "tpl_1",
    iteration: 2,
    candidateIndex: 3,
    storagePath: "data:image/png;base64,AAAA",
    status: "accepted",
    qaScore: 87,
    rejectionReason: "too dark",
    qaResultJson: '{"score":87}',
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SupabaseArtifactRepository", () => {
  describe("getImageArtifacts", () => {
    it("queries image_artifacts and maps snake_case → camelCase", async () => {
      const { client, calls } = makeMockClient([{ data: [ARTIFACT_ROW], error: null }]);
      const repo = new SupabaseArtifactRepository(client);
      const result = await repo.getImageArtifacts();

      expect(calls[0].table).toBe("image_artifacts");
      expect(calls[0].op).toBe("select");
      expect(result).toEqual([
        {
          id: "art_1",
          workflowRunId: "run_1",
          orderNumber: "ORD-9001",
          productId: "prod_1",
          templateId: "tpl_1",
          iteration: 2,
          candidateIndex: 3,
          storagePath: "data:image/png;base64,AAAA",
          status: "accepted",
          qaScore: 87,
          rejectionReason: "too dark",
          qaResultJson: '{"score":87}',
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("maps a null rejection_reason to an absent rejectionReason (no spurious key)", async () => {
      const { client } = makeMockClient([
        {
          data: [
            {
              ...ARTIFACT_ROW,
              rejection_reason: null,
              qa_score: null,
              qa_result_json: null,
              workflow_run_id: null,
              product_id: null,
              template_id: null,
            },
          ],
          error: null,
        },
      ]);
      const repo = new SupabaseArtifactRepository(client);
      const [artifact] = await repo.getImageArtifacts();
      expect("rejectionReason" in artifact).toBe(false);
      // Nullable DB columns collapse to the non-optional domain defaults.
      expect(artifact.qaScore).toBe(0);
      expect(artifact.qaResultJson).toBe("");
      expect(artifact.workflowRunId).toBe("");
      expect(artifact.productId).toBe("");
      expect(artifact.templateId).toBe("");
    });

    it("returns [] for a null data set without throwing", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseArtifactRepository(client);
      await expect(repo.getImageArtifacts()).resolves.toEqual([]);
    });

    it("FAILS LOUD on a supabase error (no silent empty fallback)", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseArtifactRepository(client);
      await expect(repo.getImageArtifacts()).rejects.toThrow(/getImageArtifacts.*boom/);
    });
  });

  describe("saveImageArtifacts", () => {
    it("upserts image_artifacts with camel→snake mapping and onConflict: id", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseArtifactRepository(client);
      await repo.saveImageArtifacts([makeArtifact({ id: "art_a" }), makeArtifact({ id: "art_b" })]);

      expect(calls[0]).toMatchObject({ table: "image_artifacts", op: "upsert" });
      expect(calls[0].opts).toMatchObject({ onConflict: "id" });

      const rows = calls[0].payload as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        id: "art_a",
        workflow_run_id: "run_1",
        order_number: "ORD-9001",
        product_id: "prod_1",
        template_id: "tpl_1",
        iteration: 2,
        candidate_index: 3,
        storage_path: "data:image/png;base64,AAAA",
        status: "accepted",
        qa_score: 87,
        rejection_reason: "too dark",
        qa_result_json: '{"score":87}',
        generated_at: "2026-01-01T00:00:00.000Z",
      });
      expect(rows[1].id).toBe("art_b");
    });

    it("maps an absent rejectionReason to a null rejection_reason column", async () => {
      const { client, calls } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseArtifactRepository(client);
      const artifact = makeArtifact();
      delete artifact.rejectionReason;
      await repo.saveImageArtifacts([artifact]);
      const rows = calls[0].payload as Array<Record<string, unknown>>;
      expect(rows[0].rejection_reason).toBeNull();
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
      const repo = new SupabaseArtifactRepository(client);
      await expect(repo.saveImageArtifacts([makeArtifact()])).rejects.toThrow(
        /saveImageArtifacts.*rls denied/,
      );
    });
  });
});
