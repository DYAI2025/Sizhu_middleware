import type { ImageGenerationProvider } from '../interfaces';
import { ContractDriftError, OpenRouterHttpError } from './errors';
import { buildRedactedPrompt, buildProvenanceString } from './piiRedaction';

type EnvSource = Record<string, string | undefined>;

interface OpenRouterImageProviderOptions {
  /** Env source the key/baseUrl are read from. Defaults to process.env. */
  env?: EnvSource;
  /** Override the OpenRouter base URL (else env.OPENROUTER_BASE_URL or the default). */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Real OpenRouter image-generation provider (REQ-LGQ-002/005/006/007).
 *
 * Three guards baked in, all asserted by the LGQ Phase-1 contracts:
 *  - PII redaction (F2): the incoming `prompt` is the PII carrier — it is NEVER
 *    forwarded. The outbound text is reconstructed from the non-PII derived-var
 *    allowlist only (buildRedactedPrompt). Provenance is the PII-safe string.
 *  - No-fake-success / contract-drift: a divergent response shape or a non-2xx
 *    status THROWS — no placeholder image is ever fabricated.
 *  - Provenance: per-candidate `model` + REAL `usdCost` (usage.cost / n).
 */
export class OpenRouterImageGenerationProvider implements ImageGenerationProvider {
  private readonly env: EnvSource;
  private readonly baseUrl: string;

  constructor(opts: OpenRouterImageProviderOptions = {}) {
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

  async generate(
    prompt: string,
    numCandidates: number,
    format: 'png' | 'jpeg',
    quality: 'standard' | 'hd',
    model: string,
    secretRef: string,
    customerData: any,
  ): Promise<
    {
      candidateIndex: number;
      storagePath: string;
      metadata: {
        promptUsed: string;
        model: string;
        provider: string;
        quality: string;
        resolution: string;
        usdCost?: number;
      };
    }[]
  > {
    const apiKey = this.resolveApiKey(secretRef);

    // F2: the raw `prompt` (carrier of name/birth_date/birth_place) is DROPPED.
    // The wire text is reconstructed from allowlisted non-PII derived vars only.
    const redactedPrompt = buildRedactedPrompt(
      customerData,
      'Generate a personalized celestial totem image from the following non-PII derived attributes.',
    );
    const provenance = buildProvenanceString(customerData);

    const body = {
      model,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: redactedPrompt }],
      n: numCandidates,
    };

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
      // Fail loud — never swallow a non-2xx into a fabricated candidate.
      throw new OpenRouterHttpError(
        response.status,
        `OpenRouter image generation failed (HTTP ${response.status}): ${errText.slice(0, 300)}`,
      );
    }

    const data = await response.json();
    const choices = data?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new ContractDriftError(
        'OpenRouter image response has no choices[] — contract drift, refusing to fabricate an image.',
        JSON.stringify(data).slice(0, 300),
      );
    }

    const rawCost = data?.usage?.cost;
    const totalCost = typeof rawCost === 'number' && isFinite(rawCost) ? rawCost : 0;
    const perCandidateCost = numCandidates > 0 ? totalCost / numCandidates : totalCost;
    const resolution = quality === 'hd' ? '1792x2304' : '1024x1024';

    const results: {
      candidateIndex: number;
      storagePath: string;
      metadata: {
        promptUsed: string;
        model: string;
        provider: string;
        quality: string;
        resolution: string;
        usdCost?: number;
      };
    }[] = [];

    for (let i = 0; i < numCandidates; i++) {
      // One image per choice (belegt R9); tolerate a single choice carrying n images.
      const choice = choices[i] ?? (choices.length === 1 ? choices[0] : undefined);
      const images = choice?.message?.images;
      if (!Array.isArray(images) || images.length === 0) {
        throw new ContractDriftError(
          `OpenRouter image response choice[${i}] has no images[] — contract drift (belegt shape is choices[].message.images[0].image_url.url).`,
        );
      }
      const img = images[i] ?? images[0];
      const url: unknown = img?.image_url?.url;
      if (typeof url !== 'string' || url.length === 0) {
        throw new ContractDriftError(
          `OpenRouter image response choice[${i}] has no image_url.url — contract drift, refusing a fake-success placeholder.`,
        );
      }

      results.push({
        candidateIndex: i,
        storagePath: url,
        metadata: {
          // PII-safe provenance ONLY — never the raw prompt (OQ-3 / REQ-LGQ-006c).
          promptUsed: provenance,
          model,
          provider: 'OpenRouter',
          quality,
          resolution,
          usdCost: perCandidateCost,
        },
      });
    }

    return results;
  }
}
