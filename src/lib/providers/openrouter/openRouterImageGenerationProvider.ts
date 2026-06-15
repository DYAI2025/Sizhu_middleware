/**
 * Live OpenRouter image-generation provider (REQ-LGQ, T-LGQ-3 / PRD §7).
 *
 * Drop-in for {@link ImageGenerationProvider}. Calls the REAL OpenRouter API:
 *   POST {baseUrl}/chat/completions
 *   model google/gemini-2.5-flash-image, modalities: ["image","text"]
 *   max_tokens MODEST (the default 8192 → HTTP 402; belegt R9 → use 256).
 * Parses `choices[0].message.images[0].image_url.url` = a base64 PNG data URI and
 * returns the seam shape (storagePath = the data URI; metadata.usdCost from
 * `usage.cost`).
 *
 * Guarantees:
 *  - No-fake-success (REQ-LGQ-007): any divergent/garbage response shape OR a
 *    non-2xx status throws {@link OpenRouterContractError} — never a placeholder.
 *  - No PII on the wire (REQ-LGQ-005 / F2): the outbound prompt is reconstructed
 *    from non-PII derived vars ONLY (see piiRedaction). The raw compiled prompt
 *    (the PII carrier) is never forwarded, and provenance carries no raw PII.
 *  - Key hygiene: the key is read SERVER-SIDE via the secret-ref and never logged,
 *    echoed, or returned.
 */

import { ImageGenerationProvider } from '../interfaces';
import { resolveOpenRouterCredentials } from '../../modelGateway/openRouterGateway';
import {
  OpenRouterContractError,
  OPENROUTER_CONTRACT_ERROR_CODES,
} from './errors';
import { buildRedactedPrompt, buildProvenanceString } from './piiRedaction';

/** belegt R9: max_tokens MUST be modest — the default 8192 returns HTTP 402. */
const IMAGE_MAX_TOKENS = 256;
const PROVIDER_NAME = 'OpenRouter';
const OPERATION = 'image_generation' as const;

type EnvSource = Record<string, string | undefined>;

export interface OpenRouterProviderOptions {
  /** Injectable server env (defaults to process.env). Carries OPENROUTER_*. */
  env?: EnvSource;
}

type ImageCandidate = Awaited<ReturnType<ImageGenerationProvider['generate']>>[number];

export class OpenRouterImageGenerationProvider implements ImageGenerationProvider {
  private readonly env: EnvSource;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.env = options.env ?? process.env;
  }

  async generate(
    prompt: string,
    numCandidates: number,
    format: 'png' | 'jpeg',
    quality: 'standard' | 'hd',
    model: string,
    secretRef: string,
    customerData: any,
  ): Promise<ImageCandidate[]> {
    const { baseUrl } = resolveOpenRouterCredentials(this.env);
    const apiKey = this.env[secretRef];
    if (!apiKey || apiKey.trim().length === 0) {
      // Fail loud (no fake success) — never proceed without a real server key.
      throw new OpenRouterContractError(
        OPENROUTER_CONTRACT_ERROR_CODES.HTTP_NOT_OK,
        `OpenRouter image generation aborted: no API key under secret-ref "${secretRef}".`,
        { operation: OPERATION, modelId: model },
      );
    }

    // PII redaction (F2): build the outbound prompt from non-PII derived vars
    // ONLY. The raw compiled `prompt` (the PII carrier) is NEVER forwarded.
    const redactedPrompt = buildRedactedPrompt(
      customerData,
      'Generate a celestial astrology totem image. Output an image. Constraints: high-contrast, symmetrical, no text overlays.',
    );
    const provenance = buildProvenanceString(customerData);

    const count = Math.max(1, Number(numCandidates) || 1);
    const results: ImageCandidate[] = [];
    for (let i = 0; i < count; i++) {
      results.push(
        await this.generateOne(baseUrl, apiKey, model, redactedPrompt, provenance, i, quality),
      );
    }
    return results;
  }

  private async generateOne(
    baseUrl: string,
    apiKey: string,
    model: string,
    redactedPrompt: string,
    provenance: string,
    candidateIndex: number,
    quality: 'standard' | 'hd',
  ): Promise<ImageCandidate> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        modalities: ['image', 'text'],
        max_tokens: IMAGE_MAX_TOKENS,
        messages: [{ role: 'user', content: redactedPrompt }],
      }),
    });

    // No-fake-success: non-2xx (incl. the belegt 402) FAILS LOUD.
    if (!res.ok) {
      throw new OpenRouterContractError(
        OPENROUTER_CONTRACT_ERROR_CODES.HTTP_NOT_OK,
        `OpenRouter image generation failed with HTTP ${res.status}.`,
        { operation: OPERATION, httpStatus: res.status, modelId: model },
      );
    }

    const body: any = await res.json();
    const dataUri = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    // No-fake-success: a divergent shape (no image / null url / garbage schema)
    // throws — we never fabricate a placeholder image.
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
      throw new OpenRouterContractError(
        OPENROUTER_CONTRACT_ERROR_CODES.RESPONSE_SHAPE_DRIFT,
        'OpenRouter image response did not contain choices[0].message.images[0].image_url.url (base64 data URI).',
        { operation: OPERATION, httpStatus: res.status, modelId: model },
      );
    }

    const usdCost = readUsageCost(body);

    return {
      candidateIndex,
      storagePath: dataUri, // belegt R9: ephemeral base64 PNG data URI
      metadata: {
        // Provenance is PII-SAFE: derived vars only, NEVER the raw prompt (OQ-3).
        promptUsed: provenance,
        model,
        provider: PROVIDER_NAME,
        quality,
        resolution: quality === 'hd' ? '1792x2304' : '1024x1024',
        // Real per-candidate cost from usage.cost (C2 telemetry; A3 cap-tuning).
        usdCost,
      } as ImageCandidate['metadata'] & { usdCost: number },
    };
  }
}

/**
 * Read the real `usage.cost` from the response. Defaults to 0 only when the
 * field is genuinely absent/non-numeric — the cost field is not part of the
 * load-bearing contract-drift guard (the image data URI is), but a non-finite
 * value is coerced to 0 rather than allowed to corrupt downstream sums.
 */
function readUsageCost(body: any): number {
  const raw = body?.usage?.cost;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}
