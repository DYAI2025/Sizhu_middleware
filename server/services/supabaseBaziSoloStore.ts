/**
 * SupabaseBaZiSoloStore — feature `bazi-baci-solo-no-mock-mvp` (REQ-F-003 / REQ-F-007, BLK-002).
 *
 * The DURABLE persistence implementation of the {@link BaZiSoloStore} seam. Where
 * {@link InMemoryBaZiSoloStore} loses every run on process exit, this store writes to
 * Postgres (via Supabase) so a persisted run SURVIVES A RESTART — read back by a fresh
 * process / a fresh client instance, the load-bearing acceptance signal for BLK-002.
 *
 * SERVER-ONLY. It is constructed with a SERVICE-ROLE Supabase client (composed in
 * server/index.ts from the env the secret-ref NAMES, never the bare key) and must never
 * be imported into the browser bundle: the service-role key bypasses RLS. The key itself
 * is never read, logged, or echoed here — only the injected client is held.
 *
 * Storage shape (adapted to the user's APPLIED schema, verified via REST — the raw bundle
 * and the artifact were MERGED into one `bazi_raw_bundle` table):
 *   - `bazi_run`         — one row per run: id (text PK), status, sim_order (jsonb),
 *                          blocked_reason (text), created_at (timestamptz).
 *   - `bazi_raw_bundle`  — one row per run: run_id (text), requests (jsonb), responses
 *                          (jsonb), svg (text), codepoint_manifest (jsonb), qa_state (jsonb).
 *                          There is NO gateway_issues / warnings column — they are FOLDED
 *                          into the durable `qa_state` jsonb (along with failedGates / the
 *                          font PostScript name / the block reason) so nothing is dropped.
 *
 * Fail-loud: EVERY supabase `{ error }` is thrown as `SUPABASE_BAZI_STORE_ERROR (<op>): …`
 * — a write/read fault is never swallowed into a silent partial success.
 *
 * Idempotent by run id: both rows are UPSERTed on their run-id conflict target, so a
 * re-saved run UPDATES in place rather than duplicating (saveRun is safe to retry).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { GatewayIssue } from "../../src/lib/apiConnections/types";
import {
  type BaZiSoloStore,
  type BaziSoloRunRecord,
  type BaziSoloRunStatus,
} from "./baziSoloPipeline";
import type { BaziSoloReadyGate } from "./baziSoloReadyState";
import type { BaziSoloRunResult } from "./baziSoloRunService";
import type { RenderBaziSoloResult } from "./baziSoloRenderer";

/** Logical table names — single source so a schema rename is a one-line change here. */
export const BAZI_RUN_TABLE = "bazi_run";
export const BAZI_RAW_BUNDLE_TABLE = "bazi_raw_bundle";

/** The non-column run-state we FOLD into the durable `qa_state` jsonb (no dedicated columns). */
interface BaziSoloQaState {
  gatewayIssues: GatewayIssue[];
  warnings: string[];
  failedGates: BaziSoloReadyGate[] | null;
  fontPostscriptName: string | null;
  reason: string | null;
}

/** The `bazi_run` row shape we read back. */
interface BaziRunRow {
  id: string;
  status: string;
  sim_order: BaziSoloRunRecord["simOrder"];
  blocked_reason: string | null;
  created_at: string | null;
}

/** The `bazi_raw_bundle` row shape we read back (raw bundle + artifact merged). */
interface BaziRawBundleRow {
  run_id: string;
  requests: BaziSoloRunResult["rawBundle"]["requests"];
  responses: BaziSoloRunResult["rawBundle"]["responses"];
  svg: string | null;
  codepoint_manifest: RenderBaziSoloResult["codepointManifest"] | null;
  qa_state: BaziSoloQaState | null;
}

/** Throw a deterministic, greppable error for any supabase `{ error }` — never swallow it. */
function failLoud(op: string, error: { message?: string } | null): never {
  throw new Error(`SUPABASE_BAZI_STORE_ERROR (${op}): ${error?.message ?? "unknown error"}`);
}

/**
 * Durable Supabase-backed {@link BaZiSoloStore}. Constructed SERVER-SIDE with a
 * service-role client; the same record round-trips out of two upserted rows.
 */
export class SupabaseBaZiSoloStore implements BaZiSoloStore {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Persist one run idempotently: UPSERT the `bazi_run` header AND the merged
   * `bazi_raw_bundle` row (raw bundle + artifact + the folded qa_state). Both upserts
   * conflict on their run-id target, so a retry updates in place. Fail-loud on either error.
   */
  async saveRun(record: BaziSoloRunRecord): Promise<void> {
    const qaState: BaziSoloQaState = {
      gatewayIssues: record.rawBundle.gatewayIssues,
      warnings: record.rawBundle.warnings,
      failedGates: record.failedGates ?? null,
      fontPostscriptName: record.artifact?.fontPostscriptName ?? null,
      reason: record.reason ?? null,
    };

    const { error: runError } = await this.client.from(BAZI_RUN_TABLE).upsert(
      {
        id: record.runId,
        status: record.status,
        sim_order: record.simOrder,
        blocked_reason: record.reason ?? null,
        created_at: record.createdAt ?? null,
      },
      { onConflict: "id" },
    );
    if (runError) failLoud("saveRun:bazi_run", runError);

    // `bazi_raw_bundle.run_id` has NO unique constraint (PK is the identity `id`), so an
    // ON CONFLICT(run_id) upsert is impossible without DDL we cannot apply. Idempotent
    // without DDL: delete any prior row for this run, then insert. (The pipeline saves once
    // per terminal stage; this also makes a retry/re-save replace rather than duplicate.)
    const { error: delError } = await this.client
      .from(BAZI_RAW_BUNDLE_TABLE)
      .delete()
      .eq("run_id", record.runId);
    if (delError) failLoud("saveRun:bazi_raw_bundle:delete", delError);

    const { error: bundleError } = await this.client.from(BAZI_RAW_BUNDLE_TABLE).insert({
      run_id: record.runId,
      requests: record.rawBundle.requests,
      responses: record.rawBundle.responses,
      svg: record.artifact?.svg ?? null,
      codepoint_manifest: record.artifact?.codepointManifest ?? null,
      qa_state: qaState,
    });
    if (bundleError) failLoud("saveRun:bazi_raw_bundle:insert", bundleError);
  }

  /**
   * Reconstruct the full {@link BaziSoloRunRecord} from its `bazi_run` header + the
   * merged `bazi_raw_bundle` row. `gatewayIssues` / `warnings` / `failedGates` / the
   * artifact's font name + block reason are rebuilt OUT of `qa_state`; the artifact is
   * present only when an SVG was persisted. Returns null when no `bazi_run` row exists.
   */
  async getRun(id: string): Promise<BaziSoloRunRecord | null> {
    const { data: runRow, error: runError } = await this.client
      .from(BAZI_RUN_TABLE)
      .select("id, status, sim_order, blocked_reason, created_at")
      .eq("id", id)
      .maybeSingle<BaziRunRow>();
    if (runError) failLoud("getRun:bazi_run", runError);
    if (!runRow) return null;

    const { data: bundleRow, error: bundleError } = await this.client
      .from(BAZI_RAW_BUNDLE_TABLE)
      .select("run_id, requests, responses, svg, codepoint_manifest, qa_state")
      .eq("run_id", id)
      .maybeSingle<BaziRawBundleRow>();
    if (bundleError) failLoud("getRun:bazi_raw_bundle", bundleError);

    const qaState: BaziSoloQaState = bundleRow?.qa_state ?? {
      gatewayIssues: [],
      warnings: [],
      failedGates: null,
      fontPostscriptName: null,
      reason: null,
    };

    const record: BaziSoloRunRecord = {
      runId: runRow.id,
      status: runRow.status as BaziSoloRunStatus,
      simOrder: runRow.sim_order,
      rawBundle: {
        requests: bundleRow?.requests ?? [],
        responses: bundleRow?.responses ?? [],
        gatewayIssues: qaState.gatewayIssues ?? [],
        warnings: qaState.warnings ?? [],
      },
    };

    // Optional fields are added only when present, so the reconstructed record is
    // deep-equal to a saved BLOCKED-without-artifact record (no spurious undefined keys).
    if (runRow.created_at != null) record.createdAt = runRow.created_at;
    const reason = runRow.blocked_reason ?? qaState.reason ?? undefined;
    if (reason != null) record.reason = reason;
    if (qaState.failedGates != null) record.failedGates = qaState.failedGates;

    // The artifact is reconstructed only when an SVG was persisted (a ready/late-block run).
    if (bundleRow?.svg != null) {
      record.artifact = {
        svg: bundleRow.svg,
        codepointManifest: bundleRow.codepoint_manifest ?? [],
        fontPostscriptName: qaState.fontPostscriptName ?? "",
      };
    }

    return record;
  }
}
