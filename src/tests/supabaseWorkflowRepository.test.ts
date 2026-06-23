/**
 * Unit tests for the REAL server-side Supabase workflow store
 * (feat/supabase-data-layer — WORKFLOWS vertical, mirrors the Products reference).
 *
 * Contract under test: THIS branch's `WorkflowRepository`
 * (getWorkflowRuns / saveWorkflowRuns / getWorkflowLogs / saveWorkflowLogs /
 *  getVisualWorkflows / saveVisualWorkflow / getVisualWorkflow).
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload, opts) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method (workflow_runs, workflow_logs, visual_workflows),
 *   - snake_case → camelCase mapping (read) and camelCase → snake_case (write),
 *   - upsert uses onConflict: "id" (runs/logs) / "product_id" (visual workflows),
 *   - getVisualWorkflow filters by product_id (eq) and returns a seeded blank graph
 *     when the product has no persisted graph (never throws "not found"),
 *   - fail-loud on a supabase `error` (no silent empty fallback).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseWorkflowRepository } from "../lib/repositories/supabaseWorkflowRepository";
import type { WorkflowRun, WorkflowLog, VisualWorkflow } from "../types";

// ── Mock supabase-js query builder ──────────────────────────────────────────

interface RecordedCall {
  table: string;
  op: string;
  payload?: unknown;
  opts?: unknown;
  /** eq filters applied to the chain, captured as [column, value] pairs. */
  filters?: Array<[string, unknown]>;
}

/**
 * A programmable mock. `responses` is a queue of `{ data, error }` consumed in the
 * order terminal calls resolve. Every chain segment is recorded for assertions.
 * Chain segments supported: select → order → (thenable), select → eq → (thenable),
 * upsert → (thenable).
 */
function makeMockClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: RecordedCall[] = [];
  let cursor = 0;
  const nextResponse = () => responses[cursor++] ?? { data: null, error: null };

  function builder(table: string, op: string, payload?: unknown, opts?: unknown) {
    const rec: RecordedCall = { table, op, payload, opts, filters: [] };
    calls.push(rec);
    const resolve = () => Promise.resolve(nextResponse());
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => resolve();
    chain.eq = (col: string, val: unknown) => {
      rec.filters!.push([col, val]);
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
        select: (_cols?: string) => builder(table, "select"),
        upsert: (payload: unknown, opts?: unknown) => builder(table, "upsert", payload, opts),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

// ── Fixtures (snake_case rows + camelCase domain objects) ────────────────────

const RUN_ROW = {
  id: "run_1",
  order_number: "ORD-9001",
  product_id: "prod_1",
  customer_name: "Ada Lovelace",
  status: "running" as const,
  started_at: "2026-01-01T00:00:00.000Z",
  completed_at: null,
  current_iteration: 2,
  accepted_artifact_id: null,
  personalization_data: { animal: "Tiger" },
};

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run_1",
    orderNumber: "ORD-9001",
    productId: "prod_1",
    customerName: "Ada Lovelace",
    birthDate: "1990-12-10",
    birthTime: "11:00",
    birthTimeKnown: true,
    birthPlace: "London",
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    currentIteration: 2,
    ...overrides,
  };
}

const LOG_ROW = {
  id: "log_1",
  run_id: "run_1",
  order_number: "ORD-9001",
  timestamp: "2026-01-01T00:00:01.000Z",
  step: "generate",
  message: "candidate generated",
  status: "info" as const,
  provider_used: "OpenRouter",
  model_used: "gemini-2.5-flash",
  iteration: 2,
};

function makeLog(overrides: Partial<WorkflowLog> = {}): WorkflowLog {
  return {
    id: "log_1",
    runId: "run_1",
    orderNumber: "ORD-9001",
    timestamp: "2026-01-01T00:00:01.000Z",
    step: "generate",
    message: "candidate generated",
    status: "info",
    providerUsed: "OpenRouter",
    modelUsed: "gemini-2.5-flash",
    iteration: 2,
    ...overrides,
  };
}

function makeVisualWorkflow(overrides: Partial<VisualWorkflow> = {}): VisualWorkflow {
  return {
    productId: "prod_1",
    nodes: [
      { id: "n1", type: "template", title: "Template", description: "", x: 10, y: 20, config: {} },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

const VISUAL_ROW = {
  product_id: "prod_1",
  graph: {
    nodes: [
      { id: "n1", type: "template", title: "Template", description: "", x: 10, y: 20, config: {} },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  updated_at: "2026-01-02T00:00:00.000Z",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("SupabaseWorkflowRepository — workflow runs", () => {
  it("getWorkflowRuns queries workflow_runs and maps snake_case → camelCase", async () => {
    const { client, calls } = makeMockClient([{ data: [RUN_ROW], error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    const result = await repo.getWorkflowRuns();

    expect(calls[0].table).toBe("workflow_runs");
    expect(calls[0].op).toBe("select");
    expect(result).toEqual([
      {
        id: "run_1",
        orderNumber: "ORD-9001",
        productId: "prod_1",
        customerName: "Ada Lovelace",
        status: "running",
        startedAt: "2026-01-01T00:00:00.000Z",
        currentIteration: 2,
        personalizationData: { animal: "Tiger" },
      },
    ]);
  });

  it("getWorkflowRuns returns [] on null data without throwing", async () => {
    const { client } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.getWorkflowRuns()).resolves.toEqual([]);
  });

  it("getWorkflowRuns FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.getWorkflowRuns()).rejects.toThrow(/getWorkflowRuns.*boom/);
  });

  it("saveWorkflowRuns upserts workflow_runs with camel→snake mapping and onConflict: id", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    await repo.saveWorkflowRuns([
      makeRun({ id: "run_a", completedAt: "2026-01-03T00:00:00.000Z", acceptedArtifactId: "art_1" }),
    ]);

    expect(calls[0]).toMatchObject({ table: "workflow_runs", op: "upsert" });
    expect(calls[0].opts).toMatchObject({ onConflict: "id" });
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: "run_a",
      order_number: "ORD-9001",
      product_id: "prod_1",
      customer_name: "Ada Lovelace",
      status: "running",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-03T00:00:00.000Z",
      current_iteration: 2,
      accepted_artifact_id: "art_1",
    });
  });

  it("saveWorkflowRuns maps absent optionals to null columns", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    await repo.saveWorkflowRuns([makeRun()]);
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].completed_at).toBeNull();
    expect(rows[0].accepted_artifact_id).toBeNull();
  });

  it("saveWorkflowRuns FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.saveWorkflowRuns([makeRun()])).rejects.toThrow(/saveWorkflowRuns.*rls denied/);
  });
});

describe("SupabaseWorkflowRepository — workflow logs", () => {
  it("getWorkflowLogs queries workflow_logs and maps snake_case → camelCase", async () => {
    const { client, calls } = makeMockClient([{ data: [LOG_ROW], error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    const result = await repo.getWorkflowLogs();

    expect(calls[0].table).toBe("workflow_logs");
    expect(calls[0].op).toBe("select");
    expect(result).toEqual([makeLog()]);
  });

  it("getWorkflowLogs FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.getWorkflowLogs()).rejects.toThrow(/getWorkflowLogs.*boom/);
  });

  it("saveWorkflowLogs upserts workflow_logs with camel→snake mapping and onConflict: id", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    await repo.saveWorkflowLogs([makeLog({ id: "log_a" })]);

    expect(calls[0]).toMatchObject({ table: "workflow_logs", op: "upsert" });
    expect(calls[0].opts).toMatchObject({ onConflict: "id" });
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: "log_a",
      run_id: "run_1",
      order_number: "ORD-9001",
      timestamp: "2026-01-01T00:00:01.000Z",
      step: "generate",
      message: "candidate generated",
      status: "info",
      provider_used: "OpenRouter",
      model_used: "gemini-2.5-flash",
      iteration: 2,
    });
  });

  it("saveWorkflowLogs FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.saveWorkflowLogs([makeLog()])).rejects.toThrow(/saveWorkflowLogs.*rls denied/);
  });
});

describe("SupabaseWorkflowRepository — visual workflows", () => {
  it("getVisualWorkflows queries visual_workflows and rebuilds VisualWorkflow from graph jsonb", async () => {
    const { client, calls } = makeMockClient([{ data: [VISUAL_ROW], error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    const result = await repo.getVisualWorkflows();

    expect(calls[0].table).toBe("visual_workflows");
    expect(calls[0].op).toBe("select");
    expect(result).toEqual([makeVisualWorkflow()]);
  });

  it("getVisualWorkflows FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.getVisualWorkflows()).rejects.toThrow(/getVisualWorkflows.*boom/);
  });

  it("saveVisualWorkflow upserts visual_workflows by product_id (graph jsonb)", async () => {
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    const wf = makeVisualWorkflow();
    await repo.saveVisualWorkflow("prod_1", wf);

    expect(calls[0]).toMatchObject({ table: "visual_workflows", op: "upsert" });
    expect(calls[0].opts).toMatchObject({ onConflict: "product_id" });
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].product_id).toBe("prod_1");
    expect(rows[0].graph).toMatchObject({ nodes: wf.nodes, edges: wf.edges });
    expect(rows[0].updated_at).toBe(wf.updatedAt);
  });

  it("saveVisualWorkflow binds to the productId arg, not the payload's productId", async () => {
    // A mutation that trusts workflow.productId over the explicit arg would diverge.
    const { client, calls } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    await repo.saveVisualWorkflow("prod_arg", makeVisualWorkflow({ productId: "prod_payload" }));
    const rows = calls[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].product_id).toBe("prod_arg");
  });

  it("saveVisualWorkflow FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "rls denied" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.saveVisualWorkflow("prod_1", makeVisualWorkflow())).rejects.toThrow(
      /saveVisualWorkflow.*rls denied/,
    );
  });

  it("getVisualWorkflow filters by product_id and rebuilds the persisted graph", async () => {
    const { client, calls } = makeMockClient([{ data: VISUAL_ROW, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    const result = await repo.getVisualWorkflow("prod_1");

    expect(calls[0].table).toBe("visual_workflows");
    expect(calls[0].filters).toContainEqual(["product_id", "prod_1"]);
    expect(result).toEqual(makeVisualWorkflow());
  });

  it("getVisualWorkflow returns a seeded blank graph when none is persisted (never not-found)", async () => {
    const { client } = makeMockClient([{ data: null, error: null }]);
    const repo = new SupabaseWorkflowRepository(client);
    const result = await repo.getVisualWorkflow("prod_new");

    expect(result.productId).toBe("prod_new");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(typeof result.createdAt).toBe("string");
    expect(typeof result.updatedAt).toBe("string");
  });

  it("getVisualWorkflow FAILS LOUD on a supabase error", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
    const repo = new SupabaseWorkflowRepository(client);
    await expect(repo.getVisualWorkflow("prod_1")).rejects.toThrow(/getVisualWorkflow.*boom/);
  });
});
