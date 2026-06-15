/**
 * Authoritative FuFirE request contract (REQ-F-001 / Task T3).
 *
 * Source of truth: `docs/contracts/fufire-api-reference.md` (OpenAPI-derived
 * reference supplied 2026-06-13). This module models ONLY the request side and
 * is intentionally free of any I/O, env access, or secret handling — it is the
 * shared shape used by `birthInputNormalizer.ts` and `fufireRequestBuilders.ts`.
 *
 * Key contract facts (pinned here so they can be asserted, not re-discovered):
 *  - `date` is a SINGLE ISO datetime string (birth date + time combined), never
 *    separate date/time and never `{ year, month, day, hour }`.
 *  - `chronometry/resolve` is the ONLY nested-shape endpoint (`birth.*`).
 *  - `bazi` / `bazi_trace` / `wuxing` are FLAT.
 *  - `wuxing` REQUIRES `lat` and `lon`.
 *  - Birth time unknown → ISO time component `12:00:00`, `birth_time_known: false`,
 *    source `default_noon` (warning `BIRTH_TIME_UNKNOWN_DEFAULT_NOON`).
 */

/** Allowed enum values per the authoritative contract (§3.1). */
export const FUFIRE_STANDARDS = ["CIVIL", "LMT", "TLST"] as const;
export const FUFIRE_BOUNDARIES = ["midnight", "zi"] as const;
export const FUFIRE_AMBIGUOUS_TIME = ["earlier", "later"] as const;
export const FUFIRE_NONEXISTENT_TIME = ["error", "shift_forward"] as const;

export type FufireStandard = (typeof FUFIRE_STANDARDS)[number];
export type FufireBoundary = (typeof FUFIRE_BOUNDARIES)[number];
export type FufireAmbiguousTime = (typeof FUFIRE_AMBIGUOUS_TIME)[number];
export type FufireNonexistentTime = (typeof FUFIRE_NONEXISTENT_TIME)[number];

/** Default calendar policy for the chronometry endpoint (contract example). */
export const DEFAULT_CALENDAR_POLICY = "gregorian" as const;

/** Marker recorded when birth time is unknown and defaulted to noon. */
export const DEFAULT_NOON_SOURCE = "default_noon" as const;
/**
 * ISO time component (`HH:MM:SS`) used in OUTBOUND FuFire request bodies when
 * birth time is unknown. Server-only canonical form. Its client-side display
 * counterpart is `DEFAULT_BIRTH_TIME` ("12:00") in
 * `src/lib/domain/defaultBirthTime.ts`; both are the same 12:00 local wall-clock
 * noon and MUST be kept in sync (FP2 / REQ-F-001).
 */
export const DEFAULT_NOON_TIME = "12:00:00" as const;
/** Warning surfaced when the default-noon rule fires. */
export const BIRTH_TIME_UNKNOWN_WARNING = "BIRTH_TIME_UNKNOWN_DEFAULT_NOON" as const;

/**
 * Normalized, builder-ready birth input. This is the single internal shape every
 * request builder consumes (AC-F-001a..d). It is provider-agnostic; the builders
 * project it into the per-operation request bodies.
 */
export interface NormalizedBirthInput {
  /** Calendar date, `YYYY-MM-DD`. */
  birthDate: string;
  /** Wall-clock time `HH:MM` (or `HH:MM:SS`). Absent/unknown → default noon. */
  birthTime?: string;
  /** Whether the caller actually knew the birth time. */
  birthTimeKnown: boolean;
  /** Latitude in decimal degrees. */
  lat?: number;
  /** Longitude in decimal degrees. */
  lon?: number;
  /** IANA timezone, e.g. "Europe/Berlin". */
  timezone?: string;

  /** Optional contract enums, passed through only when explicitly provided. */
  standard?: FufireStandard;
  boundary?: FufireBoundary;
  ambiguousTime?: FufireAmbiguousTime;
  nonexistentTime?: FufireNonexistentTime;

  /** Calendar policy for the chronometry endpoint (defaults to "gregorian"). */
  calendarPolicy?: string;

  /**
   * Provenance of the birth time. `default_noon` when the time was unknown and
   * defaulted. Both spellings are accepted by consumers (camelCase + snake_case)
   * because the contract doc uses `birth_time_source`.
   */
  birthTimeSource?: string;
  /** Snake_case alias of {@link birthTimeSource} (contract doc spelling). */
  birth_time_source?: string;
}

/** POST /v1/chronometry/resolve — the ONLY nested-shape request. */
export interface ChronometryResolveRequest {
  birth: {
    calendar_policy: string;
    /** ISO datetime, e.g. "1990-06-15T14:30:00". */
    datetime: string;
    location: { lat: number; lon: number };
    timezone: string;
  };
}

/** POST /v1/calculate/bazi — flat. `date` is a single ISO datetime string. */
export interface BaziRequest {
  /** ISO datetime (REQUIRED). */
  date: string;
  tz?: string;
  lon?: number;
  lat?: number;
  standard?: FufireStandard;
  boundary?: FufireBoundary;
  ambiguousTime?: FufireAmbiguousTime;
  nonexistentTime?: FufireNonexistentTime;
  birth_time_known?: boolean;
  include_trace?: boolean;
}

/** POST /v1/calculate/bazi/trace — same shape as bazi, with include_trace:true. */
export type BaziTraceRequest = BaziRequest;

/** POST /v1/calculate/wuxing — flat. `lat` and `lon` are REQUIRED. */
export interface WuxingRequest {
  /** ISO datetime (REQUIRED). */
  date: string;
  /** REQUIRED by the contract. */
  lat: number;
  /** REQUIRED by the contract. */
  lon: number;
  tz?: string;
  ambiguousTime?: FufireAmbiguousTime;
  nonexistentTime?: FufireNonexistentTime;
}

/**
 * POST /v1/calculate/fusion — flat, SAME request shape as wuxing (`lat`/`lon`
 * REQUIRED). Verified live 2026-06-14 (FX9): HTTP 200, flat response with
 * `wu_xing_vectors.{western_planets, bazi_pillars}`. The EASTERN (located, bazi)
 * dominance = argmax(wu_xing_vectors.bazi_pillars); unlike the western wuxing
 * vector it IS location-dependent, so the response coords must match the subject.
 */
export interface FusionRequest {
  /** ISO datetime (REQUIRED). */
  date: string;
  /** REQUIRED by the contract. */
  lat: number;
  /** REQUIRED by the contract. */
  lon: number;
  tz?: string;
  ambiguousTime?: FufireAmbiguousTime;
  nonexistentTime?: FufireNonexistentTime;
}
