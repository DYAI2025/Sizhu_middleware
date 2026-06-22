/**
 * Real server-side Supabase persistence for prompt templates + audit trail
 * (REQ-001/004/005, feature: server-template-config-store).
 *
 * SECURITY: these classes are constructed ONLY on the server with a service-role
 * supabase client (see `server/index.ts`). The service-role key never reaches the
 * browser bundle (no VITE_ prefix; the client is built server-side and injected
 * here). This module takes an already-built `SupabaseClient` so it stays
 * test-mockable and free of any key-reading itself.
 *
 * Column mapping (live tables verified):
 *   prompt_templates    : id, name, content, version, status, created_at, created_by  (snake_case)
 *   template_revisions  : id, template_id, version, snapshot (jsonb), created_at, created_by
 *   template_audit_log  : id, template_id, action, actor_email, token_sub, diff (jsonb), ts
 *
 * Every Supabase call checks `{ data, error }` and FAILS LOUD on `error` — no silent
 * empty-array fallback that would mask a misconfigured boundary as "no templates".
 *
 * Contract: implements THIS branch's `TemplateRepository`
 * (src/lib/repositories/interfaces.ts) — `saveTemplate` takes a full PromptTemplate
 * and returns the saved one, `setActive` returns void, `listVersions` returns
 * `PromptTemplate[]` (the prior revision snapshots, newest first), and `saveTemplates`
 * is a bulk loop. Soft-delete / versioning only: nothing is ever physically removed
 * and no revision is lost.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PromptTemplate } from "../../types";
import type { TemplateRepository } from "./interfaces";
import type { AuditEntry, AuditSink } from "../../../server/services/templateStoreService";

const TABLE_TEMPLATES = "prompt_templates";
const TABLE_REVISIONS = "template_revisions";
const TABLE_AUDIT = "template_audit_log";

const TEMPLATE_COLUMNS = "id,name,content,version,status,created_at,created_by";

/** Shape of a `prompt_templates` row as Supabase returns it (snake_case). */
interface TemplateRow {
  id: string;
  name: string;
  content: string;
  version: number;
  status: PromptTemplate["status"];
  created_at: string;
  created_by: string;
}

/** Shape of a `template_revisions` row. */
interface RevisionRow {
  template_id: string;
  version: number;
  snapshot: unknown;
  created_at: string;
  created_by: string | null;
}

/** Map a snake_case DB row → the camelCase domain `PromptTemplate`. */
function rowToTemplate(row: TemplateRow): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/** Map a camelCase domain `PromptTemplate` → a snake_case `prompt_templates` row. */
function templateToRow(t: PromptTemplate): TemplateRow {
  return {
    id: t.id,
    name: t.name,
    content: t.content,
    version: t.version,
    status: t.status,
    created_at: t.createdAt,
    created_by: t.createdBy,
  };
}

/** Throw with table+op context when a supabase call returns an error. */
function assertNoError(op: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`SUPABASE_TEMPLATE_STORE_ERROR (${op}): ${error.message ?? "unknown error"}`);
  }
}

export class SupabaseTemplateRepository implements TemplateRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getTemplates(): Promise<PromptTemplate[]> {
    const { data, error } = await this.client
      .from(TABLE_TEMPLATES)
      .select(TEMPLATE_COLUMNS)
      .order("created_at", { ascending: false });
    assertNoError("getTemplates", error);
    return ((data as TemplateRow[] | null) ?? []).map(rowToTemplate);
  }

  /** Fetch the single current row for an id, or null if it does not exist. */
  private async fetchOne(id: string): Promise<PromptTemplate | null> {
    const { data, error } = await this.client
      .from(TABLE_TEMPLATES)
      .select(TEMPLATE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    assertNoError("fetchOne", error);
    return data ? rowToTemplate(data as TemplateRow) : null;
  }

  /**
   * UPSERT a template by id. On an UPDATE the PRIOR row is copied into
   * `template_revisions` BEFORE overwriting, and the version is bumped (the repo is
   * the authority on versioning, so the incoming `version` is recomputed from the
   * prior persisted row — prior+1, or 1 for a fresh insert). The incoming
   * `name`/`content`/`status`/`createdBy`/`createdAt` are preserved.
   */
  async saveTemplate(template: PromptTemplate): Promise<PromptTemplate> {
    const prior = await this.fetchOne(template.id);

    // On UPDATE: copy the PRIOR row into the revision history BEFORE overwriting.
    if (prior) {
      const { error: revError } = await this.client.from(TABLE_REVISIONS).insert({
        template_id: prior.id,
        version: prior.version,
        snapshot: templateToRow(prior),
        created_at: prior.createdAt,
        created_by: prior.createdBy,
      });
      assertNoError("saveTemplate.revisionCopy", revError);
    }

    const nextRow: TemplateRow = {
      id: template.id,
      name: template.name,
      content: template.content,
      status: template.status,
      version: prior ? prior.version + 1 : 1,
      created_at: template.createdAt,
      created_by: template.createdBy,
    };

    const { data, error } = await this.client
      .from(TABLE_TEMPLATES)
      .upsert(nextRow, { onConflict: "id" })
      .select(TEMPLATE_COLUMNS)
      .single();
    assertNoError("saveTemplate.upsert", error);
    if (!data) {
      throw new Error("SUPABASE_TEMPLATE_STORE_ERROR (saveTemplate.upsert): no row returned");
    }
    return rowToTemplate(data as TemplateRow);
  }

  /** Bulk upsert — loops `saveTemplate` so each gets revision-copy + version bump. */
  async saveTemplates(templates: PromptTemplate[]): Promise<void> {
    for (const t of templates) {
      await this.saveTemplate(t);
    }
  }

  /** Soft activate/deactivate: flip status to `active`/`archived`. Never deletes. */
  async setActive(id: string, active: boolean): Promise<void> {
    const { data, error } = await this.client
      .from(TABLE_TEMPLATES)
      .update({ status: active ? "active" : "archived" })
      .eq("id", id)
      .select(TEMPLATE_COLUMNS)
      .single();
    assertNoError("setActive", error);
    if (!data) {
      throw new Error(`SUPABASE_TEMPLATE_STORE_ERROR (setActive): template not found: ${id}`);
    }
  }

  /**
   * Prior revisions of a template, newest first. Each row's `snapshot` jsonb is the
   * snake_case row that was current at that version; map it back to a PromptTemplate.
   */
  async listVersions(id: string): Promise<PromptTemplate[]> {
    const { data, error } = await this.client
      .from(TABLE_REVISIONS)
      .select("template_id,version,snapshot,created_at,created_by")
      .eq("template_id", id)
      .order("version", { ascending: false });
    assertNoError("listVersions", error);
    return ((data as RevisionRow[] | null) ?? []).map((r) =>
      rowToTemplate(r.snapshot as TemplateRow),
    );
  }
}

/**
 * Append-only audit sink backed by `template_audit_log`. Insert-only: never reads or
 * mutates prior rows, matching the `AuditSink` contract.
 *
 * The live table has a single `diff` jsonb column (no `snapshot` column), so the
 * entry's `snapshot` (present on `save`) and `diff` (present on state changes) are
 * merged losslessly into the `diff` jsonb. The injected `ts` is honored (never
 * re-derived from wall-clock), keeping the audit timestamp identical to the one
 * recorded by the service.
 */
export class SupabaseAuditSink implements AuditSink {
  constructor(private readonly client: SupabaseClient) {}

  async append(entry: AuditEntry): Promise<void> {
    const diffPayload: Record<string, unknown> = {};
    if (entry.snapshot !== undefined) diffPayload.snapshot = entry.snapshot;
    if (entry.diff !== undefined) diffPayload.diff = entry.diff;

    const { error } = await this.client.from(TABLE_AUDIT).insert({
      template_id: entry.templateId,
      action: entry.action,
      actor_email: entry.actorEmail ?? null,
      token_sub: entry.tokenSub ?? null,
      diff: Object.keys(diffPayload).length > 0 ? diffPayload : null,
      ts: entry.ts,
    });
    assertNoError("audit.append", error);
  }
}
