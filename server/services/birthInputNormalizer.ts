/**
 * Birth-input normalizer (REQ-F-001 / Task T3).
 *
 * Turns a raw, caller-supplied birth input into the single internal
 * {@link NormalizedBirthInput} shape every FuFire request builder consumes.
 * Its only job is to make the birth *time* deterministic:
 *
 *  - When the birth time is unknown (`birthTimeKnown === false`, or no
 *    `birthTime` was supplied), it applies the default-noon rule (AC-F-001d):
 *    the time component becomes `12:00:00`, `birthTimeKnown` is forced to
 *    `false`, the provenance is recorded as `default_noon` (both camelCase and
 *    snake_case spellings, because the contract doc uses `birth_time_source`),
 *    and the {@link BIRTH_TIME_UNKNOWN_WARNING} is surfaced.
 *  - When the birth time is known it is preserved verbatim.
 *
 * This module is intentionally PURE — no env access, no secret handling, no
 * I/O. It is the one place that decides the default-noon semantics so the
 * builders never have to.
 */

import {
  type NormalizedBirthInput,
  BIRTH_TIME_UNKNOWN_WARNING,
  DEFAULT_NOON_SOURCE,
  DEFAULT_NOON_TIME,
} from "../contracts/fufireContract";

/** Result of normalizing a raw birth input. */
export interface NormalizeResult {
  /** The normalized, builder-ready input. */
  normalized: NormalizedBirthInput;
  /** Warnings raised during normalization (e.g. default-noon was applied). */
  warnings: string[];
}

/**
 * Normalize a raw birth input into a builder-ready {@link NormalizedBirthInput}.
 *
 * The returned object always carries an explicit, defined `birthTime` and
 * `birthTimeKnown` so that the request builders can project an ISO datetime
 * without re-deciding the default-noon policy. The provenance of the time is
 * recorded on `birthTimeSource` (and its snake_case alias) so the caller can
 * report exactly how the time was determined.
 *
 * @returns the normalized input; the default-noon warning, if any, is returned
 * via {@link normalizeBirthInputWithWarnings}.
 */
export function normalizeBirthInput(input: NormalizedBirthInput): NormalizedBirthInput {
  return normalizeBirthInputWithWarnings(input).normalized;
}

/**
 * Same as {@link normalizeBirthInput} but also returns the warnings raised, so
 * the data service can surface the default-noon warning in its run output.
 */
export function normalizeBirthInputWithWarnings(input: NormalizedBirthInput): NormalizeResult {
  const warnings: string[] = [];

  // The time is "unknown" if the caller said so OR if no usable time was given.
  const hasUsableTime = typeof input.birthTime === "string" && input.birthTime.trim() !== "";
  const timeUnknown = input.birthTimeKnown === false || !hasUsableTime;

  const normalized: NormalizedBirthInput = { ...input };

  if (timeUnknown) {
    normalized.birthTime = DEFAULT_NOON_TIME;
    normalized.birthTimeKnown = false;
    normalized.birthTimeSource = DEFAULT_NOON_SOURCE;
    normalized.birth_time_source = DEFAULT_NOON_SOURCE;
    warnings.push(BIRTH_TIME_UNKNOWN_WARNING);
  } else {
    // Time is known and usable — preserve it, mark it known.
    normalized.birthTime = input.birthTime;
    normalized.birthTimeKnown = true;
  }

  return { normalized, warnings };
}
