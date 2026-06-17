import { describe, it, expect, beforeEach } from "vitest";

/**
 * RED CONTRACT — REQ-002 (the SOLE load-bearing money gate).
 * Feature: sizhu-agent-safe-ops · Phase 1 QA (black-box, written BEFORE the coder).
 *
 * REQ-002: a persisted single-use approval record on the `ApprovalRepository` seam.
 * It is server-side keyed on (workflowRunId, artifactId), carries expiry + nonce +
 * status (unused/used), is consumed ATOMICALLY (no sequential AND no concurrent
 * replay), and a dispatched artifactId MUST equal the approved one.
 *
 * Kritische semantische Glättung — REQ-002 (BOUNDARY: durable persistence + the
 * decider for a real-money path):
 *   These:      "There is an approval record; a valid record lets a dispatch through."
 *   Gegenthese: The record is checked by reading a BODY field the caller controls
 *               (e.g. artifact.status), or it can be replayed (consumed twice), or
 *               an attacker approves cheap artifact X then dispatches expensive Y on
 *               the same record. Every happy-path test is green, yet the gate decides
 *               nothing the caller can't forge → a real charge with no real approval.
 *               (This is the exact C-1 / BLOCKER-3 trap: assertDispatchAllowed reads
 *               artifact.status, a body field, and is NOT the server-state decider.)
 *   Schärfung:  The record is the decider. Drive the repo directly: a tampered /
 *               expired / already-used / absent record → invalid verdict; a record for
 *               artifactId=X consumed for Y → mismatch verdict; a SECOND consume of the
 *               same record (sequential replay) → invalid; CONCURRENT double-consume →
 *               exactly one winner. A test passes ONLY if server state — not a body
 *               field — gates consumption.
 *
 * VCHK (Vision VIS-006 #1 / value-check VC-002): a dispatch happens only with a valid,
 *   single-use, consumed approval; replay / mismatch / absent ⇒ fail-closed.
 *
 * Evidence class: integration-fake (the real ApprovalRepository Local impl; no live POD).
 *   Durability/restart is asserted in DEMO_LOCAL only (EV-002 scope note — prod is
 *   fail-closed this iteration, NOT proven durable).
 *
 * EXPECTED NOW: RED — `ApprovalRepository` and its Local impl do not exist yet.
 *   This file fails honestly at the dynamic import.
 *   // RED-by-missing-module until T-ASO-1 (ApprovalRepository + Local impl).
 */

// The module under test does not exist yet. We import it lazily inside the suite so
// the failure is an honest "cannot find module" / "is not a function", not a parse
// error that masks the other suites.
type ApprovalRepoModule = {
  // Expected canonical surface (names the coder must satisfy):
  //   class LocalApprovalRepository implements ApprovalRepository
  //   createApproval(input): Promise<ApprovalRecord>      // mint an unused record
  //   consumeApproval({ recordId, workflowRunId, artifactId, nonce? }): Promise<ConsumeResult>
  // ConsumeResult = { ok: true, record } | { ok: false, error_code: "APPROVAL_TOKEN_INVALID" | "DISPATCH_NOT_ALLOWED" }
  LocalApprovalRepository: new () => any;
};

async function loadRepo(): Promise<ApprovalRepoModule> {
  // Resolve from the conventional repository home.
  return (await import("../../src/lib/repositories/approvalRepository")) as unknown as ApprovalRepoModule;
}

const RUN_ID = "wf-run-1";
const ARTIFACT_X = "artifact-X";
const ARTIFACT_Y = "artifact-Y";
const APPROVER = "admin@example.com";

async function mintValidRecord(repo: any) {
  return repo.createApproval({
    workflowRunId: RUN_ID,
    artifactId: ARTIFACT_X,
    approver: APPROVER,
    // ~1h expiry in the future
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
}

// Test isolation: the LocalApprovalRepository backing store is MODULE-level (shared across
// instances, by design for restart-survival). Reset it before EVERY test so a record minted
// in one suite cannot bleed into another (code-review hygiene finding).
beforeEach(async () => {
  const mod = await loadRepo();
  const r = new mod.LocalApprovalRepository();
  if (typeof r.reset === "function") await r.reset();
});

describe("REQ-002 — approval record is the server-side decider (valid path consumes once)", () => {
  let repo: any;

  beforeEach(async () => {
    const mod = await loadRepo();
    repo = new mod.LocalApprovalRepository();
    if (typeof repo.reset === "function") await repo.reset();
  });

  it("a valid, matching, unused record consumes successfully exactly once", async () => {
    const rec = await mintValidRecord(repo);
    const res = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: rec.nonce,
    });
    expect(res.ok).toBe(true);
  });
});

describe("REQ-002 / AC-002b — dispatched artifactId must equal the approved one", () => {
  it("record approved for X, consumed for Y → DISPATCH_NOT_ALLOWED (no swap)", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await mintValidRecord(repo); // approves ARTIFACT_X
    const res = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_Y, // attacker swaps in a different artifact
      nonce: rec.nonce,
    });
    expect(res.ok).toBe(false);
    expect(res.error_code).toBe("DISPATCH_NOT_ALLOWED");
    // Mutation RED: if the binding check were dropped (consume ignores artifactId),
    // this would wrongly succeed.
  });
});

describe("REQ-002 / AC-003 — tampered / expired / used / absent records are rejected", () => {
  it("an ABSENT record → APPROVAL_TOKEN_INVALID / DISPATCH_NOT_ALLOWED", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const res = await repo.consumeApproval({
      recordId: "does-not-exist",
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
    });
    expect(res.ok).toBe(false);
    expect(["APPROVAL_TOKEN_INVALID", "DISPATCH_NOT_ALLOWED"]).toContain(res.error_code);
  });

  it("an EXPIRED record → APPROVAL_TOKEN_INVALID / DISPATCH_NOT_ALLOWED", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await repo.createApproval({
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      approver: APPROVER,
      expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
    });
    const res = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: rec.nonce,
    });
    expect(res.ok).toBe(false);
    expect(["APPROVAL_TOKEN_INVALID", "DISPATCH_NOT_ALLOWED"]).toContain(res.error_code);
    // Mutation RED: removing the expiry check makes this succeed.
  });

  it("a TAMPERED record (wrong nonce) → APPROVAL_TOKEN_INVALID / DISPATCH_NOT_ALLOWED", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await mintValidRecord(repo);
    const res = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: "forged-nonce",
    });
    expect(res.ok).toBe(false);
    expect(["APPROVAL_TOKEN_INVALID", "DISPATCH_NOT_ALLOWED"]).toContain(res.error_code);
  });

  it("an ALREADY-USED record (sequential replay) → second consume rejected", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await mintValidRecord(repo);
    const first = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: rec.nonce,
    });
    expect(first.ok).toBe(true);
    const replay = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: rec.nonce,
    });
    expect(replay.ok).toBe(false);
    expect(["APPROVAL_TOKEN_INVALID", "DISPATCH_NOT_ALLOWED"]).toContain(replay.error_code);
    // Mutation RED: if consume does not flip status to `used`, the replay succeeds.
  });

  it("a MISSING nonce → APPROVAL_TOKEN_INVALID (a missing nonce must NOT bypass — P2 guard for the fail-closed clause)", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await mintValidRecord(repo);
    const res = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      // nonce intentionally OMITTED — must fail closed, not bypass
    });
    expect(res.ok).toBe(false);
    expect(res.error_code).toBe("APPROVAL_TOKEN_INVALID");
    // Mutation RED: changing `!input.nonce || input.nonce !== record.nonce` to
    // `input.nonce && input.nonce !== record.nonce` (missing nonce skips the check)
    // makes this go RED. This is the P2 guard test for the "missing nonce fails closed" claim.
  });

  it("a record with an UNPARSEABLE expiresAt → APPROVAL_TOKEN_INVALID (NaN must not no-op the expiry guard)", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await repo.createApproval({
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      approver: APPROVER,
      expiresAt: "not-a-real-date", // corrupted/garbage expiry
    });
    const res = await repo.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: rec.nonce,
    });
    expect(res.ok).toBe(false);
    expect(res.error_code).toBe("APPROVAL_TOKEN_INVALID");
    // Mutation RED: without the Number.isFinite guard, Date.parse("not-a-real-date") is NaN,
    // `NaN <= now` is false, the expiry guard no-ops, and this wrongly succeeds.
  });
});

describe("REQ-002 / AC-003c — concurrent double-consume of the SAME record yields exactly one winner", () => {
  it("two concurrent consumes of one valid record → exactly one ok:true (atomic)", async () => {
    const mod = await loadRepo();
    const repo = new mod.LocalApprovalRepository();
    const rec = await mintValidRecord(repo);

    const both = await Promise.all([
      repo.consumeApproval({ recordId: rec.id, workflowRunId: RUN_ID, artifactId: ARTIFACT_X, nonce: rec.nonce }),
      repo.consumeApproval({ recordId: rec.id, workflowRunId: RUN_ID, artifactId: ARTIFACT_X, nonce: rec.nonce }),
    ]);

    const winners = both.filter((r: any) => r.ok === true);
    const losers = both.filter((r: any) => r.ok === false);
    // DETERMINISTIC invariant (not a timing-race hope): of two consumes of ONE
    // single-use record, exactly one may win. This is the structural property the
    // atomic consume must guarantee — never "usually one".
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(["APPROVAL_TOKEN_INVALID", "DISPATCH_NOT_ALLOWED"]).toContain(losers[0].error_code);
  });
});

describe("REQ-002 / EV-002 — DEMO_LOCAL durability (restart-survival), scoped to Local repo only", () => {
  it("a record minted then read by a FRESH repo instance is still consumable once", async () => {
    const mod = await loadRepo();
    const repoA = new mod.LocalApprovalRepository();
    const rec = await mintValidRecord(repoA);

    // A new instance must see the persisted record (durable, not in-memory-per-object).
    // This is the OQ-005 restart-festigkeit invariant for DEMO_LOCAL ONLY. Prod
    // (Supabase stub) is fail-closed and is NOT asserted durable here (EV-002 scope).
    const repoB = new mod.LocalApprovalRepository();
    const res = await repoB.consumeApproval({
      recordId: rec.id,
      workflowRunId: RUN_ID,
      artifactId: ARTIFACT_X,
      nonce: rec.nonce,
    });
    expect(res.ok).toBe(true);
  });
});
