/**
 * Browser-side WorkflowRepository that talks to the SERVER data API
 * (feat/supabase-data-layer — WORKFLOWS vertical, mirrors the Products reference).
 *
 * Data goes through the server (service-role behind apiGuard); the browser presents
 * its Supabase access token as a Bearer credential. Fail-loud: a non-2xx response or
 * a missing session token THROWS a typed WorkflowApiError (never a silent empty).
 */
import type { WorkflowRun, WorkflowLog, VisualWorkflow } from "../domain/models";
import type { WorkflowRepository } from "./interfaces";
import { getAuthSnapshot } from "../auth/authState";

const RUNS_ENDPOINT = "/api/v1/workflow-runs";
const LOGS_ENDPOINT = "/api/v1/workflow-logs";
const VISUAL_ENDPOINT = "/api/v1/visual-workflows";

export const WORKFLOW_API_ERROR = "WORKFLOW_API_ERROR" as const;

export class WorkflowApiError extends Error {
  readonly code = WORKFLOW_API_ERROR;
  readonly status: number;
  constructor(message: string, status: number) {
    super(`${WORKFLOW_API_ERROR} (${status}): ${message}`);
    this.name = "WorkflowApiError";
    this.status = status;
    Object.setPrototypeOf(this, WorkflowApiError.prototype);
  }
}

function authHeaders(): Record<string, string> {
  const token = getAuthSnapshot().accessToken;
  if (!token) throw new WorkflowApiError("No active session — login required.", 0);
  return { Authorization: `Bearer ${token}` };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error_code?: string };
    return body.message ?? body.error_code ?? res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET", headers: { ...authHeaders() } });
  if (!res.ok) throw new WorkflowApiError(await errorMessage(res), res.status);
  return (await res.json()) as T;
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new WorkflowApiError(await errorMessage(res), res.status);
}

export class ApiWorkflowRepository implements WorkflowRepository {
  getWorkflowRuns(): Promise<WorkflowRun[]> {
    return getJson<WorkflowRun[]>(RUNS_ENDPOINT);
  }
  saveWorkflowRuns(runs: WorkflowRun[]): Promise<void> {
    return post(RUNS_ENDPOINT, runs);
  }
  getWorkflowLogs(): Promise<WorkflowLog[]> {
    return getJson<WorkflowLog[]>(LOGS_ENDPOINT);
  }
  saveWorkflowLogs(logs: WorkflowLog[]): Promise<void> {
    return post(LOGS_ENDPOINT, logs);
  }
  getVisualWorkflows(): Promise<VisualWorkflow[]> {
    return getJson<VisualWorkflow[]>(VISUAL_ENDPOINT);
  }
  saveVisualWorkflow(productId: string, workflow: VisualWorkflow): Promise<void> {
    return post(`${VISUAL_ENDPOINT}/${encodeURIComponent(productId)}`, workflow);
  }
  getVisualWorkflow(productId: string): Promise<VisualWorkflow> {
    return getJson<VisualWorkflow>(`${VISUAL_ENDPOINT}/${encodeURIComponent(productId)}`);
  }
}
