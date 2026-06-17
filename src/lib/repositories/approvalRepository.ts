/**
 * Bazzi Middleware Platform - Approval Repository (REQ-002, sizhu-agent-safe-ops)
 *
 * The SOLE load-bearing money gate seam: a persisted, single-use approval record that
 * gates a real POD dispatch (server-side keyed on (workflowRunId, artifactId), with an
 * expiry + nonce + a status that flips exactly once unused→used).
 *
 * ── SCOPE: T2 (single-use BEHAVIOUR) ─────────────────────────────────────────────
 * The record is the SERVER-SIDE decider — never a caller-controlled body field. A
 * consume succeeds ONLY if the record exists, is unexpired, is still `unused`, its
 * (workflowRunId, artifactId) match the call, and the presented nonce matches the minted
 * one. On success the status flips unused→used in a SINGLE synchronous critical section
 * (no `await` between the status check and the status write) so neither a sequential nor
 * a concurrent second consume can win — the deterministic exactly-one invariant.
 *
 * Persistence is durable in DEMO_LOCAL: the store is backed by `localStorage` in the
 * browser and a module-level memory store in Node, so a FRESH `LocalApprovalRepository`
 * instance sees a record minted by an earlier instance (restart-survival, EV-002). The
 * backing store is NOT held per-object instance.
 */

import { DispatchApproval } from '../domain/models';
import {
  ApprovalRepository,
  CreateApprovalInput,
  ConsumeApprovalInput,
  ConsumeApprovalResult,
} from './interfaces';

/** Generate an opaque, unguessable token (used for both the record id and its nonce). */
function newToken(): string {
  // crypto.randomUUID is available in the Node + browser (jsdom) test environments.
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  return `appr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Durable backing store (shared across instances) ───────────────────────────────
// Mirrors the localRepository.ts pattern: `localStorage` in the browser, a module-level
// record in Node. Crucially this is MODULE-level, not per-instance, so a fresh repo
// instance reads what an earlier instance minted (EV-002 restart-survival in DEMO_LOCAL).
const STORAGE_KEY = 'bazzi_dispatch_approvals';
const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const memoryStore: Record<string, string> = {};

function readAll(): Record<string, DispatchApproval> {
  try {
    const raw = isBrowser ? localStorage.getItem(STORAGE_KEY) : memoryStore[STORAGE_KEY];
    return raw ? (JSON.parse(raw) as Record<string, DispatchApproval>) : {};
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, DispatchApproval>): void {
  const serialized = JSON.stringify(records);
  if (isBrowser) {
    localStorage.setItem(STORAGE_KEY, serialized);
  } else {
    memoryStore[STORAGE_KEY] = serialized;
  }
}

export class LocalApprovalRepository implements ApprovalRepository {
  async createApproval(input: CreateApprovalInput): Promise<DispatchApproval> {
    const record: DispatchApproval = {
      id: newToken(),
      // The nonce is a SEPARATE secret token, distinct from the record id, so that
      // knowing the (loggable/referenceable) id is not sufficient to consume — only the
      // holder of the minted nonce can. This is what makes the tamper test bite.
      nonce: newToken(),
      workflowRunId: input.workflowRunId,
      artifactId: input.artifactId,
      approverId: input.approver,
      status: 'unused',
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    const records = readAll();
    records[record.id] = record;
    writeAll(records);
    return record;
  }

  async getApproval(recordId: string): Promise<DispatchApproval | null> {
    return readAll()[recordId] ?? null;
  }

  async consumeApproval(input: ConsumeApprovalInput): Promise<ConsumeApprovalResult> {
    // ── Atomic single-use critical section ─────────────────────────────────────────
    // Everything from the read to the write below runs synchronously with NO `await`,
    // so the JS event loop cannot interleave a second concurrent consume between the
    // status check and the status flip. Two concurrent consumes of one record therefore
    // yield EXACTLY ONE winner (deterministic, not a timing race).
    const records = readAll();
    const record = records[input.recordId];

    // Absent record → fail closed.
    if (!record) {
      return { ok: false, error_code: 'APPROVAL_TOKEN_INVALID' };
    }

    // Tamper / missing-nonce guard (fail-closed): the presented nonce MUST match the
    // minted one. A missing nonce must NOT bypass.
    if (!input.nonce || input.nonce !== record.nonce) {
      return { ok: false, error_code: 'APPROVAL_TOKEN_INVALID' };
    }

    // Expiry guard: a record past its expiry — OR carrying an unparseable expiry — is no
    // longer consumable. Fail-closed: Date.parse of a corrupted expiresAt is NaN and
    // `NaN <= now` is false, which would silently NO-OP the guard; Number.isFinite closes that.
    const expMs = Date.parse(record.expiresAt);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      return { ok: false, error_code: 'APPROVAL_TOKEN_INVALID' };
    }

    // Single-use guard: a record already flipped to `used` cannot be consumed again
    // (rejects the sequential replay; in the concurrent case the first writer flips the
    // status and the second sees `used`).
    if (record.status !== 'unused') {
      return { ok: false, error_code: 'APPROVAL_TOKEN_INVALID' };
    }

    // (workflowRunId, artifactId) binding guard (AC-002b — no swap): a record approved
    // for artifact X may only be consumed for X, on its own run.
    if (record.workflowRunId !== input.workflowRunId || record.artifactId !== input.artifactId) {
      return { ok: false, error_code: 'DISPATCH_NOT_ALLOWED' };
    }

    // Flip unused→used and persist, all within this same synchronous section.
    const consumed: DispatchApproval = {
      ...record,
      status: 'used',
      usedAt: new Date().toISOString(),
    };
    records[record.id] = consumed;
    writeAll(records);

    return { ok: true, record: consumed };
  }

  /** Test convenience hook (the contract test calls reset() when present). */
  async reset(): Promise<void> {
    writeAll({});
  }
}
