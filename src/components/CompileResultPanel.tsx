import React from 'react';
import { getAuthSnapshot } from '../lib/auth/authState';

/**
 * CompileResultPanel — renders the result of `POST /api/v1/compile-template`.
 *
 * Product rule (master prompt §5 + §12): a BLOCKED preview is SHOWN, never hidden
 * behind a fake success. So when `validation.verdict === "BLOCKED"` the blockers are
 * rendered FIRST and prominently — the panel makes the block visible.
 *
 * The data shaping lives in {@link buildCompileResultModel} (a pure function) so it can
 * be tested without a DOM, since this project's vitest runs in the `node` environment
 * and has no @testing-library/react / jsdom.
 */

// --- Response contract (mirrors server/index.ts POST /api/v1/compile-template) -------

export type GateStatus = 'PASS' | 'FAIL';
export type Verdict = 'PASS' | 'BLOCKED';

export interface CompileGate {
  gate: string;
  required: string;
  status: GateStatus;
}

export interface CompileValidation {
  gates: CompileGate[];
  verdict: Verdict;
  blockers: string[];
}

export interface CompileCompiled {
  variantId: string;
  regionPolicy: string;
  templatePlaceholders: Record<string, string>;
  rawDataBindings: Record<string, string>;
  deterministicOverlayPlan: Array<Record<string, unknown>>;
  sourceStatus: Record<string, string>;
  negativeConstraints?: string;
  imageGenerationPrompt?: string;
}

export interface CompileTemplateResponse {
  compiled: CompileCompiled;
  validation: CompileValidation;
}

// --- Presentation model (pure, DOM-free) ---------------------------------------------

export interface CompileResultModel {
  blocked: boolean;
  blockers: string[];
  yearPillarHanzi: string | null;
  imageGenerationPrompt: string | null;
  placeholders: Array<{ token: string; value: string }>;
  bindings: Array<{ field: string; path: string }>;
  gates: CompileGate[];
}

const YEAR_PILLAR_TOKEN = '{{year_pillar_hanzi}}';

/**
 * Shape a raw compile-template response into the flat, render-ready model the panel uses.
 * Pure — no React, no DOM — so it is the unit the focused test asserts against.
 *
 * @param response - the `{ compiled, validation }` payload from the API
 * @returns a flattened, render-ready presentation model
 */
export function buildCompileResultModel(
  response: CompileTemplateResponse,
): CompileResultModel {
  const compiled = response.compiled ?? ({} as CompileCompiled);
  const validation = response.validation ?? ({} as CompileValidation);
  const placeholders = compiled.templatePlaceholders ?? {};
  const bindings = compiled.rawDataBindings ?? {};

  return {
    blocked: validation.verdict === 'BLOCKED',
    blockers: validation.blockers ?? [],
    yearPillarHanzi: placeholders[YEAR_PILLAR_TOKEN] ?? null,
    imageGenerationPrompt: compiled.imageGenerationPrompt ?? null,
    placeholders: Object.entries(placeholders).map(([token, value]) => ({ token, value })),
    bindings: Object.entries(bindings).map(([field, path]) => ({ field, path })),
    gates: validation.gates ?? [],
  };
}

/**
 * Call the compile-template endpoint, reusing the app's Supabase access-token auth pattern
 * (the same `getAuthSnapshot().accessToken` the rest of the frontend reads). When a token is
 * present it is attached as a Bearer header so the server-side `apiGuard` admits the request.
 *
 * @throws {Error} on a non-2xx response, with the server's error_code/message when available
 */
export async function compileTemplate(
  templateId: string,
  rawFuFireResponse: unknown,
): Promise<CompileTemplateResponse> {
  const token = getAuthSnapshot().accessToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch('/api/v1/compile-template', {
    method: 'POST',
    headers,
    body: JSON.stringify({ templateId, rawFuFireResponse }),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = data as { message?: string; error?: string; error_code?: string } | null;
    throw new Error(
      err?.message || err?.error_code || err?.error || `Compile failed (HTTP ${res.status})`,
    );
  }

  return data as CompileTemplateResponse;
}

// --- Presentation ---------------------------------------------------------------------

export function CompileResultPanel({ response }: { response: CompileTemplateResponse }) {
  const model = buildCompileResultModel(response);

  return (
    <div
      data-testid="compile-result-panel"
      className="mt-3 border border-nt bg-b1 rounded-sm p-3 space-y-3 text-[10px] font-mono text-da"
    >
      {/* BLOCKED is shown FIRST and prominently — never hidden behind a fake success. */}
      {model.blocked && (
        <div
          data-testid="compile-blocked-banner"
          className="p-3 border border-red-500 bg-red-900/20 rounded-sm"
        >
          <strong className="text-red-400 uppercase tracking-wider">
            Blocked — preview not safe to proceed
          </strong>
          <ul className="list-disc pl-4 mt-1">
            {model.blockers.map((b) => (
              <li key={b} data-testid="compile-blocker" className="text-red-300">
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!model.blocked && (
        <div
          data-testid="compile-pass-banner"
          className="p-2 border border-emerald-500 bg-emerald-900/20 text-emerald-300 rounded-sm uppercase tracking-wider"
        >
          Compile PASS — preview cleared all quality gates
        </div>
      )}

      {/* Compiled prompt: template placeholders incl. {{year_pillar_hanzi}}. */}
      <div>
        <div className="font-bold text-nt uppercase border-b border-nt pb-1 mb-1">
          Compiled Prompt
        </div>
        {model.yearPillarHanzi && (
          <div data-testid="compile-year-pillar" className="mb-1">
            <span className="text-nt">{'{{year_pillar_hanzi}}'}:</span>{' '}
            <span className="font-bold">{model.yearPillarHanzi}</span>
          </div>
        )}
        <ul className="space-y-0.5">
          {model.placeholders.map((p) => (
            <li key={p.token}>
              <span className="text-nt">{p.token}:</span> {p.value}
            </li>
          ))}
        </ul>
        {model.imageGenerationPrompt && (
          <pre className="bg-[#3C3C3C] text-[#EDE3DA] p-2 rounded overflow-x-auto whitespace-pre-wrap mt-2">
            {model.imageGenerationPrompt}
          </pre>
        )}
      </div>

      {/* Raw data bindings. */}
      <div>
        <div className="font-bold text-nt uppercase border-b border-nt pb-1 mb-1">
          Raw Data Bindings
        </div>
        <ul className="space-y-0.5">
          {model.bindings.map((b) => (
            <li key={b.field}>
              <span className="text-nt">{b.field}</span> &rarr; {b.path}
            </li>
          ))}
        </ul>
      </div>

      {/* Quality gates. */}
      <div>
        <div className="font-bold text-nt uppercase border-b border-nt pb-1 mb-1">
          Quality Gates
        </div>
        <ul className="space-y-0.5">
          {model.gates.map((g) => (
            <li key={g.gate} data-testid="compile-gate" className="flex justify-between gap-2">
              <span>{g.gate}</span>
              <span
                className={g.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}
              >
                {g.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
