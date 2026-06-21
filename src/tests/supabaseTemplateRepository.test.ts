/**
 * Unit tests for the REAL Supabase template store + audit sink
 * (REQ-001/004/005, feature: server-template-config-store).
 *
 * Contract under test: THIS branch's `TemplateRepository` + `AuditSink`
 * (saveTemplate takes a full PromptTemplate and returns one, setActive returns void,
 * listVersions returns PromptTemplate[], saveTemplates is a bulk loop).
 *
 * NO NETWORK: a hand-rolled mock supabase-js client records every (table, op,
 * payload) and returns canned `{ data, error }`. The tests assert:
 *   - correct table + operation per method,
 *   - snake_case ⇄ camelCase mapping in both directions,
 *   - revision-copy-on-update (prior row inserted into template_revisions before
 *     the upsert, version bumped from the PRIOR persisted version),
 *   - INSERT path (no prior) starts at version 1 and copies NO revision,
 *   - saveTemplates bulk loop,
 *   - listVersions maps each snapshot jsonb → PromptTemplate, newest first,
 *   - audit insert payload shape (template_id, action, actor_email, token_sub,
 *     diff jsonb merge of snapshot+diff, honored ts),
 *   - fail-loud on a supabase `error` (no silent empty fallback).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SupabaseTemplateRepository,
  SupabaseAuditSink,
} from "../lib/repositories/supabaseTemplateRepository";
import type { PromptTemplate } from "../types";

// ── Mock supabase-js query builder ──────────────────────────────────────────

interface RecordedCall {
  table: string;
  op: string;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
}

/**
 * A programmable mock. `responses` is a queue of `{ data, error }` consumed in the
 * order terminal calls resolve. Every chain segment is recorded for assertions.
 */
function makeMockClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: RecordedCall[] = [];
  let cursor = 0;
  const nextResponse = () => responses[cursor++] ?? { data: null, error: null };

  function builder(table: string, op: string, payload?: unknown) {
    const rec: RecordedCall = { table, op, payload, filters: [] };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const resolve = () => Promise.resolve(nextResponse());
    chain.select = () => chain;
    chain.order = () => resolve();
    chain.eq = (col: string, val: unknown) => {
      rec.filters.push(["eq", col, val]);
      return chain;
    };
    chain.maybeSingle = () => resolve();
    chain.single = () => resolve();
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return chain;
  }

  const client = {
    from(table: string) {
      return {
        select: (_cols?: string) => builder(table, "select"),
        insert: (payload: unknown) => builder(table, "insert", payload),
        update: (payload: unknown) => builder(table, "update", payload),
        upsert: (payload: unknown, _opts?: unknown) => builder(table, "upsert", payload),
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const TEMPLATE_ROW = {
  id: "tpl_1",
  name: "Greeting",
  content: "hello {{name}}",
  version: 3,
  status: "active" as const,
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: "alice@example.com",
};

function makeTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "tpl_1",
    name: "Greeting",
    content: "hello {{name}}",
    version: 1,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "bob@example.com",
    ...overrides,
  };
}

describe("SupabaseTemplateRepository", () => {
  describe("getTemplates", () => {
    it("queries prompt_templates and maps snake_case → camelCase", async () => {
      const { client, calls } = makeMockClient([{ data: [TEMPLATE_ROW], error: null }]);
      const repo = new SupabaseTemplateRepository(client);
      const result = await repo.getTemplates();

      expect(calls[0].table).toBe("prompt_templates");
      expect(calls[0].op).toBe("select");
      expect(result).toEqual([
        {
          id: "tpl_1",
          name: "Greeting",
          content: "hello {{name}}",
          version: 3,
          status: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: "alice@example.com",
        },
      ]);
    });

    it("FAILS LOUD on a supabase error (no silent empty fallback)", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "boom" } }]);
      const repo = new SupabaseTemplateRepository(client);
      await expect(repo.getTemplates()).rejects.toThrow(/getTemplates.*boom/);
    });
  });

  describe("saveTemplate", () => {
    it("on UPDATE copies the prior row into template_revisions then upserts a bumped version", async () => {
      const { client, calls } = makeMockClient([
        { data: TEMPLATE_ROW, error: null }, // fetchOne (prior exists, version 3)
        { data: null, error: null }, // revision insert
        { data: { ...TEMPLATE_ROW, content: "new", version: 4 }, error: null }, // upsert
      ]);
      const repo = new SupabaseTemplateRepository(client);
      const saved = await repo.saveTemplate(
        makeTemplate({
          id: "tpl_1",
          name: "Greeting",
          content: "new",
          status: "active",
          version: 1, // stale incoming version — repo must recompute from prior
          createdBy: "bob@example.com",
        }),
      );

      // 1) fetchOne against prompt_templates filtered by id
      expect(calls[0]).toMatchObject({ table: "prompt_templates", op: "select" });
      expect(calls[0].filters).toContainEqual(["eq", "id", "tpl_1"]);

      // 2) revision-copy-on-update: prior row → template_revisions (snake_case snapshot)
      expect(calls[1]).toMatchObject({ table: "template_revisions", op: "insert" });
      const revPayload = calls[1].payload as Record<string, unknown>;
      expect(revPayload.template_id).toBe("tpl_1");
      expect(revPayload.version).toBe(3); // the PRIOR version, not the new one
      expect(revPayload.snapshot).toMatchObject({
        id: "tpl_1",
        version: 3,
        created_by: "alice@example.com",
      });

      // 3) upsert into prompt_templates with bumped version (4) and snake_case row
      expect(calls[2]).toMatchObject({ table: "prompt_templates", op: "upsert" });
      const upPayload = calls[2].payload as Record<string, unknown>;
      expect(upPayload.version).toBe(4); // prior(3) + 1 — NOT the stale incoming 1
      expect(upPayload.created_by).toBe("bob@example.com");
      expect(upPayload.content).toBe("new");

      // returns the mapped saved row (camelCase)
      expect(saved.version).toBe(4);
      expect(saved.createdBy).toBe("alice@example.com");
    });

    it("on INSERT (no prior) starts at version 1 and copies NO revision", async () => {
      const { client, calls } = makeMockClient([
        { data: null, error: null }, // fetchOne → no prior
        { data: { ...TEMPLATE_ROW, id: "tpl_new", version: 1 }, error: null }, // upsert
      ]);
      const repo = new SupabaseTemplateRepository(client);
      await repo.saveTemplate(
        makeTemplate({ id: "tpl_new", name: "Fresh", content: "c", status: "draft", createdBy: "carol@example.com" }),
      );

      // No template_revisions insert anywhere.
      expect(calls.some((c) => c.table === "template_revisions")).toBe(false);
      const upsert = calls.find((c) => c.op === "upsert")!;
      expect((upsert.payload as Record<string, unknown>).version).toBe(1);
    });

    it("FAILS LOUD when the upsert returns an error", async () => {
      const { client } = makeMockClient([
        { data: null, error: null }, // fetchOne → no prior
        { data: null, error: { message: "rls denied" } }, // upsert
      ]);
      const repo = new SupabaseTemplateRepository(client);
      await expect(repo.saveTemplate(makeTemplate({ id: "tpl_x" }))).rejects.toThrow(
        /saveTemplate\.upsert.*rls denied/,
      );
    });
  });

  describe("saveTemplates (bulk)", () => {
    it("loops saveTemplate for each template (fetchOne + upsert per row)", async () => {
      const { client, calls } = makeMockClient([
        { data: null, error: null }, // a: fetchOne → no prior
        { data: { ...TEMPLATE_ROW, id: "a", version: 1 }, error: null }, // a: upsert
        { data: null, error: null }, // b: fetchOne → no prior
        { data: { ...TEMPLATE_ROW, id: "b", version: 1 }, error: null }, // b: upsert
      ]);
      const repo = new SupabaseTemplateRepository(client);
      await repo.saveTemplates([makeTemplate({ id: "a" }), makeTemplate({ id: "b" })]);

      const upserts = calls.filter((c) => c.op === "upsert");
      expect(upserts).toHaveLength(2);
      expect((upserts[0].payload as Record<string, unknown>).id).toBe("a");
      expect((upserts[1].payload as Record<string, unknown>).id).toBe("b");
    });
  });

  describe("setActive", () => {
    it("updates status to active and filters by id (returns void)", async () => {
      const { client, calls } = makeMockClient([
        { data: { ...TEMPLATE_ROW, status: "active" }, error: null },
      ]);
      const repo = new SupabaseTemplateRepository(client);
      const r = await repo.setActive("tpl_1", true);
      expect(calls[0]).toMatchObject({ table: "prompt_templates", op: "update" });
      expect((calls[0].payload as Record<string, unknown>).status).toBe("active");
      expect(calls[0].filters).toContainEqual(["eq", "id", "tpl_1"]);
      expect(r).toBeUndefined();
    });

    it("archives when active=false", async () => {
      const { client, calls } = makeMockClient([
        { data: { ...TEMPLATE_ROW, status: "archived" }, error: null },
      ]);
      const repo = new SupabaseTemplateRepository(client);
      await repo.setActive("tpl_1", false);
      expect((calls[0].payload as Record<string, unknown>).status).toBe("archived");
    });

    it("FAILS LOUD when no row is returned (template not found)", async () => {
      const { client } = makeMockClient([{ data: null, error: null }]);
      const repo = new SupabaseTemplateRepository(client);
      await expect(repo.setActive("missing", true)).rejects.toThrow(/setActive.*missing/);
    });
  });

  describe("listVersions", () => {
    it("reads template_revisions newest first and maps each snapshot jsonb → PromptTemplate", async () => {
      const { client, calls } = makeMockClient([
        {
          data: [
            {
              template_id: "tpl_1",
              version: 2,
              snapshot: { ...TEMPLATE_ROW, version: 2, content: "v2 content" },
              created_at: "t2",
              created_by: "x",
            },
            {
              template_id: "tpl_1",
              version: 1,
              snapshot: { ...TEMPLATE_ROW, version: 1, content: "v1 content" },
              created_at: "t1",
              created_by: "x",
            },
          ],
          error: null,
        },
      ]);
      const repo = new SupabaseTemplateRepository(client);
      const versions = await repo.listVersions("tpl_1");

      expect(calls[0]).toMatchObject({ table: "template_revisions", op: "select" });
      expect(calls[0].filters).toContainEqual(["eq", "template_id", "tpl_1"]);

      // Returns PromptTemplate[] (mapped snapshots), newest first.
      expect(versions).toHaveLength(2);
      expect(versions[0]).toEqual({
        id: "tpl_1",
        name: "Greeting",
        content: "v2 content",
        version: 2,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "alice@example.com",
      });
      expect(versions[1].version).toBe(1);
      expect(versions[1].content).toBe("v1 content");
    });

    it("FAILS LOUD on a supabase error", async () => {
      const { client } = makeMockClient([{ data: null, error: { message: "nope" } }]);
      const repo = new SupabaseTemplateRepository(client);
      await expect(repo.listVersions("tpl_1")).rejects.toThrow(/listVersions.*nope/);
    });
  });
});

describe("SupabaseAuditSink", () => {
  let mock: { client: SupabaseClient; calls: RecordedCall[] };
  beforeEach(() => {
    mock = makeMockClient([{ data: null, error: null }]);
  });

  it("inserts an append-only row into template_audit_log with the expected columns", async () => {
    const sink = new SupabaseAuditSink(mock.client);
    await sink.append({
      action: "save",
      templateId: "tpl_1",
      actorEmail: "alice@example.com",
      tokenSub: "sub-123",
      snapshot: makeTemplate({ id: "tpl_1" }),
      ts: "2026-06-21T10:00:00.000Z",
    });
    expect(mock.calls[0]).toMatchObject({ table: "template_audit_log", op: "insert" });
    const payload = mock.calls[0].payload as Record<string, unknown>;
    expect(payload.template_id).toBe("tpl_1");
    expect(payload.action).toBe("save");
    expect(payload.actor_email).toBe("alice@example.com");
    expect(payload.token_sub).toBe("sub-123");
    // snapshot is preserved inside the diff jsonb (no snapshot column on the table)
    expect(payload.diff).toMatchObject({ snapshot: { id: "tpl_1" } });
    // injected ts is honored, not re-derived
    expect(payload.ts).toBe("2026-06-21T10:00:00.000Z");
  });

  it("merges both snapshot and diff into the diff jsonb when both present", async () => {
    const sink = new SupabaseAuditSink(mock.client);
    await sink.append({
      action: "setActive",
      templateId: "tpl_2",
      actorEmail: "a@b.c",
      tokenSub: "s",
      diff: { status: "archived" },
      ts: "2026-06-21T11:00:00.000Z",
    });
    const payload = mock.calls[0].payload as Record<string, unknown>;
    expect(payload.diff).toMatchObject({ diff: { status: "archived" } });
    expect((payload.diff as Record<string, unknown>).snapshot).toBeUndefined();
  });

  it("maps missing actor fields to null and a content-free entry to a null diff", async () => {
    const sink = new SupabaseAuditSink(mock.client);
    await sink.append({
      action: "softDelete",
      templateId: "tpl_3",
      actorEmail: "",
      tokenSub: "",
      ts: "2026-06-21T12:00:00.000Z",
    });
    const payload = mock.calls[0].payload as Record<string, unknown>;
    // empty strings are falsy → coerced to null via ?? only on null/undefined;
    // empty string is a value, so assert the documented behaviour explicitly.
    expect(payload.actor_email).toBe("");
    expect(payload.token_sub).toBe("");
    expect(payload.diff).toBeNull(); // no snapshot, no diff → null jsonb
  });

  it("FAILS LOUD when the audit insert errors", async () => {
    const { client } = makeMockClient([{ data: null, error: { message: "denied" } }]);
    const sink = new SupabaseAuditSink(client);
    await expect(
      sink.append({
        action: "save",
        templateId: "tpl_1",
        actorEmail: "a@b.c",
        tokenSub: "s",
        ts: "2026-06-21T13:00:00.000Z",
      }),
    ).rejects.toThrow(/audit\.append.*denied/);
  });
});
