/**
 * Live OpenRouter quality-gate (vision) provider (REQ-LGQ, T-LGQ-4 / PRD §7).
 *
 * Drop-in for {@link QualityGateProvider}. Sends each candidate image + a
 * redacted scoring instruction to the vision model via
 * POST {baseUrl}/chat/completions and parses a numeric score from the model's
 * JSON reply.
 *
 * Guarantees:
 *  - No-fake-success (REQ-LGQ-007): a divergent score response (no parseable
 *    score, garbage shape) OR a non-2xx status throws
 *    {@link OpenRouterContractError} — NEVER a silent default-pass score.
 *  - No PII on the wire (REQ-LGQ-005 / F2): neither the raw `qaPrompt` nor the
 *    candidate's `metadata.promptUsed` is forwarded verbatim. The scoring text is
 *    reconstructed from non-PII derived vars ONLY (see piiRedaction); only the
 *    candidate IMAGE (data URI) is attached.
 *  - Key hygiene: key read SERVER-SIDE via the secret-ref; never logged/echoed.
 */

import { QualityGateProvider } from '../interfaces';
import { resolveOpenRouterCredentials } from '../../modelGateway/openRouterGateway';
import {
  OpenRouterContractError,
  OPENROUTER_CONTRACT_ERROR_CODES,
} from './errors';
import { buildRedactedPrompt, buildProvenanceString } from './piiRedaction';
import type { OpenRouterProviderOptions } from './openRouterImageGenerationProvider';

const QA_MAX_TOKENS = 512;
const OPERATION = 'quality_gate' as const;

type EnvSource = Record<string, string | undefined>;
type Evaluation = Awaited<ReturnType<QualityGateProvider['evaluate']>>[number];

export class OpenRouterQualityGateProvider implements QualityGateProvider {
  private readonly env: EnvSource;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.env = options.env ?? process.env;
  }

  async evaluate(
    candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
    minScore: number,
    qaPrompt: string,
    secretRef: string,
    model: string,
    resolvedVariables: any,
    _iteration: number,
  ): Promise<Evaluation[]> {
    const { baseUrl } = resolveOpenRouterCredentials(this.env);
    const apiKey = this.env[secretRef];
    if (!apiKey || apiKey.trim().length === 0) {
      throw new OpenRouterContractError(
        OPENROUTER_CONTRACT_ERROR_CODES.HTTP_NOT_OK,
        `OpenRouter quality gate aborted: no API key under secret-ref "${secretRef}".`,
        { operation: OPERATION, modelId: model },
      );
    }

    // PII redaction (F2): the scoring instruction is reconstructed from non-PII
    // derived vars ONLY. The raw `qaPrompt` and any candidate `metadata.promptUsed`
    // (both potential PII carriers) are NEVER forwarded verbatim.
    const redactedInstruction = buildRedactedPrompt(
      resolvedVariables,
      'Score how well this image works as an astrology totem print. Return ONLY JSON: {"score": <0-100 integer>, "reason": "<short>"}.',
    );

    const scored = await Promise.all(
      candidates.map((c) =>
        this.scoreOne(baseUrl, apiKey, model, redactedInstruction, c, minScore),
      ),
    );

    // Selection: highest passing score is accepted; other passers not_selected.
    let acceptedIndex: number | null = null;
    let highest = -1;
    for (const s of scored) {
      if (s.score >= minScore && s.score > highest) {
        highest = s.score;
        acceptedIndex = s.candidateIndex;
      }
    }

    return scored.map((s) => {
      let status: Evaluation['status'];
      if (s.score < minScore) status = 'rejected';
      else if (s.candidateIndex === acceptedIndex) status = 'accepted';
      else status = 'not_selected';
      return {
        candidateIndex: s.candidateIndex,
        score: s.score,
        status,
        reason: s.reason,
        detailedJson: s.detailedJson,
      };
    });
  }

  private async scoreOne(
    baseUrl: string,
    apiKey: string,
    model: string,
    redactedInstruction: string,
    candidate: { candidateIndex: number; storagePath: string; metadata: any },
    minScore: number,
  ): Promise<{
    candidateIndex: number;
    score: number;
    reason: string;
    detailedJson: string;
  }> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: QA_MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: redactedInstruction },
              // Only the candidate IMAGE crosses the wire — no PII-bearing text.
              { type: 'image_url', image_url: { url: candidate.storagePath } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new OpenRouterContractError(
        OPENROUTER_CONTRACT_ERROR_CODES.HTTP_NOT_OK,
        `OpenRouter quality gate failed with HTTP ${res.status}.`,
        { operation: OPERATION, httpStatus: res.status, modelId: model },
      );
    }

    const body: any = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    const score = parseScore(content);

    // No-fake-success: an unparseable/garbage score response FAILS LOUD — we
    // never substitute a default-pass score.
    if (score === null) {
      throw new OpenRouterContractError(
        OPENROUTER_CONTRACT_ERROR_CODES.RESPONSE_SHAPE_DRIFT,
        'OpenRouter quality-gate response did not contain a parseable numeric score.',
        { operation: OPERATION, httpStatus: res.status, modelId: model },
      );
    }

    const reason = parseReason(content);
    return {
      candidateIndex: candidate.candidateIndex,
      score,
      reason: reason ?? `Vision model scored ${score}/100 (threshold ${minScore}).`,
      // detailedJson is PII-safe: derived-var provenance only, never raw prompt.
      detailedJson: JSON.stringify({
        llm_model: model,
        score,
        threshold: minScore,
        provenance: buildProvenanceString({}),
      }),
    };
  }
}

/**
 * Parse a 0–100 integer score from the model reply. Accepts a JSON object with a
 * numeric `score`, or falls back to the first integer-in-range in free text.
 * Returns null when no valid finite score is found (→ caller fails loud).
 */
function parseScore(content: unknown): number | null {
  const text = extractText(content);
  if (!text) return null;

  // 1) Strict: a JSON object carrying { score: number }.
  const jsonScore = scoreFromJson(text);
  if (jsonScore !== null) return jsonScore;

  // 2) Fallback: a bare `score: NN` / `score = NN` token.
  const m = /score["']?\s*[:=]\s*(-?\d{1,3})/i.exec(text);
  if (m) return clampScore(Number(m[1]));

  return null;
}

function scoreFromJson(text: string): number | null {
  const objMatch = /\{[\s\S]*\}/.exec(text);
  if (!objMatch) return null;
  try {
    const parsed = JSON.parse(objMatch[0]);
    const raw = parsed?.score;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return clampScore(n);
  } catch {
    return null;
  }
}

function parseReason(content: unknown): string | null {
  const text = extractText(content);
  if (!text) return null;
  const objMatch = /\{[\s\S]*\}/.exec(text);
  if (!objMatch) return null;
  try {
    const parsed = JSON.parse(objMatch[0]);
    return typeof parsed?.reason === 'string' ? parsed.reason : null;
  } catch {
    return null;
  }
}

/** Normalize OpenRouter message content (string | content-parts) to plain text. */
function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

/** Clamp a finite score into [0,100]. Non-finite is rejected upstream. */
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
