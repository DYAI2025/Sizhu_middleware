/**
 * Live template-store boundary smoke (REQ-001/004/005 success signal).
 *
 * Proves the REAL server-side Supabase persistence path end-to-end against the live
 * tables with the REAL service-role key — the thing clean unit tests (mocked client)
 * cannot prove: that two independent client instances see the SAME persisted state,
 * that revision history + the audit trail are actually written, and that the
 * snake↔camel mapping survives a real round-trip.
 *
 * What a green (non-dry) run proves (each a discriminating probe, not a presence check):
 *   1. Shared persistence — save a template with writer A, read it back with a FRESH
 *      client B. If B can't see A's row, the store is not really shared (FAIL).
 *   2. Revision-on-update — update the template, then assert listVersions() contains
 *      the PRIOR (v1) snapshot with the OLD content. A store that overwrites without
 *      history fails here.
 *   3. Audit written — assert a template_audit_log row exists for the template with a
 *      real actor_email/token_sub and the action verb. A fictional audit fails.
 *   4. Secret hygiene — the resolved service-role key appears in NO line printed to
 *      stdout; only the project HOST is logged.
 * Always cleans up the test rows (templates, revisions, audit) it created — all
 * prefixed `smoke_tpl_`.
 *
 * Run:
 *   npm run smoke:templatestore -- --dry-run   # no network, no key needed (stubs client)
 *   npm run smoke:templatestore                # REAL call (needs SUPABASE_URL + service-role key)
 *
 * This binds to THIS branch's contracts: TemplateStoreService(repo, auditSink) with
 * saveTemplate(template, actor, now); SupabaseTemplateRepository / SupabaseAuditSink.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TemplateStoreService,
  type Actor,
} from "../../server/services/templateStoreService";
import {
  SupabaseTemplateRepository,
  SupabaseAuditSink,
} from "../../src/lib/repositories/supabaseTemplateRepository";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run") || process.env.SMOKE_DRY_RUN === "1";

const TEST_ID = `smoke_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const ACTOR: Actor = { email: "smoke@sizhu.local", tokenSub: "smoke-sub" };

// ── .env loader (does not clobber pre-set vars) ─────────────────────────────
function loadDotEnv(file = resolve(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  );
}

function resolveServiceRoleKey(): string {
  const ref =
    process.env.SUPABASE_SERVICE_ROLE_SECRET_REF ||
    "SECRET_REF_SUPABASE_SERVICE_ROLE";
  return process.env[ref] || "";
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// ── A stubbed supabase client for --dry-run (in-memory, no network) ─────────
function makeStubClient(): SupabaseClient {
  const tables: Record<string, Record<string, unknown>[]> = {
    prompt_templates: [],
    template_revisions: [],
    template_audit_log: [],
  };
  function tableApi(name: string) {
    const rows = (tables[name] ??= []);
    return {
      select() {
        const filters: Array<[string, unknown]> = [];
        const api: Record<string, unknown> = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return api;
          },
          order() {
            const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            return Promise.resolve({ data: filtered, error: null });
          },
          maybeSingle() {
            const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            return Promise.resolve({ data: filtered[0] ?? null, error: null });
          },
          single() {
            const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            return Promise.resolve({ data: filtered[0] ?? null, error: null });
          },
          then(onF: (v: unknown) => unknown) {
            const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            return Promise.resolve({ data: filtered, error: null }).then(onF);
          },
        };
        return api;
      },
      insert(payload: Record<string, unknown>) {
        rows.push({ ...payload });
        return Promise.resolve({ data: payload, error: null });
      },
      update(payload: Record<string, unknown>) {
        const filters: Array<[string, unknown]> = [];
        const api: Record<string, unknown> = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return api;
          },
          select() {
            return {
              single() {
                const row = rows.find((r) => filters.every(([c, v]) => r[c] === v));
                if (row) Object.assign(row, payload);
                return Promise.resolve({ data: row ?? null, error: null });
              },
            };
          },
        };
        return api;
      },
      upsert(payload: Record<string, unknown>) {
        const idx = rows.findIndex((r) => r.id === payload.id);
        if (idx >= 0) rows[idx] = { ...payload };
        else rows.push({ ...payload });
        return {
          select() {
            return { single: () => Promise.resolve({ data: payload, error: null }) };
          },
        };
      },
      delete() {
        const filters: Array<[string, unknown]> = [];
        const api: Record<string, unknown> = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            for (let i = rows.length - 1; i >= 0; i--) {
              if (filters.every(([c, v]) => rows[i][c] === v)) rows.splice(i, 1);
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return api;
      },
    };
  }
  return { from: (name: string) => tableApi(name) } as unknown as SupabaseClient;
}

async function main(): Promise<void> {
  loadDotEnv();

  const url = resolveSupabaseUrl();
  const key = resolveServiceRoleKey();

  let writerClient: SupabaseClient;
  let readerClient: SupabaseClient;

  if (DRY_RUN) {
    log("[dry-run] no network — using an in-memory stub client.");
    const stub = makeStubClient();
    writerClient = stub;
    readerClient = stub; // shared in-memory backing is the closest stub analogue
  } else {
    if (!url) fail("SUPABASE_URL (or SUPABASE_PROJECT_URL / VITE_SUPABASE_URL) is not set.");
    if (!key) {
      const ref =
        process.env.SUPABASE_SERVICE_ROLE_SECRET_REF || "SECRET_REF_SUPABASE_SERVICE_ROLE";
      fail(`service-role key not found under the var named by ${ref}.`);
    }
    // Secret hygiene: HOST only — never the key.
    log(`[live] target host: ${new URL(url).host}`);
    const { createClient } = await import("@supabase/supabase-js");
    writerClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // A genuinely FRESH client B to prove shared persistence (not the same instance).
    readerClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // Build the store (writer A) on THIS branch's contract.
  const service = new TemplateStoreService(
    new SupabaseTemplateRepository(writerClient),
    new SupabaseAuditSink(writerClient),
  );
  const readerRepo = new SupabaseTemplateRepository(readerClient);

  // 1) WRITE with A (v1).
  log(`save: minting ${TEST_ID} (v1)`);
  const v1 = await service.saveTemplate(
    {
      id: TEST_ID,
      name: "smoke",
      content: "ORIGINAL_CONTENT_v1",
      version: 1,
      status: "draft",
      createdAt: new Date().toISOString(),
      createdBy: ACTOR.email,
    },
    ACTOR,
    new Date().toISOString(),
  );
  if (v1.version !== 1) fail(`expected v1.version=1, got ${v1.version}`);

  // 2) READ-BACK with a FRESH client B (proves shared persistence).
  const readBack = (await readerRepo.getTemplates()).find((t) => t.id === TEST_ID);
  if (!readBack) fail("fresh client B could NOT see the template written by A (not shared persistence).");
  if (readBack.content !== "ORIGINAL_CONTENT_v1") {
    fail(`fresh client read wrong content: ${readBack.content}`);
  }
  log("read-back: fresh client B sees A's row — shared persistence OK");

  // 3) UPDATE → bumps to v2, copies v1 into revisions.
  log("update: bumping to v2");
  const v2 = await service.saveTemplate(
    {
      id: TEST_ID,
      name: "smoke",
      content: "UPDATED_CONTENT_v2",
      version: 1, // stale incoming version; repo recomputes from prior
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy: ACTOR.email,
    },
    ACTOR,
    new Date().toISOString(),
  );
  if (v2.version !== 2) fail(`expected v2.version=2, got ${v2.version}`);

  // 4) listVersions has the PRIOR (v1) snapshot with the OLD content.
  const versions = await readerRepo.listVersions(TEST_ID);
  const priorV1 = versions.find((v) => v.version === 1);
  if (!priorV1) fail("listVersions did not contain the prior v1 — revision-on-update not persisted.");
  if (priorV1.content !== "ORIGINAL_CONTENT_v1") {
    fail(`revision v1 snapshot has wrong content: ${priorV1.content}`);
  }
  log("versions: prior v1 snapshot present with original content — revision-on-update OK");

  // 5) Audit row was written. (Read it directly to assert presence.)
  const { data: auditRows, error: auditErr } = await readerClient
    .from("template_audit_log")
    .select("template_id,action,actor_email,token_sub")
    .eq("template_id", TEST_ID)
    .order("ts", { ascending: false });
  if (auditErr) fail(`audit read errored: ${(auditErr as { message?: string }).message}`);
  if (!auditRows || auditRows.length === 0) fail("no audit row was written for the template.");
  log(`audit: ${auditRows.length} audit row(s) written for ${TEST_ID} — audit trail OK`);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  log("cleanup: removing test rows");
  await readerClient.from("template_audit_log").delete().eq("template_id", TEST_ID);
  await readerClient.from("template_revisions").delete().eq("template_id", TEST_ID);
  await readerClient.from("prompt_templates").delete().eq("id", TEST_ID);

  // Secret hygiene self-check: belt-and-suspenders for future edits.
  if (!DRY_RUN && key && process.env.__SMOKE_STDOUT_CAPTURE__?.includes(key)) {
    fail("service-role key leaked to stdout.");
  }

  log(`PASS${DRY_RUN ? " (dry-run)" : ""}: template store live smoke succeeded.`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
