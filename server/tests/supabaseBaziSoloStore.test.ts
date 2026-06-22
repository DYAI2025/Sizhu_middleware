import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseBaZiSoloStore } from "../services/supabaseBaziSoloStore";
import type { BaziSoloRunRecord } from "../services/baziSoloPipeline";

/**
 * ST-2 — durable Supabase store, unit-tested against a HAND-ROLLED fake supabase-js
 * client (no network). Proves: saveRun upserts both tables with the right payload
 * (gatewayIssues/warnings folded into qa_state), getRun reconstructs the full record
 * out of the two rows + qa_state, and any {error} fails loud.
 * The real-boundary durability ("survives restart") is proven by scripts/smoke/baziStore-live-smoke.ts.
 */

interface WriteCall {
  op: "upsert" | "insert" | "delete";
  table: string;
  payload?: Record<string, unknown>;
  opts?: { onConflict?: string };
}

function fakeClient(opts: {
  rows?: { bazi_run?: unknown; bazi_raw_bundle?: unknown };
  upsertError?: { message: string } | null;
  insertError?: { message: string } | null;
  deleteError?: { message: string } | null;
  selectError?: { message: string } | null;
}) {
  const writes: WriteCall[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(payload: Record<string, unknown>, o?: { onConflict?: string }) {
          writes.push({ op: "upsert", table, payload, opts: o });
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
        insert(payload: Record<string, unknown>) {
          writes.push({ op: "insert", table, payload });
          return Promise.resolve({ error: opts.insertError ?? null });
        },
        delete() {
          return {
            eq(_col: string, _val: string) {
              writes.push({ op: "delete", table });
              return Promise.resolve({ error: opts.deleteError ?? null });
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                maybeSingle() {
                  const data = (opts.rows ?? {})[table as "bazi_run" | "bazi_raw_bundle"] ?? null;
                  return Promise.resolve({ data, error: opts.selectError ?? null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const READY_RECORD: BaziSoloRunRecord = {
  runId: "run-1",
  status: "ready_for_shipping",
  simOrder: { orderId: "o1", birthDate: "1990-02-06" },
  rawBundle: {
    requests: [{ op: "bazi" }] as never,
    responses: [{ op: "bazi", data: {} }] as never,
    gatewayIssues: [{ code: "NONE" }] as never,
    warnings: ["w1"],
  },
  artifact: { svg: "<svg/>", codepointManifest: [{ key: "k", char: "庚", codepoint: 24218, glyphId: 1, hasPath: true }], fontPostscriptName: "NotoSansSC-Thin" },
  createdAt: "2026-06-22T00:00:00Z",
};

describe("SupabaseBaZiSoloStore", () => {
  it("saveRun: upsert bazi_run + delete-then-insert bazi_raw_bundle; gatewayIssues+warnings folded into qa_state", async () => {
    const { client, writes } = fakeClient({});
    await new SupabaseBaZiSoloStore(client).saveRun(READY_RECORD);
    const runUp = writes.find((w) => w.table === "bazi_run" && w.op === "upsert")!;
    expect(runUp.payload).toMatchObject({ id: "run-1", status: "ready_for_shipping" });
    expect(runUp.opts?.onConflict).toBe("id");
    // run_id has no unique constraint → delete-then-insert (NOT upsert) for idempotency:
    const bundleDel = writes.find((w) => w.table === "bazi_raw_bundle" && w.op === "delete");
    const bundleIns = writes.find((w) => w.table === "bazi_raw_bundle" && w.op === "insert")!;
    expect(bundleDel).toBeDefined();
    expect(writes.filter((w) => w.table === "bazi_raw_bundle" && w.op === "upsert")).toHaveLength(0);
    expect(bundleIns.payload!.svg).toBe("<svg/>");
    // the durable fold — no dedicated columns for these:
    const qa = bundleIns.payload!.qa_state as Record<string, unknown>;
    expect(qa.gatewayIssues).toEqual([{ code: "NONE" }]);
    expect(qa.warnings).toEqual(["w1"]);
    expect(qa.fontPostscriptName).toBe("NotoSansSC-Thin");
  });

  it("getRun reconstructs the full record out of both rows + qa_state", async () => {
    const { client } = fakeClient({
      rows: {
        bazi_run: { id: "run-1", status: "ready_for_shipping", sim_order: { orderId: "o1", birthDate: "1990-02-06" }, blocked_reason: null, created_at: "2026-06-22T00:00:00Z" },
        bazi_raw_bundle: {
          run_id: "run-1",
          requests: [{ op: "bazi" }],
          responses: [{ op: "bazi", data: {} }],
          svg: "<svg/>",
          codepoint_manifest: [{ key: "k", char: "庚", codepoint: 24218, glyphId: 1, hasPath: true }],
          qa_state: { gatewayIssues: [{ code: "NONE" }], warnings: ["w1"], failedGates: null, fontPostscriptName: "NotoSansSC-Thin", reason: null },
        },
      },
    });
    const rec = await new SupabaseBaZiSoloStore(client).getRun("run-1");
    expect(rec).not.toBeNull();
    expect(rec!.status).toBe("ready_for_shipping");
    expect(rec!.rawBundle.gatewayIssues).toEqual([{ code: "NONE" }]); // rebuilt from qa_state
    expect(rec!.rawBundle.warnings).toEqual(["w1"]);
    expect(rec!.artifact?.svg).toBe("<svg/>");
    expect(rec!.artifact?.fontPostscriptName).toBe("NotoSansSC-Thin");
  });

  it("getRun returns null when no bazi_run row exists", async () => {
    const { client } = fakeClient({ rows: {} });
    expect(await new SupabaseBaZiSoloStore(client).getRun("nope")).toBeNull();
  });

  it("fails loud on a supabase upsert error (never a silent partial success)", async () => {
    const { client } = fakeClient({ upsertError: { message: "boom" } });
    await expect(new SupabaseBaZiSoloStore(client).saveRun(READY_RECORD)).rejects.toThrow(/SUPABASE_BAZI_STORE_ERROR \(saveRun:bazi_run\): boom/);
  });

  it("fails loud on a supabase select error", async () => {
    const { client } = fakeClient({ rows: { bazi_run: { id: "run-1" } }, selectError: { message: "readfail" } });
    await expect(new SupabaseBaZiSoloStore(client).getRun("run-1")).rejects.toThrow(/SUPABASE_BAZI_STORE_ERROR \(getRun:bazi_run\): readfail/);
  });
});
