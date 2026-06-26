/**
 * BaZi-solo DoD end-to-end smoke (feature `bazi-baci-solo-no-mock-mvp`, slice-2) — the
 * HEADLINE Definition-of-Done proof. Flag-gated, REAL boundaries.
 *
 *   npm run smoke:bazi-dod                # REAL: real FuFireDataService + real Supabase
 *                                         # service-role store. Drives the documented
 *                                         # sim-order through runBaziSoloPipeline and
 *                                         # asserts the terminal status is PERSISTED.
 *   npm run smoke:bazi-dod -- --dry-run   # NO network: a fake READY-but-minimal fufire +
 *                                         # InMemoryBaZiSoloStore. Asserts the pipeline
 *                                         # still reaches a deterministic terminal status.
 *
 * THE DoD (the single thing this proves):
 *   "a documented request drives the BaZi-solo flow with real FuFire credentials and
 *    produces EITHER a persisted `ready_for_shipping` artifact OR a deterministic BLOCKED
 *    reason."
 *
 * Both `ready_for_shipping` AND `BLOCKED` are a PASS — the DoD is about the flow being
 * DETERMINISTIC and PERSISTED, never about a particular outcome.
 *
 * KNOWN LIVE LIMITATION (surfaced 2026-06-25 by an adversarial multi-subject probe, P7/P9 — do
 * NOT launder): against the REAL FuFire boundary, EVERY probed subject (near-Lichun, mid-year,
 * mid-autumn) blocks at compile with `LICHUN_PILLAR_UNVERIFIED` — the live `bazi` response carries
 * no verifiable `data.transition.is_before_lichun` (see lichunPillarGuard + fufireResponseInterpreter),
 * so the lichun hard-gate can never confirm the year pillar. Consequence: `ready_for_shipping` is
 * currently UNREACHABLE live, so the live run only ever exercises the BLOCKED branch. This smoke
 * therefore proves the deterministic+persisted flow, NOT the green (ready) path. Making `ready`
 * reachable is upstream work (REQ-F-005/006: a verifiable solar-term transition from FuFire), not a
 * defect of this smoke — the fail-closed BLOCK is the CORRECT no-mock behavior (never ship an
 * unverified year pillar to a permanent print).
 *
 * The smoke FAILS only on:
 *   - an unexpected throw / hang (the pipeline must never crash),
 *   - a status that is not EXACTLY one of the two terminal values,
 *   - the run not being read back (read-back via a fresh store call → not persisted),
 *   - a persisted record whose status/reason/artifact does not match the in-memory summary.
 *
 * SECURITY: the service-role key is never printed — only the project host. The key is read
 * SOLELY via the secret-ref indirection (`process.env[SUPABASE_SERVICE_ROLE_SECRET_REF]`),
 * mirroring SupabaseBaZiSoloStore's own composition. The subject is SYNTHETIC (no real PII).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import { FuFireDataService } from "../../server/services/fufireDataService";
import type {
  FuFireTestRunInput,
  FuFireTestRunResult,
} from "../../server/services/fufireDataService";
import {
  runBaziSoloPipeline,
  InMemoryBaZiSoloStore,
  type BaZiSoloStore,
  type BaziSoloPipelineSummary,
} from "../../server/services/baziSoloPipeline";
import type {
  SimulatedOrder,
  FuFireDataServiceLike,
} from "../../server/services/baziSoloRunService";
import { SupabaseBaZiSoloStore } from "../../server/services/supabaseBaziSoloStore";

dotenv.config();

const DRY = process.argv.includes("--dry-run");

/** The two terminal statuses the DoD permits. Anything else is an UNEXPECTED status. */
const TERMINAL_STATUSES = ["ready_for_shipping", "BLOCKED"] as const;

/** Fixed injected timestamp — never Date.now() (keeps the run reproducible). */
const FIXED_NOW = "2026-06-22T00:00:00.000Z";

/**
 * A documented, synthetic sim-order (Beijing, 1990-02-06 noon). The orderId/runId carry the
 * `smoke_dod_` prefix so the cleanup `like smoke_dod_%` delete only ever touches smoke rows.
 */
function makeOrder(runId: string): SimulatedOrder {
  return {
    orderId: runId,
    birthDate: "1990-02-06",
    birthTime: "12:00",
    birthTimeKnown: true,
    manualLat: 39.9,
    manualLon: 116.4,
    manualTimezone: "Asia/Shanghai",
    locale: "en",
  };
}

/**
 * A deterministic, unique smoke run-id. Uses process.pid + the high-resolution clock
 * (NOT Date.now()) so concurrent/repeated runs never collide while staying greppable.
 */
function makeRunId(): string {
  const tick = process.hrtime.bigint().toString(36);
  return `smoke_dod_${process.pid}_${tick}`;
}

/**
 * Resolve the Supabase project URL + service-role key. The key is read EXCLUSIVELY through
 * the secret-ref indirection (the var the ref NAMES), mirroring server-side composition and
 * the store's own contract — never a bare `SUPABASE_SERVICE_ROLE_KEY`.
 */
function resolveSupabase(): { url: string; key: string } {
  const url =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  const key =
    process.env[
      process.env.SUPABASE_SERVICE_ROLE_SECRET_REF || "SECRET_REF_SUPABASE_SERVICE_ROLE"
    ] || "";
  if (!url || !key) {
    throw new Error(
      "BLOCKED: SUPABASE_URL + service-role key required (set the key under the secret-ref var).",
    );
  }
  return { url, key };
}

/**
 * Dry-run fake FuFire boundary: READY, no gateway issues, no real network. It returns a
 * minimal (empty) successful bundle so createBaziSoloRun passes its two gates and the
 * pipeline proceeds to the deterministic compile/render stages — which will themselves reach
 * a terminal status (almost certainly a deterministic BLOCKED, e.g. SOURCE_NEEDED, since the
 * fake carries no real bazi data). That is exactly the determinism the dry-run asserts, with
 * zero network and zero secret. It never fabricates a `ready`.
 */
class DryRunFuFire implements FuFireDataServiceLike {
  async executeTestRun(_input: FuFireTestRunInput): Promise<FuFireTestRunResult> {
    return {
      normalizedBirthPayload: {},
      requests: [{ operation: "bazi", body: {} }],
      responses: [{ operation: "bazi", data: {} }],
      warnings: [],
      gatewayIssues: [],
      readinessStatus: "READY",
    };
  }
}

/** Assert the summary status is EXACTLY one of the two terminal values (else FAIL). */
function assertTerminal(summary: BaziSoloPipelineSummary): void {
  if (!(TERMINAL_STATUSES as readonly string[]).includes(summary.status)) {
    throw new Error(
      `FAIL: pipeline returned a NON-TERMINAL status "${summary.status}" — ` +
        `the DoD requires exactly one of ${TERMINAL_STATUSES.join(" | ")}.`,
    );
  }
}

/**
 * Read the run back through the store and assert it was PERSISTED and matches the summary:
 *   - the persisted status equals the summary status,
 *   - if ready_for_shipping → an SVG artifact was persisted,
 *   - if BLOCKED → a reason and/or failedGates were persisted.
 */
async function assertPersisted(
  store: BaZiSoloStore,
  summary: BaziSoloPipelineSummary,
): Promise<void> {
  const back = await store.getRun(summary.runId);
  if (!back) {
    throw new Error(
      `FAIL: run ${summary.runId} was NOT read back from the store — not persisted.`,
    );
  }
  if (back.status !== summary.status) {
    throw new Error(
      `FAIL: persisted status "${back.status}" != summary status "${summary.status}".`,
    );
  }

  if (summary.status === "ready_for_shipping") {
    if (!back.artifact || !back.artifact.svg || back.artifact.svg.length === 0) {
      throw new Error("FAIL: ready_for_shipping run persisted WITHOUT an svg artifact.");
    }
  } else {
    const hasReason = typeof back.reason === "string" && back.reason.length > 0;
    const hasGates = Array.isArray(back.failedGates) && back.failedGates.length > 0;
    if (!hasReason && !hasGates) {
      throw new Error("FAIL: BLOCKED run persisted WITHOUT a reason or failedGates.");
    }
  }
}

/** Print a one-line, secret-free description of the terminal outcome. */
function describeOutcome(summary: BaziSoloPipelineSummary): void {
  console.log(`status          : ${summary.status}`);
  if (summary.status === "BLOCKED") {
    console.log(`reason          : ${summary.reason ?? "(none)"}`);
    console.log(
      `failedGates     : ${
        summary.failedGates && summary.failedGates.length ? summary.failedGates.join(", ") : "(none)"
      }`,
    );
  }
}

async function runDry(): Promise<void> {
  const runId = makeRunId();
  const store = new InMemoryBaZiSoloStore();

  console.log("── BaZi-solo DoD smoke ──────────────────────────────────────");
  console.log("mode            : DRY-RUN (fake READY fufire + in-memory store, no network)");
  console.log(`runId           : ${runId}`);
  console.log("─────────────────────────────────────────────────────────────");

  const summary = await runBaziSoloPipeline(makeOrder(runId), {
    fufire: new DryRunFuFire(),
    store,
    generateRunId: () => runId,
    now: FIXED_NOW,
  });

  assertTerminal(summary);
  describeOutcome(summary);
  await assertPersisted(store, summary);

  console.log("─────────────────────────────────────────────────────────────");
  console.log(`DOD VERDICT: ${summary.status} (persisted ✓) — DETERMINISTIC, no network.`);
}

async function cleanup(client: SupabaseClient, runId: string): Promise<void> {
  // Delete the bundle row first (FK-friendly order), then the run header. Scoped to this id.
  await client.from("bazi_raw_bundle").delete().eq("run_id", runId);
  await client.from("bazi_run").delete().eq("id", runId);
}

async function runLive(): Promise<void> {
  const runId = makeRunId();
  const { url, key } = resolveSupabase();
  const host = new URL(url).host;

  console.log("── BaZi-solo DoD smoke ──────────────────────────────────────");
  console.log("mode            : REAL (real FuFireDataService + real Supabase service-role store)");
  console.log(`supabase host   : ${host}`);
  console.log(`runId           : ${runId}`);
  console.log(`subject         : 1990-02-06 12:00 @ 39.9,116.4 Asia/Shanghai (synthetic, locale en)`);
  console.log("─────────────────────────────────────────────────────────────");

  // Real boundaries: real FuFire + a real service-role Supabase store.
  const client = createClient(url, key, { auth: { persistSession: false } });
  const store = new SupabaseBaZiSoloStore(client);

  let summary: BaziSoloPipelineSummary;
  try {
    summary = await runBaziSoloPipeline(makeOrder(runId), {
      fufire: new FuFireDataService(),
      store,
      generateRunId: () => runId,
      now: FIXED_NOW,
    });

    assertTerminal(summary);
    describeOutcome(summary);

    // Read it back through the SAME store contract (a real DB round-trip) and assert persisted.
    await assertPersisted(store, summary);

    console.log("read-back       : run round-tripped from Supabase ✓");
    console.log("─────────────────────────────────────────────────────────────");
    console.log(`DOD VERDICT: ${summary.status} (persisted ✓)`);
    if (summary.status === "BLOCKED") {
      console.log(
        "NOTE            : this proves the DETERMINISTIC + PERSISTED flow, NOT the ready path.\n" +
          "                  The live FuFire boundary blocks all probed subjects on " +
          `${summary.reason ?? "a compile gate"}; ready_for_shipping is currently UNREACHABLE live\n` +
          "                  (upstream — a verifiable solar-term transition, REQ-F-005/006). See the file header.",
      );
    }
  } finally {
    console.log("cleanup         : removing smoke rows (bazi_raw_bundle + bazi_run)");
    await cleanup(client, runId);
  }
}

async function main(): Promise<void> {
  if (DRY) {
    await runDry();
  } else {
    await runLive();
  }
  process.exit(0);
}

main().catch((err) => {
  // Any throw is an UNEXPECTED failure: a crash, a non-terminal/non-persisted assertion, or a
  // missing-config BLOCK. The DoD requires the flow never to crash — so this is a hard FAIL.
  console.error(`DOD VERDICT: FAIL — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
