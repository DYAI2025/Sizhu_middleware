/**
 * BaZi-solo pipeline (ST-8) — composes the slice-1 services into one fail-closed
 * vertical: sim-order → real FuFire bazi run → deterministic compile → SVG render →
 * ready/blocked evaluation → persist. NEVER fabricates a ready: any blocked stage
 * (run / compile / render throw / a failed gate) is persisted + surfaced verbatim.
 *
 * The persistence seam is `BaZiSoloStore`. The default is in-memory; the real,
 * durable Supabase store (REQ-F-003/007 "survives restart") is a separate gated task
 * (ST-2 / BLK-002) that implements the same interface.
 */
import {
  createBaziSoloRun,
  type SimulatedOrder,
  type FuFireDataServiceLike,
  type BaziSoloRunResult,
} from "./baziSoloRunService";
import { compileBaziSolo } from "./baziSoloCompile";
import { renderBaziSoloSvg, type RenderBaziSoloResult } from "./baziSoloRenderer";
import { evaluateBaziSoloReady, type BaziSoloReadyGate } from "./baziSoloReadyState";

/** Default registered poster template the slice-1 pipeline compiles for. */
export const DEFAULT_BAZI_SOLO_TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

export type BaziSoloRunStatus = "ready_for_shipping" | "BLOCKED";

/** The persisted record for one bazi-solo run (raw bundle + artifact + verdict). */
export interface BaziSoloRunRecord {
  runId: string;
  status: BaziSoloRunStatus;
  /** Present on BLOCKED: the gates that failed (from the ready evaluation). */
  failedGates?: BaziSoloReadyGate[];
  /** Present on BLOCKED: a deterministic, greppable reason (run/compile/render block). */
  reason?: string;
  simOrder: SimulatedOrder;
  rawBundle: BaziSoloRunResult["rawBundle"];
  artifact?: {
    svg: string;
    codepointManifest: RenderBaziSoloResult["codepointManifest"];
    fontPostscriptName: string;
  };
  /** Injected timestamp (never Date.now()). */
  createdAt?: string;
}

/** Persistence seam — in-memory default; the real Supabase impl (ST-2) satisfies this. */
export interface BaZiSoloStore {
  saveRun(record: BaziSoloRunRecord): Promise<void>;
  getRun(id: string): Promise<BaziSoloRunRecord | null>;
}

/** In-memory store — the default until the durable Supabase store (ST-2/BLK-002) lands. */
export class InMemoryBaZiSoloStore implements BaZiSoloStore {
  private readonly runs = new Map<string, BaziSoloRunRecord>();
  async saveRun(record: BaziSoloRunRecord): Promise<void> {
    this.runs.set(record.runId, record);
  }
  async getRun(id: string): Promise<BaziSoloRunRecord | null> {
    return this.runs.get(id) ?? null;
  }
}

export interface BaziSoloPipelineDeps {
  fufire: FuFireDataServiceLike;
  store: BaZiSoloStore;
  /** Optional deterministic run-id generator (forwarded to the run service). */
  generateRunId?: (order: SimulatedOrder) => string;
  /** Optional font path override (defaults to the bundled Noto Sans SC). */
  fontPath?: string;
  /** Optional template id (defaults to {@link DEFAULT_BAZI_SOLO_TEMPLATE_ID}). */
  templateId?: string;
  /** Injected timestamp for the persisted record (never Date.now()). */
  now?: string;
}

/** The summary returned to the route caller. The full record is persisted via the store. */
export interface BaziSoloPipelineSummary {
  runId: string;
  status: BaziSoloRunStatus;
  failedGates?: BaziSoloReadyGate[];
  reason?: string;
}

/**
 * Run the full bazi-solo vertical, fail-closed. Persists the record at every terminal
 * stage (blocked or ready) and returns a summary. A render throw (font missing / Tofu)
 * is caught and becomes a deterministic BLOCKED — never an unhandled crash, never a fake ready.
 */
export async function runBaziSoloPipeline(
  order: SimulatedOrder,
  deps: BaziSoloPipelineDeps,
): Promise<BaziSoloPipelineSummary> {
  const fontPath = deps.fontPath;
  const templateId = deps.templateId ?? DEFAULT_BAZI_SOLO_TEMPLATE_ID;

  const run = await createBaziSoloRun(order, {
    fufire: deps.fufire,
    generateRunId: deps.generateRunId,
  });

  const base = {
    runId: run.runId,
    simOrder: order,
    rawBundle: run.rawBundle,
    createdAt: deps.now,
  };

  const block = async (
    reason: string,
    failedGates?: BaziSoloReadyGate[],
    artifact?: BaziSoloRunRecord["artifact"],
  ): Promise<BaziSoloPipelineSummary> => {
    await deps.store.saveRun({ ...base, status: "BLOCKED", reason, failedGates, artifact });
    return { runId: run.runId, status: "BLOCKED", reason, failedGates };
  };

  // Stage 1 — real FuFire run (no mock fallback).
  if (run.status === "BLOCKED") {
    return block(run.reason ?? "FUFIRE_RUN_BLOCKED");
  }

  // Stage 2 — deterministic compile (fail-closed on SOURCE_NEEDED / lichun-unverified).
  const compileResult = compileBaziSolo(run, { templateId, locale: order.locale });
  if (compileResult.status === "BLOCKED") {
    return block(compileResult.reason);
  }

  // Stage 3 — SVG render (outlined). A render throw (font/Tofu) is a deterministic block.
  let renderResult: RenderBaziSoloResult;
  try {
    renderResult = renderBaziSoloSvg(compileResult.overlayPlan, { fontPath });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return block(code ?? "RENDER_FAILED");
  }

  // Stage 4 — fail-closed ready evaluation (6 gates incl. render-back + golden-hash).
  const ready = evaluateBaziSoloReady({ run, compileResult, renderResult }, { fontPath });
  const artifact = {
    svg: renderResult.svg,
    codepointManifest: renderResult.codepointManifest,
    fontPostscriptName: renderResult.fontPostscriptName,
  };

  if (ready.status === "BLOCKED") {
    return block("READY_GATES_FAILED", ready.failedGates, artifact);
  }

  await deps.store.saveRun({ ...base, status: "ready_for_shipping", artifact });
  return { runId: run.runId, status: "ready_for_shipping" };
}
