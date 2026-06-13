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
  return {
    birth: {
      calendar_policy: input.calendarPolicy ?? DEFAULT_CALENDAR_POLICY,
      datetime: toIsoDatetime(input),
      location: {
        lat: input.lat as number,
        lon: input.lon as number,
      },
      timezone: input.timezone as string,
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
  const body: RequestBody<WuxingRequest> = {
    date: toIsoDatetime(input),
    lat: input.lat as number,
    lon: input.lon as number,
  };

  if (input.timezone !== undefined) body.tz = input.timezone;
  if (input.ambiguousTime !== undefined) body.ambiguousTime = input.ambiguousTime;
  if (input.nonexistentTime !== undefined) body.nonexistentTime = input.nonexistentTime;

  return body;
}
