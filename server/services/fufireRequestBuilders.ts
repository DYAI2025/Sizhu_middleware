/**
 * FuFire request builders (REQ-F-001 / Task T3).
 *
 * Pure functions that project a {@link NormalizedBirthInput} into the exact
 * request body each FuFire endpoint expects, per the authoritative contract
 * (`docs/contracts/fufire-api-reference.md`, modeled in
 * {@link file://./../contracts/fufireContract.ts}). The historical miss these
 * builders correct (see `server/tests/fufire.requestBuilders.test.ts`):
 *
 *  - `chronometry/resolve` is the ONLY nested shape (`birth.*`); everything else
 *    is FLAT.
 *  - The birth instant is ALWAYS a single ISO datetime string `date`
 *    (`YYYY-MM-DDTHH:MM:SS`) — never `{ year, month, day, hour }`, never split
 *    `date` / `time`.
 *  - `wuxing` REQUIRES `lat` and `lon`; it carries no `elements`.
 *
 * These builders are intentionally PURE: no env access, no secret handling, no
 * I/O. They cannot leak `FUFIRE_API_KEY` / `X-API-Key` because they never read
 * them (AC-F-001g) and their output is computed entirely from the input
 * (AC-F-001f). The outbound URL / header / secret are resolved elsewhere
 * (server config), preserving the T1 SSRF fix — builders only shape the BODY.
 */

import {
  type NormalizedBirthInput,
  type ChronometryResolveRequest,
  type BaziRequest,
  type BaziTraceRequest,
  type WuxingRequest,
  type FusionRequest,
  DEFAULT_CALENDAR_POLICY,
  DEFAULT_NOON_TIME,
} from "../contracts/fufireContract";

// Re-export the normalized shape from here: the contract test imports the type
// from this module (single import surface for the builder consumers). The type
// is NOT redefined — this is a pure re-export of the contract's definition.
export type { NormalizedBirthInput } from "../contracts/fufireContract";

// Re-export the normalizer so the default-noon step is reachable from the same
// module surface the tests import the builders from.
export {
  normalizeBirthInput,
  normalizeBirthInputWithWarnings,
} from "./birthInputNormalizer";

/**
 * A request body whose canonical shape is `T`, additionally indexable by string
 * so callers may probe for the ABSENCE of forbidden keys (e.g. `body.date` on a
 * chronometry body, `body.elements` on a wuxing body) without an unsound
 * `as unknown as` double-cast. The known keys of `T` keep their exact types;
 * any other key reads as `unknown` (and, being absent at runtime, is
 * `undefined`). The builders never write keys outside `T`, so this only widens
 * the *read* surface, not what is actually produced.
 */
type RequestBody<T> = T & { [key: string]: unknown };

/**
 * Thrown by a builder when a REQUIRED field is absent. This should never fire in
 * production: the data-service validates required coordinates/timezone BEFORE
 * dispatch (FP1 / the `||` geocoder gate), so this is the defense-in-depth floor
 * that guarantees a builder can never silently emit `{ lat: undefined }` /
 * `{ lon: undefined }` / `{ timezone: undefined }`. Replaces the prior unsound
 * `input.lat as number` casts.
 */
export class FuFireRequestBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FuFireRequestBuilderError";
  }
}

/** Narrow a required finite-number coordinate (no `as` cast). */
function requireCoord(value: number | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FuFireRequestBuilderError(
      `Required coordinate "${field}" is missing or not a finite number`,
    );
  }
  return value;
}

/** Narrow a required non-empty string (no `as` cast). */
function requireString(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new FuFireRequestBuilderError(
      `Required field "${field}" is missing or empty`,
    );
  }
  return value;
}

/**
 * Combine the (already-normalized or raw) birth date + time into a single ISO
 * datetime string `YYYY-MM-DDTHH:MM:SS` (local wall-clock, no offset — matching
 * the contract example `"1990-06-15T14:30:00"`).
 *
 * Tolerant by design (AC-F-001f / spec): accepts `HH:MM` or `HH:MM:SS`, and a
 * missing time falls back to the contract's default-noon time so a raw,
 * un-normalized input still yields a valid ISO datetime rather than throwing.
 * No timezone arithmetic is performed — the wall-clock components are preserved
 * verbatim, which is what the contract's `datetime` field carries.
 */
export function toIsoDatetime(input: NormalizedBirthInput): string {
  const date = input.birthDate;
  const rawTime =
    typeof input.birthTime === "string" && input.birthTime.trim() !== ""
      ? input.birthTime.trim()
      : DEFAULT_NOON_TIME;

  // Normalize the time component to HH:MM:SS so the ISO string is well-formed
  // regardless of whether the caller supplied seconds.
  const parts = rawTime.split(":");
  const hh = (parts[0] ?? "00").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  const ss = (parts[2] ?? "00").padStart(2, "0");

  return `${date}T${hh}:${mm}:${ss}`;
}

/**
 * POST /v1/chronometry/resolve — the ONLY nested-shape request.
 * Projects birth date/time → `birth.datetime` (single ISO string), location and
 * timezone into the nested `birth` object. Carries NO flat `date` / `time`.
 */
export function buildChronometryRequest(
  input: NormalizedBirthInput,
): RequestBody<ChronometryResolveRequest> {
  // Required by the contract; validated here (no `as` cast). The data-service
  // guarantees presence before dispatch — this is the defense-in-depth floor.
  return {
    birth: {
      calendar_policy: input.calendarPolicy ?? DEFAULT_CALENDAR_POLICY,
      datetime: toIsoDatetime(input),
      location: {
        lat: requireCoord(input.lat, "lat"),
        lon: requireCoord(input.lon, "lon"),
      },
      timezone: requireString(input.timezone, "timezone"),
    },
  };
}

/**
 * POST /v1/calculate/bazi — FLAT. Single ISO `date`; NO `{year,month,day,hour}`.
 * Optional enum / location fields are passed through ONLY when explicitly
 * provided, so the body never carries undefined keys the contract didn't ask
 * for.
 */
export function buildBaziRequest(input: NormalizedBirthInput): RequestBody<BaziRequest> {
  const body: RequestBody<BaziRequest> = {
    date: toIsoDatetime(input),
    birth_time_known: input.birthTimeKnown,
  };

  if (input.timezone !== undefined) body.tz = input.timezone;
  if (input.lon !== undefined) body.lon = input.lon;
  if (input.lat !== undefined) body.lat = input.lat;
  if (input.standard !== undefined) body.standard = input.standard;
  if (input.boundary !== undefined) body.boundary = input.boundary;
  if (input.ambiguousTime !== undefined) body.ambiguousTime = input.ambiguousTime;
  if (input.nonexistentTime !== undefined) body.nonexistentTime = input.nonexistentTime;

  return body;
}

/**
 * POST /v1/calculate/bazi/trace — same FLAT shape as bazi, with
 * `include_trace: true`.
 */
export function buildBaziTraceRequest(
  input: NormalizedBirthInput,
): RequestBody<BaziTraceRequest> {
  return {
    ...buildBaziRequest(input),
    include_trace: true,
  };
}

/**
 * POST /v1/calculate/wuxing — FLAT. `lat` and `lon` are REQUIRED by the
 * contract; carries NO `elements`.
 */
export function buildWuxingRequest(input: NormalizedBirthInput): RequestBody<WuxingRequest> {
  // `lat`/`lon` are REQUIRED by the contract; validated here (no `as` cast).
  const body: RequestBody<WuxingRequest> = {
    date: toIsoDatetime(input),
    lat: requireCoord(input.lat, "lat"),
    lon: requireCoord(input.lon, "lon"),
  };

  if (input.timezone !== undefined) body.tz = input.timezone;
  if (input.ambiguousTime !== undefined) body.ambiguousTime = input.ambiguousTime;
  if (input.nonexistentTime !== undefined) body.nonexistentTime = input.nonexistentTime;

  return body;
}

/**
 * POST /v1/calculate/fusion — FLAT, SAME shape as wuxing. `lat`/`lon` REQUIRED
 * (the eastern/located dominance depends on them). Carries NO `elements`.
 */
export function buildFusionRequest(input: NormalizedBirthInput): RequestBody<FusionRequest> {
  const body: RequestBody<FusionRequest> = {
    date: toIsoDatetime(input),
    lat: requireCoord(input.lat, "lat"),
    lon: requireCoord(input.lon, "lon"),
  };

  if (input.timezone !== undefined) body.tz = input.timezone;
  if (input.ambiguousTime !== undefined) body.ambiguousTime = input.ambiguousTime;
  if (input.nonexistentTime !== undefined) body.nonexistentTime = input.nonexistentTime;

  return body;
}
