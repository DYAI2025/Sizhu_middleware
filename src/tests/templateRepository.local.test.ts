/**
 * REQ-001 (server-side template store, Slice-1) — LocalTemplateRepository granular ops.
 *
 * DEMO_LOCAL parity for the granular template contract:
 *   - saveTemplate  : UPSERT by id; on UPDATE the prior snapshot is pushed to a
 *                     per-id revision history (so listVersions can return it).
 *   - setActive     : soft activate/deactivate (status active|archived) — NEVER deletes.
 *   - listVersions  : prior revisions, newest first; no version is ever physically lost.
 *
 * Slice-1 invariant: NO physical delete anywhere (soft-delete / versioning only).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { LocalTemplateRepository } from '../lib/repositories/localRepository';
import { PromptTemplate } from '../types';

// The local repo persists across cases in a single shared store (localStorage in a
// browser, a module-level memory map under Node). To keep each case isolated we
// (a) reset the live `templates` list to empty, and (b) give every case a UNIQUE
// template id so the per-id revision history of one case can never bleed into the
// next. `tid()` mints that id from the test name.
function makeTemplate(id: string, overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id,
    name: 'Test Template',
    content: 'original content',
    version: 1,
    status: 'draft',
    createdAt: new Date('2026-01-01').toISOString(),
    createdBy: 'tester',
    ...overrides
  };
}

describe('LocalTemplateRepository — granular ops (REQ-001, Slice-1)', () => {
  let repo: LocalTemplateRepository;
  let seq = 0;
  let id: string;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    repo = new LocalTemplateRepository();
    id = `tmpl-${seq++}`; // unique per case → revision history can't bleed across cases
    // Overwrite the seeded defaults with an empty list so each case is isolated.
    return repo.saveTemplates([]);
  });

  it('saveTemplate creates a new template and returns the saved row', async () => {
    const t = makeTemplate(id);
    const saved = await repo.saveTemplate(t);

    expect(saved).toEqual(t);
    const all = await repo.getTemplates();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(t);
  });

  it('saveTemplate on an existing id UPDATES in place and pushes the prior version to history', async () => {
    const v1 = makeTemplate(id, { content: 'original content', version: 1 });
    await repo.saveTemplate(v1);

    const v2 = makeTemplate(id, { content: 'updated content', version: 2 });
    await repo.saveTemplate(v2);

    // ONE row in the live list, carrying the new content.
    const all = await repo.getTemplates();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(v2);

    // The prior version is preserved in the revision history.
    const versions = await repo.listVersions(v1.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toEqual(v1);
  });

  it('a second update creates a new revision, newest first', async () => {
    const v1 = makeTemplate(id, { content: 'c1', version: 1 });
    const v2 = makeTemplate(id, { content: 'c2', version: 2 });
    const v3 = makeTemplate(id, { content: 'c3', version: 3 });
    await repo.saveTemplate(v1);
    await repo.saveTemplate(v2);
    await repo.saveTemplate(v3);

    const versions = await repo.listVersions(v1.id);
    expect(versions).toHaveLength(2);
    // newest prior revision first
    expect(versions[0]).toEqual(v2);
    expect(versions[1]).toEqual(v1);

    // live list still has exactly one row, the latest.
    const all = await repo.getTemplates();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(v3);
  });

  it('saveTemplate is idempotent by id: same input twice → one row, no spurious revision change', async () => {
    const t = makeTemplate(id);
    const first = await repo.saveTemplate(t);
    const second = await repo.saveTemplate(t);

    expect(second).toEqual(first);
    const all = await repo.getTemplates();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(t);
  });

  it('setActive(id, false) archives the template but keeps it present and its versions intact', async () => {
    const v1 = makeTemplate(id, { status: 'draft', content: 'c1', version: 1 });
    await repo.saveTemplate(v1);
    const v2 = makeTemplate(id, { status: 'active', content: 'c2', version: 2 });
    await repo.saveTemplate(v2);

    await repo.setActive(v1.id, false);

    // archived ≠ deleted: still present in the live list.
    const all = await repo.getTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(v1.id);
    expect(all[0].status).toBe('archived');

    // versions still intact (soft-delete / versioning only).
    const versions = await repo.listVersions(v1.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toEqual(v1);
  });

  it('setActive(id, true) activates the template', async () => {
    const t = makeTemplate(id, { status: 'archived' });
    await repo.saveTemplate(t);

    await repo.setActive(t.id, true);

    const all = await repo.getTemplates();
    expect(all[0].status).toBe('active');
  });

  it('listVersions returns [] for a template with no prior revisions', async () => {
    const t = makeTemplate(id);
    await repo.saveTemplate(t);
    expect(await repo.listVersions(t.id)).toEqual([]);
  });
});
