import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  interpretFufireResponse,
  resolvePromptVariables,
  renderPromptTemplate,
  PROMPT_VARIABLE_SOURCE_MISSING,
} from "../services/fufireResponseInterpreter";

/**
 * FX6 — mutation-hardening suite for server/services/fufireResponseInterpreter.ts.
 *
 * Origin: the 2026-06-14 Stryker run scored this module 59.8% with 90 survivors
 * (the biggest survivor backlog). The contract test
 * (`fufire.responseInterpreter.test.ts`) pins the happy-path shape against the
 * captured samples but leaves most branch and exact-value behaviour unpinned, so
 * mutants survived in: resolveString/resolveNumber found-vs-not-found, locale
 * de/en source selection, every missing-source issue string, the located
 * coordinate guard (subject undefined / non-finite / exact 1e-6 tolerance /
 * mismatch), describeResponseLocation, the bazi caveat present-vs-absent branch,
 * deferred + unknown ops, the `verified` booleans, and the CALCULATION_NOTE.
 *
 * This file asserts EXACT return values and BOTH sides of every conditional so
 * each surviving mutant goes RED. The objective oracle is the Stryker score.
 *
 * FX5 + FX9 contract correction (resolvePromptVariables):
 *  - `western_dominant` ← wuxing.dominant_element, NO location guard. It is the
 *    geocentric/western vector, proven LOCATION-INVARIANT live; it binds
 *    regardless of subject coordinates (the former 0,0 trap is RETIRED here).
 *  - `eastern_dominant` ← argmax(fusion.wu_xing_vectors.bazi_pillars),
 *    LOCATION-DEPENDENT → guarded: the fusion response's input coords must match
 *    the subject (within 1e-6) or eastern_dominant is NOT bound and a
 *    location-flagged PROMPT_VARIABLE_SOURCE_MISSING issue is recorded. Absent
 *    fusion ⇒ a PROMPT_VARIABLE_SOURCE_MISSING issue naming eastern_dominant.
 *  - `dominant_element` is kept as a deprecated alias of `western_dominant`
 *    (same value, no guard).
 *
 * The literal note string (CALCULATION_NOTE) and the exact missing-source issue
 * strings are reproduced here so a mutant that reworks them is caught verbatim.
 */

const SAMPLES = "docs/contracts/fufire-samples";
const baziSample = JSON.parse(
  readFileSync(join(process.cwd(), `${SAMPLES}/bazi.response.json`), "utf8"),
);
const wuxingSample = JSON.parse(
  readFileSync(join(process.cwd(), `${SAMPLES}/wuxing.response.json`), "utf8"),
);
// The fusion sample is wrapped in `{ data: {...} }`; the interpreter is handed `.data`.
const fusionSample = JSON.parse(
  readFileSync(join(process.cwd(), `${SAMPLES}/fusion.response.json`), "utf8"),
).data;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// The captured wuxing sample's SHAPE-fixture coordinates (0,0).
const SAMPLE_LAT = 0;
const SAMPLE_LON = 0;
// The REAL subject's birth coordinates (Berlin), carried by the bazi sample
// and the (located) fusion sample.
const REAL_LAT = 52.52;
const REAL_LON = 13.405;

// The exact note text the module emits (mutant-kill for CALCULATION_NOTE).
const EXPECTED_NOTE =
  "chart calculation only; interpretation is not a verified or guaranteed claim";

// ===========================================================================
// resolvePromptVariables — animal/element/birth_year/western/eastern/alias,
// present AND absent for each; locale de/en; the located (eastern) guard.
// ===========================================================================

describe("resolvePromptVariables — exact resolved values + provenance (present branch)", () => {
  it("en locale binds animal=Horse, element=Metall, birth_year=1990, western=Holz, eastern=Feuer, alias=Holz with exact source paths", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample, // 0,0 — western is location-invariant, still binds
      fusion: fusionSample, // Berlin — eastern binds because coords match subject
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });

    expect(result.variables.animal).toBe("Horse");
    expect(result.variables.element).toBe("Metall");
    expect(result.variables.birth_year).toBe(1990);
    expect(result.variables.western_dominant).toBe("Holz");
    expect(result.variables.eastern_dominant).toBe("Feuer");
    // Deprecated alias mirrors western_dominant exactly.
    expect(result.variables.dominant_element).toBe("Holz");

    // Exact provenance paths (kills source-string mutants).
    expect(result.sources.animal).toBe("bazi.chinese.year.animal");
    expect(result.sources.element).toBe("bazi.pillars.year.element");
    expect(result.sources.birth_year).toBe("bazi.transition.solar_year");
    expect(result.sources.western_dominant).toBe("wuxing.dominant_element");
    expect(result.sources.eastern_dominant).toBe(
      "fusion.wu_xing_vectors.bazi_pillars (argmax)",
    );
    expect(result.sources.dominant_element).toBe("wuxing.dominant_element");

    // No issues when every source is present and the located source matches.
    expect(result.issues).toEqual([]);

    // matchedPaths / errors are the SAME object references (no copies).
    expect(result.matchedPaths).toBe(result.sources);
    expect(result.errors).toBe(result.issues);
  });

  it("de locale selects pillars.year.tier => animal='Pferd' (NOT 'Horse'), distinct source path", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "de",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.animal).toBe("Pferd");
    expect(result.variables.animal).not.toBe("Horse");
    expect(result.sources.animal).toBe("bazi.pillars.year.tier");
  });

  it("unknown / missing locale defaults to en ('Horse'), not de", () => {
    const defaulted = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample,
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(defaulted.variables.animal).toBe("Horse");
    expect(defaulted.sources.animal).toBe("bazi.chinese.year.animal");

    const garbage = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "fr",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(garbage.variables.animal).toBe("Horse");
  });
});

describe("resolvePromptVariables — absent branch records exact PROMPT_VARIABLE_SOURCE_MISSING issue + variable name", () => {
  it("missing chinese.year.animal (en) => no animal var + issue naming 'animal' and the path", () => {
    const broken = clone(baziSample);
    delete broken.chinese.year.animal;
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.animal).toBeUndefined();
    expect(result.sources.animal).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: animal (no source at bazi.chinese.year.animal)`,
    );
  });

  it("missing pillars.year.tier (de) => no animal var + issue naming the tier path", () => {
    const broken = clone(baziSample);
    delete broken.pillars.year.tier;
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "de",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.animal).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: animal (no source at bazi.pillars.year.tier)`,
    );
  });

  it("missing pillars.year.element => no element var + exact element issue", () => {
    const broken = clone(baziSample);
    delete broken.pillars.year.element;
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.element).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: element (no source at bazi.pillars.year.element)`,
    );
  });

  it("missing transition.solar_year => no birth_year var + exact birth_year issue", () => {
    const broken = clone(baziSample);
    delete broken.transition.solar_year;
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.birth_year).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: birth_year (no source at bazi.transition.solar_year)`,
    );
  });

  it("missing wuxing.dominant_element source => no western/alias var + exact western issue (plain absence, no 'location' word)", () => {
    const brokenWuxing = clone(wuxingSample);
    delete brokenWuxing.dominant_element;
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: brokenWuxing,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.western_dominant).toBeUndefined();
    expect(result.variables.dominant_element).toBeUndefined();
    expect(result.sources.western_dominant).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: western_dominant (no source at wuxing.dominant_element)`,
    );
    // The western source has NO location guard — its absence issue must not use
    // the location-mismatch wording (that wording belongs to the eastern source).
    const westernIssue = result.issues.find((i) => i.includes("western_dominant"));
    expect(westernIssue).toBeDefined();
    expect(westernIssue!.toLowerCase()).not.toContain("location mismatch");
  });
});

// ===========================================================================
// resolveString / resolveNumber found-vs-not-found edge branches.
// ===========================================================================

describe("resolveString edge cases — empty/whitespace/non-string source counts as MISSING", () => {
  it("empty-string element is treated as missing, not bound", () => {
    const broken = clone(baziSample);
    broken.pillars.year.element = "";
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.element).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: element (no source at bazi.pillars.year.element)`,
    );
  });

  it("whitespace-only element is treated as missing (trim() !== '')", () => {
    const broken = clone(baziSample);
    broken.pillars.year.element = "   ";
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.element).toBeUndefined();
  });

  it("non-string element (number) is treated as missing", () => {
    const broken = clone(baziSample);
    broken.pillars.year.element = 42;
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.element).toBeUndefined();
  });

  it("a present non-empty string IS bound (positive resolveString branch)", () => {
    const ok = clone(baziSample);
    ok.pillars.year.element = "Feuer";
    const result = resolvePromptVariables({
      bazi: ok,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.element).toBe("Feuer");
  });
});

describe("resolveNumber edge cases — non-finite / non-number source counts as MISSING", () => {
  it("birth_year as a numeric STRING ('1990') is treated as missing (not a number)", () => {
    const broken = clone(baziSample);
    broken.transition.solar_year = "1990";
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.birth_year).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: birth_year (no source at bazi.transition.solar_year)`,
    );
  });

  it("birth_year = 0 IS bound (finite zero is a present number, not missing)", () => {
    const zero = clone(baziSample);
    zero.transition.solar_year = 0;
    const result = resolvePromptVariables({
      bazi: zero,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.birth_year).toBe(0);
    expect(result.sources.birth_year).toBe("bazi.transition.solar_year");
  });

  it("a present finite number IS bound (positive resolveNumber branch)", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.birth_year).toBe(1990);
  });
});

// ===========================================================================
// FX5 — western_dominant is LOCATION-INVARIANT: it binds regardless of the
// subject's coordinates (the former 0,0 trap is RETIRED for the western field).
// ===========================================================================

describe("western_dominant — LOCATION-INVARIANT, binds regardless of subject coords", () => {
  it("sample is the 0,0 SHAPE fixture (precondition)", () => {
    expect(wuxingSample.input.lat).toBe(SAMPLE_LAT);
    expect(wuxingSample.input.lon).toBe(SAMPLE_LON);
  });

  it("0,0-derived wuxing vs Berlin subject => western_dominant STILL binds (no guard); alias mirrors it; no location issue", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample, // 0,0 SHAPE fixture
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.western_dominant).toBe("Holz");
    expect(result.variables.dominant_element).toBe("Holz");
    expect(result.sources.western_dominant).toBe("wuxing.dominant_element");
    expect(result.sources.dominant_element).toBe("wuxing.dominant_element");

    // No western/dominant issue exists at all — the western field has no guard.
    const westernIssue = result.issues.find(
      (i) => i.includes("western_dominant") || i.includes("dominant_element"),
    );
    expect(westernIssue).toBeUndefined();
  });

  it("subject undefined => western_dominant STILL binds (location is irrelevant to the western vector)", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample, // 0,0
      fusion: fusionSample,
      locale: "en",
      // no subject
    });
    expect(result.variables.western_dominant).toBe("Holz");
    expect(result.variables.dominant_element).toBe("Holz");
  });

  it("subject with NaN lat => western_dominant STILL binds", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample, // 0,0
      fusion: fusionSample,
      locale: "en",
      subject: { lat: Number.NaN, lon: REAL_LON },
    });
    expect(result.variables.western_dominant).toBe("Holz");
  });

  it("western_dominant binds even when fusion is entirely absent (independent of eastern)", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      // no fusion
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.western_dominant).toBe("Holz");
    expect(result.variables.dominant_element).toBe("Holz");
  });
});

// ===========================================================================
// FX9 — eastern_dominant is LOCATION-DEPENDENT: the located guard against the
// FUSION source coords is load-bearing (1e-6 tolerance), and fail-closed.
// ===========================================================================

describe("eastern_dominant — located guard against the fusion source coordinates", () => {
  it("fusion sample is the Berlin (located) fixture (precondition)", () => {
    expect(fusionSample.input.lat).toBe(REAL_LAT);
    expect(fusionSample.input.lon).toBe(REAL_LON);
  });

  it("matching coordinates => eastern_dominant binds to argmax(bazi_pillars)='Feuer' (positive guard branch)", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample, // Berlin
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBe("Feuer");
    expect(result.sources.eastern_dominant).toBe(
      "fusion.wu_xing_vectors.bazi_pillars (argmax)",
    );
  });

  it("fusion present but coords ≠ subject => eastern NOT bound; issue carries token + 'location' + computed coords", () => {
    const movedFusion = clone(fusionSample);
    movedFusion.input.lat = 0; // now 0,13.405 — mismatched vs Berlin subject
    movedFusion.input.lon = 0;
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: movedFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
    expect(result.sources.eastern_dominant).toBeUndefined();

    const easternIssue = result.issues.find((i) => i.includes("eastern_dominant"));
    expect(easternIssue).toBeDefined();
    expect(easternIssue).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
    expect(easternIssue!.toLowerCase()).toContain("location");
    // describeResponseLocation surfaces the (mismatched) fusion source coords verbatim.
    expect(easternIssue).toContain("0,0");
  });

  it("fusion ABSENT => eastern NOT bound; exact missing-source issue naming eastern_dominant + the path (plain absence, no 'location mismatch')", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      // no fusion
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
    expect(result.sources.eastern_dominant).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: eastern_dominant (no source at fusion.wu_xing_vectors.bazi_pillars)`,
    );
    const easternIssue = result.issues.find((i) => i.includes("eastern_dominant"))!;
    expect(easternIssue.toLowerCase()).not.toContain("location mismatch");
  });

  it("subject undefined => eastern fails closed, NOT bound (location flagged)", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample, // Berlin
      locale: "en",
      // no subject
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
    const easternIssue = result.issues.find((i) => i.includes("eastern_dominant"));
    expect(easternIssue!.toLowerCase()).toContain("location");
  });

  it("subject with NaN lat => eastern fails closed, NOT bound", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: Number.NaN, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
  });

  it("subject with Infinity lon => eastern fails closed, NOT bound", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: fusionSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: Number.POSITIVE_INFINITY },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
  });

  it("fusion input.lat non-numeric => eastern fails closed, NOT bound", () => {
    const badFusion = clone(fusionSample);
    badFusion.input.lat = "52.52"; // string, not number
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: badFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
  });

  it("coordsEqual tolerance: a delta just under 1e-6 still binds (within tolerance)", () => {
    const closeFusion = clone(fusionSample);
    closeFusion.input.lat = REAL_LAT + 5e-7; // |delta| = 5e-7 < 1e-6
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: closeFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBe("Feuer");
  });

  it("coordsEqual tolerance: a delta of 1e-5 does NOT bind (outside tolerance)", () => {
    const farFusion = clone(fusionSample);
    farFusion.input.lat = REAL_LAT + 1e-5; // |delta| = 1e-5 > 1e-6
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: farFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
    const easternIssue = result.issues.find((i) => i.includes("eastern_dominant"));
    expect(easternIssue!.toLowerCase()).toContain("location");
  });

  it("describeResponseLocation renders '?' when a fusion coord is non-numeric", () => {
    const badFusion = clone(fusionSample);
    badFusion.input.lat = "nope"; // non-number => "?"
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: badFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    const easternIssue = result.issues.find((i) => i.includes("eastern_dominant"));
    expect(easternIssue).toBeDefined();
    expect(easternIssue).toContain(`?,${REAL_LON}`);
  });

  it("argmax tie => eastern NOT bound (ambiguous → never an arbitrary guess)", () => {
    const tiedFusion = clone(fusionSample);
    // Make two elements share the strict maximum so argmaxElement returns undefined.
    tiedFusion.wu_xing_vectors.bazi_pillars = {
      Holz: 0.9,
      Feuer: 0.9, // tied top
      Erde: 0.1,
      Metall: 0.1,
      Wasser: 0.1,
    };
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: tiedFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
    expect(result.issues).toContain(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: eastern_dominant (no source at fusion.wu_xing_vectors.bazi_pillars)`,
    );
  });

  it("a different argmax winner binds the correct element (kills a hard-coded 'Feuer' mutant)", () => {
    const wasserFusion = clone(fusionSample);
    wasserFusion.wu_xing_vectors.bazi_pillars = {
      Holz: 0.1,
      Feuer: 0.2,
      Erde: 0.3,
      Metall: 0.4,
      Wasser: 0.99, // strict max
    };
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: wasserFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBe("Wasser");
  });
});

// ===========================================================================
// renderPromptTemplate — fill, single-pass, render-block throw.
// ===========================================================================

describe("renderPromptTemplate — fills placeholders with exact values", () => {
  it("renders exact output for all resolved variables", () => {
    const out = renderPromptTemplate(
      "animal={{animal}} element={{element}} year={{birth_year}}",
      { animal: "Horse", element: "Metall", birth_year: 1990 },
    );
    expect(out).toBe("animal=Horse element=Metall year=1990");
  });

  it("handles whitespace inside the placeholder braces", () => {
    const out = renderPromptTemplate("a={{  animal  }}", { animal: "Pferd" });
    expect(out).toBe("a=Pferd");
  });

  it("is single-pass: a value that itself looks like a placeholder is NOT re-expanded", () => {
    const out = renderPromptTemplate("x={{animal}}", {
      animal: "{{element}}",
      element: "Metall",
    });
    // Single replace pass => the injected '{{element}}' stays literal.
    expect(out).toBe("x={{element}}");
  });

  it("throws render-block with exact PROMPT_VARIABLE_SOURCE_MISSING message naming the missing var", () => {
    expect(() =>
      renderPromptTemplate("animal={{animal}} eastern={{eastern_dominant}}", {
        animal: "Horse",
      }),
    ).toThrow(
      `${PROMPT_VARIABLE_SOURCE_MISSING}: render-block — unresolved template variable(s): eastern_dominant`,
    );
  });

  it("lists ALL missing variables in the render-block error", () => {
    let message = "";
    try {
      renderPromptTemplate("{{animal}} {{element}} {{birth_year}}", {});
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
    expect(message).toContain("animal, element, birth_year");
  });

  it("null value also triggers render-block (not just undefined)", () => {
    expect(() =>
      renderPromptTemplate("a={{animal}}", { animal: null as unknown as string }),
    ).toThrow(PROMPT_VARIABLE_SOURCE_MISSING);
  });

  it("does NOT throw when all referenced variables resolve, even with extra vars present", () => {
    const out = renderPromptTemplate("a={{animal}}", { animal: "Horse", unused: "x" });
    expect(out).toBe("a=Horse");
  });
});

// ===========================================================================
// interpretFufireResponse — bazi caveat present/absent, wuxing, fusion,
// deferred, unknown op, verified booleans, CALCULATION_NOTE.
// ===========================================================================

describe("interpretFufireResponse — bazi day-pillar caveat surfaced verbatim", () => {
  it("present anchor_verification => exact caveat string, verified=true, no issues, exact note", () => {
    const result = interpretFufireResponse({ operation: "bazi", response: baziSample });
    expect(result.operation).toBe("bazi");
    expect(result.verified).toBe(true);
    expect(result.caveats).toEqual(["day-pillar anchor_verification: unverified"]);
    // dayPillar is the SAME array reference as caveats.
    expect(result.dayPillar).toBe(result.caveats);
    expect(result.issues).toEqual([]);
    expect(result.note).toBe(EXPECTED_NOTE);
    // Claim-discipline: interpretation never relabeled.
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("verified truth");
    expect(serialized).not.toContain("objective truth");
    expect(serialized).not.toContain("guaranteed fortune");
  });

  it("a DIFFERENT anchor_verification value is surfaced verbatim (not laundered to 'unverified')", () => {
    const verifiedBazi = clone(baziSample);
    verifiedBazi.derivation_trace.day.day_anchor_evidence.anchor_verification = "verified";
    const result = interpretFufireResponse({ operation: "bazi", response: verifiedBazi });
    expect(result.caveats).toEqual(["day-pillar anchor_verification: verified"]);
    expect(result.issues).toEqual([]);
  });

  it("absent anchor_verification => no caveat, an exact missing-source issue, still verified=true", () => {
    const noAnchor = clone(baziSample);
    delete noAnchor.derivation_trace.day.day_anchor_evidence.anchor_verification;
    const result = interpretFufireResponse({ operation: "bazi", response: noAnchor });
    expect(result.caveats).toEqual([]);
    expect(result.verified).toBe(true);
    expect(result.issues).toEqual([
      `${PROMPT_VARIABLE_SOURCE_MISSING}: day-pillar anchor_verification absent (cannot assert verification status)`,
    ]);
  });

  it("non-string anchor_verification => treated as absent (issue, no caveat)", () => {
    const weird = clone(baziSample);
    weird.derivation_trace.day.day_anchor_evidence.anchor_verification = 123;
    const result = interpretFufireResponse({ operation: "bazi", response: weird });
    expect(result.caveats).toEqual([]);
    expect(result.issues[0]).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
    expect(result.issues[0]).toContain("anchor_verification absent");
  });
});

describe("interpretFufireResponse — wuxing is a verifiable chart calculation", () => {
  it("wuxing => verified=true, no caveats, no issues, exact note", () => {
    const result = interpretFufireResponse({ operation: "wuxing", response: wuxingSample });
    expect(result.operation).toBe("wuxing");
    expect(result.verified).toBe(true);
    expect(result.caveats).toEqual([]);
    expect(result.dayPillar).toBe(result.caveats);
    expect(result.issues).toEqual([]);
    expect(result.note).toBe(EXPECTED_NOTE);
  });
});

describe("interpretFufireResponse — fusion is a verifiable chart calculation (FX9)", () => {
  it("fusion => verified=true, no caveats, no issues, exact note", () => {
    const result = interpretFufireResponse({ operation: "fusion", response: fusionSample });
    expect(result.operation).toBe("fusion");
    expect(result.verified).toBe(true);
    expect(result.caveats).toEqual([]);
    expect(result.dayPillar).toBe(result.caveats);
    expect(result.issues).toEqual([]);
    expect(result.note).toBe(EXPECTED_NOTE);
  });
});

describe("interpretFufireResponse — deferred ops render-block, never verified", () => {
  for (const op of ["bazi_trace", "chronometry"]) {
    it(`${op} => verified=false, deferred issue (token + op name + 'deferred'), exact note`, () => {
      const result = interpretFufireResponse({ operation: op, response: { shape: true } });
      expect(result.operation).toBe(op);
      expect(result.verified).toBe(false);
      expect(result.caveats).toEqual([]);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
      expect(result.issues[0]).toContain(`operation "${op}" is deferred`);
      expect(result.issues[0]).toContain("render-blocked");
      expect(result.note).toBe(EXPECTED_NOTE);
    });
  }
});

describe("interpretFufireResponse — unknown operation fails closed", () => {
  it("unknown op => verified=false, unknown-op issue (token + op name), exact note", () => {
    const result = interpretFufireResponse({ operation: "tarot", response: {} });
    expect(result.operation).toBe("tarot");
    expect(result.verified).toBe(false);
    expect(result.caveats).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
    expect(result.issues[0]).toContain(`unknown operation "tarot"`);
    expect(result.issues[0]).toContain("render-blocked");
    expect(result.note).toBe(EXPECTED_NOTE);
  });

  it("unknown op issue uses the UNKNOWN wording, not the DEFERRED wording", () => {
    const result = interpretFufireResponse({ operation: "tarot", response: {} });
    expect(result.issues[0]).not.toContain("is deferred");
  });
});

// ===========================================================================
// Security: no PII leak in issues/caveats. The eastern location-mismatch issue
// must carry the FUSION source coords, never the real subject's Berlin coords.
// ===========================================================================

describe("no PII leak — eastern location-mismatch issue describes the fusion source coords, not the real subject", () => {
  it("Berlin subject coords (52.52 / 13.405) do NOT appear in the mismatch issue", () => {
    const movedFusion = clone(fusionSample);
    movedFusion.input.lat = 0; // fusion source now reports 0,0
    movedFusion.input.lon = 0;
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      fusion: movedFusion,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    const easternIssue = result.issues.find((i) => i.includes("eastern_dominant"))!;
    expect(easternIssue).toContain("0,0");
    expect(easternIssue).not.toContain(String(REAL_LAT));
    expect(easternIssue).not.toContain(String(REAL_LON));
  });
});
