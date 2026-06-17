/**
 * Bazzi Middleware Platform - Approval Repository (REQ-002, sizhu-agent-safe-ops)
 *
 * The SOLE load-bearing money gate seam: a persisted, single-use approval record that
 * gates a real POD dispatch (server-side keyed on (workflowRunId, artifactId), with an
 * expiry + nonce + a status that flips exactly once unused→used).
 *
 * ── SCOPE: T1 (contract seam) ────────────────────────────────────────────────────
 * This slice provides ONLY the contract surface so the structural assertions resolve:
 *   - the module + `LocalApprovalRepository` class exist,
 *   - `createApproval` mints a real `DispatchApproval` record (id/nonce, status, expiry),
 *   - `consumeApproval` resolves with the contract result shape for the basic surface.
 *
 * It DELIBERATELY does NOT implement the load-bearing single-use BEHAVIOUR — that is
 * T2 (LocalApprovalRepository.consume): the atomic unused→used flip, expiry check,
 * nonce-tamper rejection, (workflowRunId, artifactId) binding check, and durable
 * (localStorage-backed, restart-resilient) persistence. Those guards are marked
 * `// TODO(T2)` below, and the corresponding contract tests stay RED until T2 lands.
 * Do not add that behaviour here — keep T1 a pure contract increment.
 */

import { DispatchApproval } from '../domain/models';
import {
  ApprovalRepository,
  CreateApprovalInput,
  ConsumeApprovalInput,
  ConsumeApprovalResult,
} from './interfaces';

/** Generate an opaque, unguessable record id / nonce. */
function newNonce(): string {
  // crypto.randomUUID is available in the Node + browser (jsdom) test environments.
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  return `appr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class LocalApprovalRepository implements ApprovalRepository {
  // T1: a plain in-memory map is sufficient for the contract surface. T2 replaces /
  // augments this with a durable, restart-resilient (localStorage-backed) store and an
  // atomic read-modify-write critical section keyed on the record id.
  private readonly store = new Map<string, DispatchApproval>();

  async createApproval(input: CreateApprovalInput): Promise<DispatchApproval> {
    const id = newNonce();
    const record: DispatchApproval = {
      id,
      workflowRunId: input.workflowRunId,
      artifactId: input.artifactId,
      approverId: input.approver,
      status: 'unused',
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.store.set(id, record);
    return record;
  }

  async getApproval(recordId: string): Promise<DispatchApproval | null> {
    return this.store.get(recordId) ?? null;
  }

  async consumeApproval(input: ConsumeApprovalInput): Promise<ConsumeApprovalResult> {
    const record = this.store.get(input.recordId);
    if (!record) {
      return { ok: false, error_code: 'APPROVAL_TOKEN_INVALID' };
    }

    // TODO(T2): the load-bearing single-use guards live here and are NOT implemented
    // in T1 (these contract tests stay RED until T2):
    //   - reject when expired (now > expiresAt)                         → AC-003
    //   - reject when status === 'used' (sequential replay)             → AC-003
    //   - reject when nonce !== record nonce (tamper)                   → AC-003
    //   - reject when artifactId/workflowRunId do not match the record  → AC-002b
    //   - atomic unused→used flip in one critical section so two
    //     concurrent consumes cannot both win                          → AC-003c
    //   - durable (localStorage) persistence across instances          → EV-002
    // T1 returns the happy-path verdict for the basic surface only.
    return { ok: true, record };
  }

  /** Test convenience hook (the contract test calls reset() when present). */
  async reset(): Promise<void> {
    this.store.clear();
  }
}
