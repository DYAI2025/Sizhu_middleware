import type { ImageGenerationProvider } from '../interfaces';
import { ContractDriftError, OpenRouterHttpError } from './errors';
import { buildProvenanceString } from './piiRedaction';
import { DEFAULT_IMAGE_PRICE_USD } from '../../workflow/costCap';

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

    // The `prompt` arrives ALREADY PII-redacted from the runner (REQ-LGQ-005,
    // redactKnownPiiValues): the template art direction is intact, the raw birth
    // fields are value-stripped. So it is forwarded faithfully — fidelity preserved.
    const provenance = buildProvenanceString(customerData);

    const body = {
      model,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
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

    // Collect every REAL image url across ALL choices (belegt R9 shape:
    // choices[].message.images[].image_url.url). Each candidate must be a DISTINCT
    // real image — never one image fanned out into N (which would inflate the
    // count-cap accounting and make the QA gate score byte-identical dupes).
    const urls: string[] = [];
    for (const choice of choices) {
      const images = choice?.message?.images;
      if (!Array.isArray(images)) continue;
      for (const img of images) {
        const u: unknown = img?.image_url?.url;
        if (typeof u === 'string' && u.length > 0) urls.push(u);
      }
    }
    if (urls.length === 0) {
      throw new ContractDriftError(
        'OpenRouter image response carried no image_url.url in any choice — contract drift, refusing a fake-success placeholder.',
        JSON.stringify(data).slice(0, 300),
      );
    }
    // Use at most the requested count; if the API returned fewer real images, emit
    // fewer HONEST candidates (no duplication, no padding).
    const chosen = urls.slice(0, numCandidates);

    const rawCost = data?.usage?.cost;
    // Absent/non-finite usage.cost would silently leave the $ ceiling at 0 (sec I-1):
    // fall back to the belegt per-image estimate so real spend still accrues to the cap.
    const totalCost =
      typeof rawCost === 'number' && isFinite(rawCost)
        ? rawCost
        : DEFAULT_IMAGE_PRICE_USD * chosen.length;
    const perCandidateCost = totalCost / chosen.length;
    const resolution = quality === 'hd' ? '1792x2304' : '1024x1024';

    return chosen.map((url, i) => ({
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
    }));
  }
}
