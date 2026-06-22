/**
 * TemplateStoreService — server-template-config-store, Slice-1 (REQ-003/004/005).
 *
 * A thin, dependency-injected wrapper around a {@link TemplateRepository} that adds,
 * on every write:
 *   1. REQ-003 — save-validation BEFORE persist (allowlist + well-formedness).
 *      An invalid template is NEVER persisted (no fake-save) and produces NO audit
 *      entry; the caller gets a typed {@link TemplateValidationError} (route → 422).
 *   2. REQ-004 — an append-only audit entry for every mutating op (save/setActive/
 *      softDelete). The sink ({@link AuditSink}) exposes ONLY `append` — no update or
 *      delete — so the log is structurally append-only.
 *   3. REQ-005 — soft-delete / versioning: `softDelete(id)` archives via
 *      `setActive(id, false)`; prior revisions stay readable through `versions(id)`.
 *      Nothing is physically removed.
 *
 * `ts` is injectable (an explicit param) so tests need not rely on `Date.now()`,
 * which may be restricted in the test environment.
 */
import type { TemplateRepository } from '../../src/lib/repositories/interfaces';
import type { PromptTemplate } from '../../src/types';

// ── Actor / audit contracts ─────────────────────────────────────────────────

/** The authenticated identity performing a mutating op (from the verified token). */
export interface Actor {
  email: string;
  tokenSub: string;
}

/** A single append-only audit record for one mutating operation. */
export interface AuditEntry {
  actorEmail: string;
  tokenSub: string;
  action: 'save' | 'setActive' | 'softDelete';
  templateId: string;
  /** A snapshot of the written template (save) — present for create/update writes. */
  snapshot?: PromptTemplate;
  /** A coarse diff for non-content state changes (e.g. status flip). */
  diff?: Record<string, unknown>;
  /** Injected ISO timestamp (never read from wall-clock here). */
  ts: string;
}

/**
 * Append-only audit sink. By contract there is NO `update`/`delete`/`remove` — the
 * only mutating method is `append`. This makes the log structurally tamper-evident.
 */
export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
}

/** In-memory {@link AuditSink} for tests. Append-only by contract. */
export class InMemoryAuditSink implements AuditSink {
  private readonly _entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this._entries.push(entry);
  }

  /** Read-only view of appended entries (test/diagnostic helper, not a mutator). */
  get entries(): readonly AuditEntry[] {
    return this._entries;
  }

  /** Test convenience — reset between arrange/act phases. NOT part of {@link AuditSink}. */
  clear(): void {
    this._entries.length = 0;
  }
}

// ── Validation (REQ-003) ────────────────────────────────────────────────────

/** Thrown when a template fails save-validation. Routes map this to HTTP 422. */
export class TemplateValidationError extends Error {
  readonly code = 'TEMPLATE_VALIDATION_ERROR' as const;
  /** Per-field reasons, for a structured 422 body. */
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Template validation failed: ${issues.join('; ')}`);
    this.name = 'TemplateValidationError';
    this.issues = issues;
  }
}

/** Exact allowlist of fields a PromptTemplate may carry. Unknown fields → reject. */
const ALLOWED_FIELDS: ReadonlySet<keyof PromptTemplate> = new Set([
  'id',
  'name',
  'content',
  'version',
  'status',
  'createdAt',
  'createdBy',
]);

const VALID_STATUSES: ReadonlySet<PromptTemplate['status']> = new Set([
  'draft',
  'active',
  'archived',
]);

/**
 * Validate a candidate against the PromptTemplate schema/allowlist.
 * Returns the issues array (empty ⇒ valid). Pure — performs no I/O, no mutation.
 */
function validateTemplate(candidate: unknown): string[] {
  const issues: string[] = [];

  if (candidate === null || typeof candidate !== 'object') {
    return ['template must be an object'];
  }
  const t = candidate as Record<string, unknown>;

  // Reject unknown / dangerous fields (allowlist).
  for (const key of Object.keys(t)) {
    if (!ALLOWED_FIELDS.has(key as keyof PromptTemplate)) {
      issues.push(`unknown field: ${key}`);
    }
  }

  // Required, well-formed string fields.
  for (const field of ['id', 'name', 'content', 'createdAt', 'createdBy'] as const) {
    const v = t[field];
    if (typeof v !== 'string' || v.trim() === '') {
      issues.push(`${field} is required and must be a non-empty string`);
    }
  }

  // version: positive integer.
  if (typeof t.version !== 'number' || !Number.isInteger(t.version) || t.version < 1) {
    issues.push('version must be a positive integer');
  }

  // status: one of the allowed enum values.
  if (typeof t.status !== 'string' || !VALID_STATUSES.has(t.status as PromptTemplate['status'])) {
    issues.push(`status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  return issues;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class TemplateStoreService {
  constructor(
    private readonly repo: TemplateRepository,
    private readonly audit: AuditSink,
  ) {}

  /**
   * Validate (REQ-003) then UPSERT a template, then append one audit entry (REQ-004).
   * Throws {@link TemplateValidationError} BEFORE any persist or audit write on invalid
   * input — no fake-save, no orphan audit entry.
   */
  async saveTemplate(template: PromptTemplate, actor: Actor, now: string): Promise<PromptTemplate> {
    const issues = validateTemplate(template);
    if (issues.length > 0) {
      throw new TemplateValidationError(issues);
    }

    const saved = await this.repo.saveTemplate(template);

    await this.audit.append({
      actorEmail: actor.email,
      tokenSub: actor.tokenSub,
      action: 'save',
      templateId: saved.id,
      snapshot: saved,
      ts: now,
    });

    return saved;
  }

  /**
   * Flip a template's active state (active ⇒ `active`, inactive ⇒ `archived`) and
   * append one audit entry. No physical delete.
   */
  async setActive(id: string, active: boolean, actor: Actor, now: string): Promise<void> {
    await this.repo.setActive(id, active);
    await this.audit.append({
      actorEmail: actor.email,
      tokenSub: actor.tokenSub,
      action: 'setActive',
      templateId: id,
      diff: { status: active ? 'active' : 'archived' },
      ts: now,
    });
  }

  /**
   * Soft-delete (REQ-005): archive the template via deactivation. Prior revisions stay
   * readable through {@link versions}; nothing is physically removed. Appends one audit
   * entry tagged `softDelete` (distinct from a plain `setActive`).
   */
  async softDelete(id: string, actor: Actor, now: string): Promise<void> {
    await this.repo.setActive(id, false);
    await this.audit.append({
      actorEmail: actor.email,
      tokenSub: actor.tokenSub,
      action: 'softDelete',
      templateId: id,
      diff: { status: 'archived' },
      ts: now,
    });
  }

  /** All current templates. */
  async list(): Promise<PromptTemplate[]> {
    return this.repo.getTemplates();
  }

  /** A single current template by id, or `undefined` if absent. */
  async get(id: string): Promise<PromptTemplate | undefined> {
    const all = await this.repo.getTemplates();
    return all.find((t) => t.id === id);
  }

  /** Prior revisions of a template, newest-first (never physically lost). */
  async versions(id: string): Promise<PromptTemplate[]> {
    return this.repo.listVersions(id);
  }
}
