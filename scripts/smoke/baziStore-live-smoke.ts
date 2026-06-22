/**
 * ST-2 live survives-restart smoke (REQ-F-003/007, BLK-002) — flag-gated, real Supabase.
 *
 *   npm run smoke:bazistore            # real: write → read-back via a FRESH client → cleanup
 *   npm run smoke:bazistore -- --dry-run   # stub client, no network
 *
 * Proves DURABILITY: a run persisted by one store instance is read back by a SEPARATE,
 * freshly-constructed store instance (a stand-in for "after a process restart") with its
 * gatewayIssues intact (folded into qa_state). Secret hygiene: the service-role key is
 * never printed — only the project host.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { SupabaseBaZiSoloStore } from "../../server/services/supabaseBaziSoloStore";
import { InMemoryBaZiSoloStore } from "../../server/services/baziSoloPipeline";
import type { BaziSoloRunRecord } from "../../server/services/baziSoloPipeline";

dotenv.config();

const DRY = process.argv.includes("--dry-run");

function resolveSupabase(): { url: string; key: string } {
  const url =
    process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env[process.env.SUPABASE_SERVICE_ROLE_SECRET_REF || "SECRET_REF_SUPABASE_SERVICE_ROLE"] || "";
  if (!url || !key) {
    throw new Error("BLOCKED: SUPABASE_URL + service-role key required (set via the secret-ref var).");
  }
  return { url, key };
}

function makeRecord(runId: string): BaziSoloRunRecord {
  return {
    runId,
    status: "BLOCKED",
    reason: "FUFIRE_NOT_READY",
    simOrder: { orderId: `${runId}-ord`, birthDate: "1990-02-06" },
    rawBundle: {
      requests: [{ op: "bazi" }] as never,
      responses: [] as never,
      gatewayIssues: [{ code: "FUFIRE_NOT_READY", operation: "bazi" }] as never,
      warnings: ["smoke-warning"],
    },
    createdAt: "2026-06-22T00:00:00Z",
  };
}

async function cleanup(client: SupabaseClient, runId: string): Promise<void> {
  await client.from("bazi_raw_bundle").delete().eq("run_id", runId);
  await client.from("bazi_run").delete().eq("id", runId);
}

async function main(): Promise<void> {
  const runId = `smoke_bazi_${process.pid}_${Math.floor(Number(process.hrtime.bigint() % 1000000n))}`;
  const record = makeRecord(runId);

  if (DRY) {
    const store = new InMemoryBaZiSoloStore();
    await store.saveRun(record);
    const back = await store.getRun(runId);
    if (!back || back.rawBundle.gatewayIssues.length !== 1) throw new Error("DRY FAIL: round-trip");
    console.log("[dry-run] PASS — store round-trip (in-memory stub), no network.");
    return;
  }

  const { url, key } = resolveSupabase();
  const host = new URL(url).host;
  console.log(`[live] target host: ${host}`);

  // Writer A.
  const clientA = createClient(url, key, { auth: { persistSession: false } });
  const storeA = new SupabaseBaZiSoloStore(clientA);
  console.log(`save: persisting ${runId} (status BLOCKED)`);
  await storeA.saveRun(record);

  // Reader B — a SEPARATE, fresh client + store (stands in for a process restart).
  const clientB = createClient(url, key, { auth: { persistSession: false } });
  const storeB = new SupabaseBaZiSoloStore(clientB);
  const back = await storeB.getRun(runId);

  try {
    if (!back) throw new Error("FAIL: fresh store B could not read back the run — NOT durable.");
    if (back.status !== "BLOCKED" || back.reason !== "FUFIRE_NOT_READY") {
      throw new Error(`FAIL: round-trip status/reason mismatch (${back.status}/${back.reason}).`);
    }
    if (back.rawBundle.gatewayIssues.length !== 1) {
      throw new Error("FAIL: gatewayIssues did not survive (qa_state fold lost).");
    }
    console.log("read-back: fresh client B sees A's run — DURABLE (survives restart) OK");
    console.log("gatewayIssues survived in qa_state:", JSON.stringify(back.rawBundle.gatewayIssues));
    console.log("PASS: bazi store live survives-restart smoke succeeded.");
  } finally {
    console.log("cleanup: removing smoke rows");
    await cleanup(clientA, runId);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
