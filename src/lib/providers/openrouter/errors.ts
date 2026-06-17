/**
 * Controlled errors for the OpenRouter providers (REQ-LGQ-007 — no-fake-success /
 * contract-drift). When the third-party response shape diverges from the belegt R9
 * contract (`choices[].message.images[0].image_url.url` for image-gen; a parseable
 * score for the QA gate), the provider MUST throw one of these — never fabricate a
 * placeholder candidate or a default-pass score. A fabricated success would let a
 * run reach `pod_ready` on a non-image / unverified artifact (value-promise #2).
 */

/** Thrown when an OpenRouter response cannot be parsed into a real result. */
export class ContractDriftError extends Error {
  /** The raw (truncated) response detail, for logs — never echoed to the client. */
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'ContractDriftError';
    this.detail = detail;
    // Preserve the prototype chain for `instanceof` across the TS→JS transpile.
    Object.setPrototypeOf(this, ContractDriftError.prototype);
  }
}

/** Thrown on a non-2xx HTTP status from OpenRouter (e.g. the belegt 402 trap). */
export class OpenRouterHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenRouterHttpError';
    this.status = status;
    Object.setPrototypeOf(this, OpenRouterHttpError.prototype);
  }
}
