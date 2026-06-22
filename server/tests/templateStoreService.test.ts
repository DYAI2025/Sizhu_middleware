import { describe, it, expect, beforeEach } from 'vitest';
import {
  TemplateStoreService,
  TemplateValidationError,
  InMemoryAuditSink,
  type AuditSink,
  type AuditEntry,
  type Actor,
} from '../services/templateStoreService';
import type { TemplateRepository } from '../../src/lib/repositories/interfaces';
import type { PromptTemplate } from '../../src/types';

// ── In-memory TemplateRepository double ─────────────────────────────────────
// Models the real contract: saveTemplate UPSERTs by id and pushes the prior
// snapshot into a per-id revision history; setActive flips status; listVersions
// returns prior revisions newest-first. Soft-delete only — nothing is physically
// removed.
class InMemoryTemplateRepository implements TemplateRepository {
  private byId = new Map<string, PromptTemplate>();
  private versions = new Map<string, PromptTemplate[]>();

  async getTemplates(): Promise<PromptTemplate[]> {
    return [...this.byId.values()];
  }

  async saveTemplates(templates: PromptTemplate[]): Promise<void> {
    for (const t of templates) this.byId.set(t.id, t);
  }

  async saveTemplate(template: PromptTemplate): Promise<PromptTemplate> {
    const prior = this.byId.get(template.id);
    if (prior) {
      const hist = this.versions.get(template.id) ?? [];
      hist.unshift(prior); // newest-first
      this.versions.set(template.id, hist);
    }
    this.byId.set(template.id, template);
    return template;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const t = this.byId.get(id);
    if (!t) throw new Error(`template ${id} not found`);
    const prior = { ...t };
    const hist = this.versions.get(id) ?? [];
    hist.unshift(prior);
    this.versions.set(id, hist);
    this.byId.set(id, { ...t, status: active ? 'active' : 'archived' });
  }

  async listVersions(id: string): Promise<PromptTemplate[]> {
    return [...(this.versions.get(id) ?? [])];
  }
}

const ACTOR: Actor = { email: 'owner@sizhu.test', tokenSub: 'sub-123' };
const FIXED_TS = '2026-06-20T00:00:00.000Z';

function validTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: 't1',
    name: 'Birthday card',
    content: 'A {{zodiac}} themed card',
    version: 1,
    status: 'draft',
    createdAt: FIXED_TS,
    createdBy: ACTOR.email,
    ...overrides,
  };
}

describe('TemplateStoreService', () => {
  let repo: InMemoryTemplateRepository;
  let audit: InMemoryAuditSink;
  let svc: TemplateStoreService;

  beforeEach(() => {
    repo = new InMemoryTemplateRepository();
    audit = new InMemoryAuditSink();
    svc = new TemplateStoreService(repo, audit);
  });

  describe('saveTemplate (REQ-003 validation + REQ-004 audit)', () => {
    it('persists a valid template and writes exactly one audit entry', async () => {
      const t = validTemplate();
      const saved = await svc.saveTemplate(t, ACTOR, FIXED_TS);

      expect(saved.id).toBe('t1');
      const list = await svc.list();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 't1', name: 'Birthday card' });

      expect(audit.entries).toHaveLength(1);
      const entry = audit.entries[0];
      expect(entry).toMatchObject({
        actorEmail: ACTOR.email,
        tokenSub: ACTOR.tokenSub,
        action: 'save',
        templateId: 't1',
        ts: FIXED_TS,
      });
      // a diff/snapshot of what was written is carried
      expect(entry.snapshot ?? entry.diff).toBeDefined();
    });

    // RED-on-revert anchor: disabling validation (persisting anyway) makes this RED.
    it('rejects an invalid template: throws TemplateValidationError, does NOT persist, writes NO audit entry', async () => {
      const bad = validTemplate({ name: '' }); // required field empty → invalid

      await expect(svc.saveTemplate(bad, ACTOR, FIXED_TS)).rejects.toBeInstanceOf(
        TemplateValidationError,
      );

      // no fake-save
      expect(await svc.list()).toHaveLength(0);
      // no audit entry for a rejected write
      expect(audit.entries).toHaveLength(0);
    });

    it('rejects a template carrying unknown/dangerous fields', async () => {
      const bad = { ...validTemplate(), __proto__hack: 'x', isAdmin: true } as unknown as PromptTemplate;

      await expect(svc.saveTemplate(bad, ACTOR, FIXED_TS)).rejects.toBeInstanceOf(
        TemplateValidationError,
      );
      expect(await svc.list()).toHaveLength(0);
      expect(audit.entries).toHaveLength(0);
    });

    it('rejects a template with a malformed status', async () => {
      const bad = validTemplate({ status: 'published' as unknown as PromptTemplate['status'] });

      await expect(svc.saveTemplate(bad, ACTOR, FIXED_TS)).rejects.toBeInstanceOf(
        TemplateValidationError,
      );
      expect(audit.entries).toHaveLength(0);
    });
  });

  describe('setActive (REQ-005 + REQ-004 audit)', () => {
    it('archives a template and writes exactly one audit entry', async () => {
      await svc.saveTemplate(validTemplate({ status: 'active' }), ACTOR, FIXED_TS);
      audit.clear();

      await svc.setActive('t1', false, ACTOR, FIXED_TS);

      const t = await svc.get('t1');
      expect(t?.status).toBe('archived');

      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]).toMatchObject({
        action: 'setActive',
        templateId: 't1',
        actorEmail: ACTOR.email,
        ts: FIXED_TS,
      });
    });
  });

  describe('softDelete (REQ-005 — no physical delete)', () => {
    it('archives the template, keeps prior revisions readable, and audits', async () => {
      await svc.saveTemplate(validTemplate({ status: 'active', content: 'v1' }), ACTOR, FIXED_TS);
      await svc.saveTemplate(validTemplate({ status: 'active', content: 'v2' }), ACTOR, FIXED_TS);
      audit.clear();

      await svc.softDelete('t1', ACTOR, FIXED_TS);

      const t = await svc.get('t1');
      expect(t?.status).toBe('archived');
      expect(t).not.toBeUndefined(); // not physically deleted

      const versions = await svc.versions('t1');
      expect(versions.length).toBeGreaterThan(0);
      // a prior revision is still readable
      expect(versions.some((v) => v.content === 'v1')).toBe(true);

      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]).toMatchObject({
        action: 'softDelete',
        templateId: 't1',
        ts: FIXED_TS,
      });
    });
  });

  describe('audit sink is append-only', () => {
    it('exposes no removal/update API on the sink contract', () => {
      const sink: AuditSink = audit;
      // append is the only mutating method on the contract
      expect(typeof sink.append).toBe('function');
      expect((sink as unknown as Record<string, unknown>).delete).toBeUndefined();
      expect((sink as unknown as Record<string, unknown>).remove).toBeUndefined();
      expect((sink as unknown as Record<string, unknown>).update).toBeUndefined();
      expect((sink as unknown as Record<string, unknown>).clearEntry).toBeUndefined();
    });

    it('appends in order; entries are never overwritten', async () => {
      await svc.saveTemplate(validTemplate({ id: 't1' }), ACTOR, FIXED_TS);
      await svc.saveTemplate(validTemplate({ id: 't2' }), ACTOR, FIXED_TS);

      const entries: readonly AuditEntry[] = audit.entries;
      expect(entries).toHaveLength(2);
      expect(entries[0].templateId).toBe('t1');
      expect(entries[1].templateId).toBe('t2');
    });
  });

  describe('clock injectability (ts must be injectable)', () => {
    it('uses the injected ts rather than wall-clock', async () => {
      const custom = '1999-12-31T23:59:59.000Z';
      await svc.saveTemplate(validTemplate(), ACTOR, custom);
      expect(audit.entries[0].ts).toBe(custom);
    });
  });
});
