/**
 * Lichun-pair FuFire bazi fixtures (REQ-F-010 — non-deferrable lichun hard-gate).
 *
 * Two realistic FuFire `/v1/calculate/bazi` responses that mirror the LIVE captured
 * shape (`docs/contracts/fufire-samples/bazi.live.response.json`) — the `{ _note, data }`
 * envelope carrying `pillars`, `dates.lichun_local`, `transition.is_before_lichun`, and
 * `derivation_trace.day.day_anchor_evidence.anchor_verification`.
 *
 * VERIFIED FACT (AM-4 spike, live FuFire): FuFire computes the YEAR pillar WITH lichun,
 * server-side. For a 1990-Feb subject:
 *  - 1990-02-03 is BEFORE lichun (is_before_lichun = true)  → year pillar 己巳 (Ji / Si)
 *  - 1990-02-06 is AFTER  lichun (is_before_lichun = false) → year pillar 庚午 (Geng / Wu)
 *
 * Our code does NOT recompute the pillar; it CONSUMES FuFire's lichun-adjusted year pillar.
 * The pair therefore differs ONLY in lichun side + year pillar — everything else is held
 * realistic-constant — so a guard that label-copied or hardcoded the pillar would yield the
 * SAME pillar for both and FAIL the divergence test (the RED-on-revert oracle).
 *
 * The romanizations are the exact tokens FuFire emits (toneless pinyin); the guard maps them
 * to hanzi via `baziSymbolMapper` (Ji→己, Si→巳, Geng→庚, branch Wu→午).
 *
 * No real customer PII — synthetic 1990-Feb subjects at Berlin coordinates.
 */

/** A FuFire bazi response carrying the LIVE `{ _note, data }` envelope shape. */
export interface LichunFixture {
  readonly _note: string;
  readonly data: Record<string, unknown>;
}

/**
 * Build a realistic bazi response for a 1990-Feb subject around lichun.
 *
 * @param opts.isBeforeLichun  the lichun side FuFire reports for this birth date
 * @param opts.yearStem        the lichun-adjusted year-pillar STEM romanization (FuFire token)
 * @param opts.yearBranch      the lichun-adjusted year-pillar BRANCH romanization (FuFire token)
 * @param opts.birthLocal      the subject's local birth timestamp
 * @param opts.anchorVerification  the provider day-pillar anchor status, surfaced verbatim
 */
function buildBaziFixture(opts: {
  isBeforeLichun: boolean;
  yearStem: string;
  yearBranch: string;
  yearTier: string;
  yearElement: string;
  birthLocal: string;
  birthUtc: string;
  anchorVerification: string;
  note: string;
}): LichunFixture {
  const LICHUN_LOCAL = "1990-02-04T03:14:00.239874+01:00";
  return {
    _note: opts.note,
    data: {
      input: {
        date: opts.birthLocal.slice(0, 19),
        tz: "Europe/Berlin",
        lon: 13.405,
        lat: 52.52,
        standard: "CIVIL",
        boundary: "midnight",
        birth_time_known: true,
      },
      pillars: {
        year: {
          stamm: opts.yearStem,
          zweig: opts.yearBranch,
          tier: opts.yearTier,
          element: opts.yearElement,
        },
        // Non-year pillars are held realistic but are NOT what the guard reads.
        month: { stamm: "Wu", zweig: "Yin", tier: "Tiger", element: "Erde" },
        day: { stamm: "Xin", zweig: "Hai", tier: "Schwein", element: "Metall" },
        hour: { stamm: "Yi", zweig: "Wei", tier: "Ziege", element: "Holz" },
      },
      chinese: {
        year: { stem: opts.yearStem, branch: opts.yearBranch, animal: "Snake" },
      },
      dates: {
        birth_local: opts.birthLocal,
        birth_utc: opts.birthUtc,
        lichun_local: LICHUN_LOCAL,
      },
      transition: {
        solar_year: 1990,
        is_before_lichun: opts.isBeforeLichun,
        lichun_year_start: LICHUN_LOCAL,
        lichun_next: "1991-02-04T09:08:24.135199+01:00",
      },
      provenance: {
        engine_version: "1.0.0-rc1-20260220",
        parameter_set_id: "default_v1",
        ruleset_id: "traditional_bazi_2026",
        ephemeris_id: "swieph_sepl18",
        computation_timestamp: "2026-06-18T03:04:38.643901+00:00",
      },
      derivation_trace: {
        year: {
          lichun_crossing_utc: "1990-02-04T02:14:00.239874+00:00",
          is_before_lichun: opts.isBeforeLichun,
          solar_longitude_lichun: 315,
        },
        day: {
          julian_day_number: 2448058,
          day_master_stem: "Xin",
          day_anchor_evidence: {
            ruleset_id: "standard_bazi_2026",
            ruleset_version: "1.0.0",
            anchor_jdn: 2419451,
            anchor_sex_idx: 0,
            anchor_verification: opts.anchorVerification,
          },
        },
      },
    },
  };
}

/**
 * PRE-lichun subject: 1990-02-03 → is_before_lichun = true → year pillar 己巳 (Ji / Si).
 * anchor_verification = "verified" so the lichun-divergence test exercises the happy path.
 */
export const PRE_LICHUN_BAZI: LichunFixture = buildBaziFixture({
  isBeforeLichun: true,
  yearStem: "Ji", // 己
  yearBranch: "Si", // 巳
  yearTier: "Schlange",
  yearElement: "Erde",
  birthLocal: "1990-02-03T10:00:00+01:00",
  birthUtc: "1990-02-03T09:00:00+00:00",
  anchorVerification: "verified",
  note:
    "Synthetic 1990-02-03 @ 52.52,13.405 — BEFORE lichun (is_before_lichun=true) → " +
    "FuFire year pillar 己巳 (Ji/Si). No real PII.",
});

/**
 * POST-lichun subject: 1990-02-06 → is_before_lichun = false → year pillar 庚午 (Geng / Wu).
 * Same anchor status as the pre fixture so the ONLY difference vs PRE is the lichun side
 * + the FuFire-adjusted year pillar.
 */
export const POST_LICHUN_BAZI: LichunFixture = buildBaziFixture({
  isBeforeLichun: false,
  yearStem: "Geng", // 庚
  yearBranch: "Wu", // 午 (branch Wu, Horse — distinct from stem Wu 戊)
  yearTier: "Pferd",
  yearElement: "Metall",
  birthLocal: "1990-02-06T10:00:00+01:00",
  birthUtc: "1990-02-06T09:00:00+00:00",
  anchorVerification: "verified",
  note:
    "Synthetic 1990-02-06 @ 52.52,13.405 — AFTER lichun (is_before_lichun=false) → " +
    "FuFire year pillar 庚午 (Geng/Wu). No real PII.",
});

/**
 * UNVERIFIED variant: identical to POST_LICHUN_BAZI except the provider day-pillar
 * `anchor_verification` is "unverified" (the LIVE sample's real value). The guard MUST
 * BLOCK on this — never laundering "unverified" into a verified provenance.
 */
export const UNVERIFIED_ANCHOR_BAZI: LichunFixture = buildBaziFixture({
  isBeforeLichun: false,
  yearStem: "Geng", // 庚
  yearBranch: "Wu", // 午
  yearTier: "Pferd",
  yearElement: "Metall",
  birthLocal: "1990-02-06T10:00:00+01:00",
  birthUtc: "1990-02-06T09:00:00+00:00",
  anchorVerification: "unverified",
  note:
    "Synthetic 1990-02-06 — POST-lichun but day-anchor anchor_verification='unverified' " +
    "(the live sample's real value). Guard MUST block. No real PII.",
});
