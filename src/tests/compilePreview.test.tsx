/**
 * compilePreview.test.tsx — focused integration test for the Compile Preview wiring.
 *
 * This project's vitest runs in the default `node` environment and has no
 * @testing-library/react / jsdom, so we test the real request→response→panel-model
 * path WITHOUT rendering JSX into a DOM:
 *   1. `compileTemplate()` is driven against a mocked `fetch` (and a mocked auth
 *      snapshot) to prove the request shape + Bearer-token auth pattern + parsing.
 *   2. `buildCompileResultModel()` is the exact pure function `<CompileResultPanel>`
 *      renders from — asserting on it proves what the panel will display.
 *
 * PASS case  → the panel surfaces the 庚午 year pillar and a PASS gate.
 * BLOCKED case → the panel VISIBLY surfaces the blocker (a blocked preview is shown,
 *                never a fake success).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth store so compileTemplate() can read an access token without a real session.
vi.mock('../lib/auth/authState', () => ({
  getAuthSnapshot: () => ({ accessToken: 'test-access-token' }),
}));

import {
  compileTemplate,
  buildCompileResultModel,
  type CompileTemplateResponse,
} from '../components/CompileResultPanel';

const PASS_RESPONSE: CompileTemplateResponse = {
  compiled: {
    variantId: 'v1',
    regionPolicy: 'CN_SIMPLIFIED',
    templatePlaceholders: {
      '{{year_pillar_hanzi}}': '庚午',
      '{{year_stem_hanzi}}': '庚',
      '{{year_branch_hanzi}}': '午',
    },
    rawDataBindings: {
      yearStem: 'data.pillars.year.stamm',
      yearBranch: 'data.pillars.year.zweig',
    },
    deterministicOverlayPlan: [],
    sourceStatus: { lichun: 'VERIFIED' },
    imageGenerationPrompt: 'A serene horse motif on warm paper.',
  },
  validation: {
    gates: [
      { gate: 'region_policy', required: 'regionPolicy === "CN_SIMPLIFIED"', status: 'PASS' },
      { gate: 'no_unknown_symbols', required: 'no SOURCE_NEEDED', status: 'PASS' },
    ],
    verdict: 'PASS',
    blockers: [],
  },
};

const BLOCKED_RESPONSE: CompileTemplateResponse = {
  compiled: {
    variantId: 'v1',
    regionPolicy: 'CN_SIMPLIFIED',
    templatePlaceholders: { '{{year_pillar_hanzi}}': '庚午' },
    rawDataBindings: {},
    deterministicOverlayPlan: [],
    sourceStatus: { yearStem: 'SOURCE_NEEDED' },
  },
  validation: {
    gates: [
      { gate: 'no_unknown_symbols', required: 'no SOURCE_NEEDED', status: 'FAIL' },
    ],
    verdict: 'BLOCKED',
    blockers: ['no_unknown_symbols'],
  },
};

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Compile Preview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/v1/compile-template with the templateId, raw response, and Bearer token', async () => {
    const fetchMock = mockFetchOnce(PASS_RESPONSE);
    const raw = { data: { pillars: {} } };

    await compileTemplate('tmpl-123', raw);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/compile-template');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(init.body)).toEqual({
      templateId: 'tmpl-123',
      rawFuFireResponse: raw,
    });
  });

  it('PASS result: panel model shows the 庚午 year pillar and a PASS gate', async () => {
    mockFetchOnce(PASS_RESPONSE);

    const response = await compileTemplate('tmpl-123', {});
    const model = buildCompileResultModel(response);

    expect(model.blocked).toBe(false);
    expect(model.yearPillarHanzi).toBe('庚午');
    expect(model.gates.some((g) => g.status === 'PASS')).toBe(true);
    // year pillar is also present in the flat placeholder list the panel maps over
    expect(
      model.placeholders.find((p) => p.token === '{{year_pillar_hanzi}}')?.value,
    ).toBe('庚午');
  });

  it('BLOCKED result: panel model visibly surfaces the blocker (no fake success)', async () => {
    mockFetchOnce(BLOCKED_RESPONSE);

    const response = await compileTemplate('tmpl-123', {});
    const model = buildCompileResultModel(response);

    expect(model.blocked).toBe(true);
    expect(model.blockers).toContain('no_unknown_symbols');
    // the failing gate is shown in the gates list, not hidden
    expect(
      model.gates.find((g) => g.gate === 'no_unknown_symbols')?.status,
    ).toBe('FAIL');
  });

  it('throws with the server error message on a non-2xx response', async () => {
    mockFetchOnce({ error: 'UNKNOWN_TEMPLATE', message: 'no such template' }, false, 400);

    await expect(compileTemplate('bad', {})).rejects.toThrow('no such template');
  });
});
