/**
 * Real server-side Supabase persistence for image artifacts
 * (feat/supabase-data-layer — mirrors the `supabaseProductRepository.ts` REFERENCE
 * pattern for the ARTIFACTS data vertical).
 *
 * SECURITY: this class is constructed ONLY on the server with a service-role
 * supabase client (see `server/index.ts`). The service-role key never reaches the
 * browser bundle (no VITE_ prefix; the client is built server-side and injected
 * here). This module takes an already-built `SupabaseClient` so it stays
 * test-mockable and free of any key-reading itself. Mirrors
 * `supabaseProductRepository.ts` exactly.
 *
 * Column mapping (live table verified, supabase-schema.sql `image_artifacts`):
 *   id, workflow_run_id, order_number, product_id, template_id, iteration,
 *   candidate_index, storage_path, status, qa_score, rejection_reason,
 *   qa_result_json, generated_at
 *
 * Note: the `ImageArtifact` type carries OPTIONAL provenance fields (`modelUsed`,
 * `promptVarsProvenance`, added for REQ-LGQ-006) that have NO column in the live
 * `image_artifacts` table yet. To stay faithful to the live table (exactly like the
 * Products reference, which maps only real columns) those two fields are NOT
 * round-tripped here — they are intentionally out of scope until the schema gains
 * the columns. Add their column mapping in the same place the schema gains them.
 *
 * Every Supabase call checks `{ data, error }` and FAILS LOUD on `error` — no
 * silent empty-array fallback that would mask a misconfigured boundary as "no
 * artifacts".
 *
 * Contract: implements THIS branch's `ArtifactRepository`
 * (src/lib/repositories/interfaces.ts) — `getImageArtifacts(): Promise<ImageArtifact[]>`
 * and `saveImageArtifacts(artifacts): Promise<void>`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageArtifact } from "../../types";
import type { ArtifactRepository } from "./interfaces";

const TABLE_ARTIFACTS = "image_artifacts";

const ARTIFACT_COLUMNS =
  "id,workflow_run_id,order_number,product_id,template_id,iteration,candidate_index,storage_path,status,qa_score,rejection_reason,qa_result_json,generated_at";

/** Shape of an `image_artifacts` row as Supabase returns it (snake_case). */
interface ArtifactRow {
  id: string;
  workflow_run_id: string | null;
  order_number: string;
  product_id: string | null;
  template_id: string | null;
  iteration: number;
  candidate_index: number;
  storage_path: string;
  status: ImageArtifact["status"];
  qa_score: number | null;
  rejection_reason: string | null;
  qa_result_json: string | null;
  generated_at: string;
}

/** Map a snake_case DB row → the camelCase domain `ImageArtifact`. */
function rowToArtifact(row: ArtifactRow): ImageArtifact {
  const artifact: ImageArtifact = {
    id: row.id,
    // The FK columns are nullable in the DB; the domain type holds them as
    // non-optional strings, so a null collapses to "" (mirrors the Products
    // null-external_variant_id → "" rule).
    workflowRunId: row.workflow_run_id ?? "",
    orderNumber: row.order_number,
    productId: row.product_id ?? "",
    templateId: row.template_id ?? "",
    iteration: row.iteration,
    candidateIndex: row.candidate_index,
    storagePath: row.storage_path,
    status: row.status,
    qaScore: row.qa_score ?? 0,
    qaResultJson: row.qa_result_json ?? "",
    generatedAt: row.generated_at,
  };
  // `rejectionReason` is optional on the domain type; only attach it when the row
  // actually carries one so we don't introduce a spurious `undefined`.
  if (row.rejection_reason != null) {
    artifact.rejectionReason = row.rejection_reason;
  }
  return artifact;
}

/** Map a camelCase domain `ImageArtifact` → a snake_case `image_artifacts` row. */
function artifactToRow(a: ImageArtifact): ArtifactRow {
  return {
    id: a.id,
    workflow_run_id: a.workflowRunId,
    order_number: a.orderNumber,
    product_id: a.productId,
    template_id: a.templateId,
    iteration: a.iteration,
    candidate_index: a.candidateIndex,
    storage_path: a.storagePath,
    status: a.status,
    qa_score: a.qaScore,
    rejection_reason: a.rejectionReason ?? null,
    qa_result_json: a.qaResultJson,
    generated_at: a.generatedAt,
  };
}

/** Throw with table+op context when a supabase call returns an error. */
function assertNoError(op: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`SUPABASE_ARTIFACT_STORE_ERROR (${op}): ${error.message ?? "unknown error"}`);
  }
}

export class SupabaseArtifactRepository implements ArtifactRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getImageArtifacts(): Promise<ImageArtifact[]> {
    const { data, error } = await this.client
      .from(TABLE_ARTIFACTS)
      .select(ARTIFACT_COLUMNS)
      .order("generated_at", { ascending: false });
    assertNoError("getImageArtifacts", error);
    return ((data as ArtifactRow[] | null) ?? []).map(rowToArtifact);
  }

  /**
   * Bulk UPSERT all rows by primary key (`onConflict: id`). Maps each camelCase
   * `ImageArtifact` → its snake_case row. FAILS LOUD on any `{ error }`.
   */
  async saveImageArtifacts(artifacts: ImageArtifact[]): Promise<void> {
    const rows = artifacts.map(artifactToRow);
    const { error } = await this.client
      .from(TABLE_ARTIFACTS)
      .upsert(rows, { onConflict: "id" });
    assertNoError("saveImageArtifacts", error);
  }
}
