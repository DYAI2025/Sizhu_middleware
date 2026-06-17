import type { QualityGateProvider } from '../interfaces';
import { ContractDriftError, OpenRouterHttpError } from './errors';

type EnvSource = Record<string, string | undefined>;

interface OpenRouterQaProviderOptions {
  env?: EnvSource;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Real OpenRouter vision quality-gate provider (REQ-LGQ-003/005/007).
 *
 * Guards:
 *  - PII redaction (F2): the `qaPrompt` arrives ALREADY PII-redacted from the runner
 *    (redactKnownPiiValues), so the operator's real scoring rubric is forwarded
 *    faithfully (fidelity) with the literal birth PII value-stripped. The candidate's
 *    `metadata.promptUsed` is NOT forwarded. Only the rubric + the generated image
 *    (storagePath) cross the wire.
 *  - No-fake-success: a non-2xx status OR a response with no parseable score
 *    THROWS — the gate never silently default-passes a candidate.
 */
export class OpenRouterQualityGateProvider implements QualityGateProvider {
  private readonly env: EnvSource;
  private readonly baseUrl: string;

  constructor(opts: OpenRouterQaProviderOptions = {}) {
    this.env = opts.env ?? (process.env as EnvSource);
    this.baseUrl = opts.baseUrl ?? this.env.OPENROUTER_BASE_URL ?? DEFAULT_BASE_URL;
  }

  private resolveApiKey(secretRef: string): string {
    const direct = this.env[secretRef];
    if (direct && direct.trim().length > 0) return direct.trim();
    const fallback = this.env.OPENROUTER_API_KEY;
    if (fallback && fallback.trim().length > 0) return fallback.trim();
    throw new Error(
      `OpenRouter API key not found for secret ref "${secretRef}". Ensure the env var is set.`,
    );
  }

  async evaluate(
    candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
    minScore: number,
    qaPrompt: string,
    secretRef: string,
    model: string,
    resolvedVariables: any,
    iteration: number,
  ): Promise<
    {
      candidateIndex: number;
      score: number;
      status: 'accepted' | 'rejected' | 'not_selected';
      reason: string;
      detailedJson: string;
    }[]
  > {
    const apiKey = this.resolveApiKey(secretRef);

    // The qaPrompt is the operator's real scoring rubric, already PII-redacted by the
    // runner — forwarded faithfully (fidelity). The candidate's promptUsed is NOT
    // forwarded. A static JSON-format suffix ensures a parseable score.
    const scoringText =
      `${qaPrompt}\n\nRespond ONLY with JSON {"score":<0-100>,"reason":"..."} ` +
      `(minimum acceptance score ${minScore}).`;

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        const messages = [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: scoringText },
              { type: 'image_url' as const, image_url: { url: candidate.storagePath } },
            ],
          },
        ];

        const body = { model, messages };

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => 'unknown error');
          throw new OpenRouterHttpError(
            response.status,
            `OpenRouter quality gate failed for candidate ${candidate.candidateIndex} (HTTP ${response.status}): ${errText.slice(0, 300)}`,
          );
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        const score = this.extractScore(text);
        if (score === null) {
          // No parseable score — fail loud, NEVER default-pass.
          throw new ContractDriftError(
            `OpenRouter quality gate returned no parseable score for candidate ${candidate.candidateIndex} — refusing to fabricate a passing score.`,
            String(text).slice(0, 300),
          );
        }

        const passed = score >= minScore;
        return {
          candidateIndex: candidate.candidateIndex,
          score,
          status: passed ? ('accepted' as const) : ('rejected' as const),
          reason: String(text).substring(0, 500),
          detailedJson: JSON.stringify(
            {
              evaluation_timestamp: new Date().toISOString(),
              llm_model: model,
              iteration,
              raw_response: String(text).substring(0, 2000),
            },
            null,
            2,
          ),
        };
      }),
    );

    // Keep only the single highest-scoring accepted candidate as 'accepted';
    // demote the rest to 'not_selected'.
    let acceptedIndex: number | null = null;
    let highestScore = -1;
    results.forEach((ev) => {
      if (ev.status === 'accepted' && ev.score > highestScore) {
        highestScore = ev.score;
        acceptedIndex = ev.candidateIndex;
      }
    });

    return results.map((ev) =>
      ev.status === 'accepted' && ev.candidateIndex !== acceptedIndex
        ? { ...ev, status: 'not_selected' as const }
        : ev,
    );
  }

  /** Parse a 0-100 score from the model text; returns null when none is present. */
  private extractScore(text: string): number | null {
    const slashMatch = String(text).match(/(\d{1,3})\s*\/\s*100/);
    if (slashMatch) {
      const parsed = parseInt(slashMatch[1], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
    const jsonMatch = String(text).match(/"score"\s*:\s*(\d{1,3})/);
    if (jsonMatch) {
      const parsed = parseInt(jsonMatch[1], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
    return null;
  }
}
