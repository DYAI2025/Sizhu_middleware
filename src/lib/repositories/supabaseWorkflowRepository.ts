/**
 * SupabaseWorkflowRepository — feat/supabase-data-layer (WORKFLOWS vertical), server-side
 * service-role store mirroring the Products reference. Implements THIS branch's
 * WorkflowRepository against workflow_runs / workflow_logs / visual_workflows.
 *
 * SERVER-ONLY (constructed with a service-role SupabaseClient). snake_case↔camelCase
 * mapping; absent optionals map to NULL columns and are omitted from reads. Visual
 * workflows are stored as a `graph` jsonb keyed by product_id. Fail-loud on every
 * supabase {error} — never a silent empty fallback.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowRun, WorkflowLog, VisualWorkflow } from "../domain/models";

const RUNS_TABLE = "workflow_runs";
const LOGS_TABLE = "workflow_logs";
const VISUAL_TABLE = "visual_workflows";

function fail(op: string, error: { message?: string } | null): never {
  throw new Error(`SUPABASE_WORKFLOW_STORE_ERROR (${op}): ${error?.message ?? "unknown error"}`);
}

type Row = Record<string, unknown>;

function rowToRun(r: Row): WorkflowRun {
  const run: WorkflowRun = {
    id: r.id as string,
    orderNumber: r.order_number as string,
    productId: r.product_id as string,
    customerName: r.customer_name as string,
    status: r.status as WorkflowRun["status"],
    startedAt: r.started_at as string,
    currentIteration: (r.current_iteration as number) ?? 1,
  } as WorkflowRun;
  if (r.completed_at != null) (run as unknown as Record<string, unknown>).completedAt = r.completed_at;
  if (r.accepted_artifact_id != null) (run as unknown as Record<string, unknown>).acceptedArtifactId = r.accepted_artifact_id;
  if (r.personalization_data != null) (run as unknown as Record<string, unknown>).personalizationData = r.personalization_data;
  return run;
}

function runToRow(run: WorkflowRun): Row {
  return {
    id: run.id,
    order_number: run.orderNumber,
    product_id: run.productId,
    customer_name: run.customerName,
    status: run.status,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    current_iteration: run.currentIteration ?? 1,
    accepted_artifact_id: run.acceptedArtifactId ?? null,
    personalization_data: (run as unknown as Record<string, unknown>).personalizationData ?? null,
  };
}

function rowToLog(r: Row): WorkflowLog {
  return {
    id: r.id as string,
    runId: r.run_id as string,
    orderNumber: r.order_number as string,
    timestamp: r.timestamp as string,
    step: r.step as WorkflowLog["step"],
    message: r.message as string,
    status: r.status as WorkflowLog["status"],
    providerUsed: r.provider_used as string,
    modelUsed: r.model_used as string,
    iteration: r.iteration as number,
  };
}

function logToRow(log: WorkflowLog): Row {
  return {
    id: log.id,
    run_id: log.runId,
    order_number: log.orderNumber,
    timestamp: log.timestamp,
    step: log.step,
    message: log.message,
    status: log.status,
    provider_used: log.providerUsed ?? null,
    model_used: log.modelUsed ?? null,
    iteration: log.iteration ?? null,
  };
}

function rowToVisual(r: Row): VisualWorkflow {
  const graph = (r.graph ?? {}) as Record<string, unknown>;
  return { productId: r.product_id as string, ...graph } as VisualWorkflow;
}

export class SupabaseWorkflowRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getWorkflowRuns(): Promise<WorkflowRun[]> {
    const { data, error } = await this.client.from(RUNS_TABLE).select("*").order("started_at", { ascending: false });
    if (error) fail("getWorkflowRuns", error);
    return ((data as Row[]) ?? []).map(rowToRun);
  }

  async saveWorkflowRuns(runs: WorkflowRun[]): Promise<void> {
    const { error } = await this.client.from(RUNS_TABLE).upsert(runs.map(runToRow), { onConflict: "id" });
    if (error) fail("saveWorkflowRuns", error);
  }

  async getWorkflowLogs(): Promise<WorkflowLog[]> {
    const { data, error } = await this.client.from(LOGS_TABLE).select("*").order("timestamp", { ascending: false });
    if (error) fail("getWorkflowLogs", error);
    return ((data as Row[]) ?? []).map(rowToLog);
  }

  async saveWorkflowLogs(logs: WorkflowLog[]): Promise<void> {
    const { error } = await this.client.from(LOGS_TABLE).upsert(logs.map(logToRow), { onConflict: "id" });
    if (error) fail("saveWorkflowLogs", error);
  }

  async getVisualWorkflows(): Promise<VisualWorkflow[]> {
    const { data, error } = await this.client.from(VISUAL_TABLE).select("*").order("updated_at", { ascending: false });
    if (error) fail("getVisualWorkflows", error);
    return ((data as Row[]) ?? []).map(rowToVisual);
  }

  async saveVisualWorkflow(productId: string, workflow: VisualWorkflow): Promise<void> {
    const { productId: _ignored, ...graph } = workflow as VisualWorkflow & { productId?: string };
    const row: Row = {
      product_id: productId,
      graph,
      updated_at: (workflow as unknown as Record<string, unknown>).updatedAt ?? null,
    };
    const { error } = await this.client.from(VISUAL_TABLE).upsert([row], { onConflict: "product_id" });
    if (error) fail("saveVisualWorkflow", error);
  }

  async getVisualWorkflow(productId: string): Promise<VisualWorkflow> {
    const { data, error } = await this.client.from(VISUAL_TABLE).select("*").eq("product_id", productId).maybeSingle();
    if (error) fail("getVisualWorkflow", error);
    if (!data) {
      const now = new Date().toISOString();
      return { productId, nodes: [], edges: [], createdAt: now, updatedAt: now } as VisualWorkflow;
    }
    return rowToVisual(data as Row);
  }
}
