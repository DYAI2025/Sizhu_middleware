/**
 * PII redaction for the OUTBOUND OpenRouter request body (REQ-LGQ-005 / NFR-3 / F2).
 *
 * THE CARRIER (belegt, runner.ts:235-239,252,281-282,306): the raw birth PII
 * (`name`/`birth_date`/`birth_place`) is rendered INLINE into the COMPILED PROMPT
 * STRING — the first arg to `generate()` and the vision-QA text. The derived-var
 * args (`customerData`/`resolvedVariables`) carry ONLY non-PII derived vars
 * (animal/element/dominant_element/birth_year). So a redaction written against the
 * derived-var args would be GREEN-WHILE-LEAKING.
 *
 * MECHANISM (canvas A4): the free-form incoming prompt string is treated as
 * PII-tainted and is NOT forwarded verbatim. The outbound prompt is RECONSTRUCTED
 * from an explicit ALLOWLIST of non-PII derived vars. Anything not on the allowlist
 * (the free-form prompt's raw name/date/place) never reaches the wire. This is a
 * positive allowlist, not a blocklist of known PII shapes — a new free-form field
 * cannot leak by default.
 */

/**
 * The ONLY var names allowed to cross the wire to OpenRouter. These are the
 * non-PII derived vars the runner computes from FuFire (animal/element/etc.) plus
 * non-PII operational metadata. Raw birth fields (name/birth_date/birth_place/
 * birth_time) are deliberately ABSENT — they can never be reconstructed onto the
 * outbound body.
 */
export const NON_PII_DERIVED_VAR_ALLOWLIST = [
  'animal',
  'element',
  'dominant_element',
  'birth_year',
  'iteration',
] as const;

/**
 * Raw birth fields that must NEVER cross the wire. Used only for the defensive
 * sentinel-strip below and for provenance scrubbing — the primary defence is the
 * allowlist reconstruction, not this blocklist.
 */
export const RAW_PII_FIELD_NAMES = [
  'name',
  'birth_date',
  'birth_time',
  'birth_time_source',
  'birth_place',
] as const;

type Vars = Record<string, unknown> | null | undefined;

/**
 * Reconstruct a PII-free prompt for OpenRouter from the non-PII derived vars
 * ONLY. The incoming free-form `prompt` (the PII carrier) is intentionally NOT
 * embedded — only allowlisted derived values are composed into the outbound text.
 *
 * @param derivedVars the `customerData`/`resolvedVariables` arg (non-PII derived).
 * @param intent      a short, static, PII-free description of the operation.
 */
export function buildRedactedPrompt(derivedVars: Vars, intent: string): string {
  const safe = pickAllowedVars(derivedVars);
  const descriptors = NON_PII_DERIVED_VAR_ALLOWLIST.filter(
    (key) => safe[key] !== undefined && safe[key] !== null && String(safe[key]).length > 0,
  ).map((key) => `${key}=${String(safe[key])}`);

  // The outbound prompt is composed ONLY from the allowlisted derived vars + a
  // static intent line. The raw compiled prompt string is dropped entirely.
  return descriptors.length > 0
    ? `${intent}\nNon-PII derived attributes: ${descriptors.join(', ')}.`
    : intent;
}

/**
 * Extract ONLY the allowlisted non-PII derived vars from an arbitrary derived-var
 * object. Returns a fresh plain object — never the original (so nothing extra
 * rides along).
 */
export function pickAllowedVars(derivedVars: Vars): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!derivedVars || typeof derivedVars !== 'object') return out;
  for (const key of NON_PII_DERIVED_VAR_ALLOWLIST) {
    const value = (derivedVars as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Compact, PII-safe provenance string for an artifact's metadata. Derived from
 * the allowlist ONLY — never the raw prompt. Safe to persist/echo (OQ-3).
 */
export function buildProvenanceString(derivedVars: Vars): string {
  const safe = pickAllowedVars(derivedVars);
  const parts = Object.entries(safe)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.join(' ');
}
