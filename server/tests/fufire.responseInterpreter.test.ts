import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * REQ-F-002 — Interpret FuFire responses without guessing (bazi + wuxing).
 * REQ-F-003 — Render prompt templates from safe prompt variables only.
 * VCHK-SFB-001 (no invented data), VCHK-SFB-004 (verified mapping + honest caveat),
 * VCHK-SFB-005 (claim-discipline), VCHK-SFB-007 (deferred ops honestly blocked).
 *
 * Tested against the REAL captured samples (integration-fake). The prompt-variable
 * source map (PRD §3.3, locale-driven animal RESOLVED 2026-06-13):
 *   animal           ← de: bazi.pillars.year.tier ("Pferd") | en: bazi.chinese.year.animal ("Horse")
 *   element          ← bazi.pillars.year.element ("Metall")
 *   birth_year       ← bazi.transition.solar_year (1990)
 *   dominant_element ← wuxing.dominant_element ("Holz" — western-vector argmax)
 *
 * Kritische semantische Glättung — REQ-F-002/F-003 (BOUNDARY of trust: real-vs-invented data):
 *   These:      "Prompt variables get populated and the template renders."
 *   Gegenthese: The interpreter SUBSTITUTES A GUESSED value when a required source field
 *               is absent (or maps bazi_trace/chronometry as if verified), so the end
 *               customer receives invented BaZi/Wu-Xing meaning presented as their own.
 *               Every render test stays green because a value is always present — the
 *               True-Line ("no invented data") is silently broken. Equally: the day-pillar
 *               'unverified' caveat is laundered into "verified", a claim-discipline breach.
 *   Schärfung:  (a) missing required source → PROMPT_VARIABLE_SOURCE_MISSING + render-block,
 *               never a guessed value; (b) bazi_trace/chronometry mapping render-blocks
 *               (no real samples); (c) the day-pillar 'unverified' status is surfaced, not
 *               laundered; (d) AC-F-002f: a 0,0-derived wuxing dominant_element is NEVER
 *               bound to a real person's prompt.
 *
 * Evidence class: integration-fake (real captured samples, NOT a live FuFire call) —
 * stated honestly in the Reality Ledger. bazi_trace + chronometry response-mapping are
 * render-blocked / unverified.
 *
 * STATUS: RED CONTRACT — the interpreter/mapper modules do not exist yet. Imports drive
 * their creation (T4). The intended surface is derived from PRD §2 + §3.3.
 */

// Intended modules + public surface the coder must create (T4).
import {
  interpretFufireResponse,
  resolvePromptVariables,
  renderPromptTemplate,
  PROMPT_VARIABLE_SOURCE_MISSING,
} from "../services/fufireResponseInterpreter";

const baziSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/bazi.response.json"), "utf8"),
);
const wuxingSample = JSON.parse(
  readFileSync(join(process.cwd(), "docs/contracts/fufire-samples/wuxing.response.json"), "utf8"),
);

// The REAL subject's birth coordinates (Berlin) — the bazi sample's `input` carries them.
const REAL_LAT = 52.52;
const REAL_LON = 13.405;

describe("AC-F-002a / VCHK-SFB-004 — known mapping paths tried in order; matched path recorded", () => {
  it("resolves animal/element/birth_year from the real bazi sample and records the matched source path", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.animal).toBe("Horse"); // en → chinese.year.animal
    expect(result.variables.element).toBe("Metall"); // pillars.year.element
    expect(result.variables.birth_year).toBe(1990); // transition.solar_year
    // The matched source path is recorded (provenance, not a guess).
    const sources = JSON.stringify(result.sources ?? result.matchedPaths ?? {});
    expect(sources).toContain("chinese.year.animal");
    expect(sources).toContain("pillars.year.element");
    expect(sources).toContain("transition.solar_year");
  });

  it("locale=de selects pillars.year.tier ('Pferd'); never mixes en+de in one render", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      locale: "de",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.animal).toBe("Pferd"); // de → pillars.year.tier
    expect(result.variables.animal).not.toBe("Horse");
  });
});

describe("AC-F-002b / VCHK-SFB-001 — missing required source blocks, never guesses", () => {
  it("a bazi response missing transition.solar_year yields PROMPT_VARIABLE_SOURCE_MISSING for birth_year (no guessed value)", () => {
    const broken = JSON.parse(JSON.stringify(baziSample));
    delete broken.transition.solar_year;
    const result = resolvePromptVariables({
      bazi: broken,
      wuxing: wuxingSample,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    // The missing variable must NOT be silently filled.
    expect(result.variables.birth_year).toBeUndefined();
    const issues = JSON.stringify(result.issues ?? result.errors ?? result);
    expect(issues).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
  });
});

describe("AC-F-002d / VCHK-SFB-007 — deferred ops (bazi_trace, chronometry) render-block, no verified mapping", () => {
  for (const op of ["bazi_trace", "chronometry"]) {
    it(`mapping a required prompt variable sourced from ${op} yields PROMPT_VARIABLE_SOURCE_MISSING + render-block`, () => {
      const result = interpretFufireResponse({
        operation: op,
        response: { someShape: true },
      });
      const serialized = JSON.stringify(result);
      // The interpreter must declare these unverified / render-blocked, never assert a verified mapping.
      expect(serialized).toContain(PROMPT_VARIABLE_SOURCE_MISSING);
      expect(result.verified).not.toBe(true);
    });
  }
});

describe("AC-F-002e / VCHK-SFB-004 — day-pillar 'unverified' caveat surfaced, not laundered", () => {
  it("interpreting the real bazi sample surfaces anchor_verification === 'unverified'", () => {
    const result = interpretFufireResponse({ operation: "bazi", response: baziSample });
    const serialized = JSON.stringify(result).toLowerCase();
    // The provider-declared unverified status must be carried through.
    expect(serialized).toContain("unverified");
    // And it must NEVER be relabeled as verified for the day pillar.
    const dayClaim = JSON.stringify(result.caveats ?? result.dayPillar ?? result);
    expect(dayClaim.toLowerCase()).toContain("unverified");
  });
});

describe("AC-F-002f (corrected, FX5/FX9) — western dominance is location-invariant; the located guard moved to eastern (fusion)", () => {
  it("a 0,0-derived wuxing western dominant_element BINDS (location-invariant — the 0,0 trap premise was empirically false)", () => {
    // The captured wuxing sample was computed at lat:0, lon:0 (a SHAPE fixture).
    expect(wuxingSample.input.lat).toBe(0);
    expect(wuxingSample.input.lon).toBe(0);

    // FX live finding (2026-06-14): the wuxing top-level dominant_element is the
    // WESTERN (geocentric) vector — identical at Berlin/Sydney/Quito for the same
    // instant. So a 0,0 source is NOT "wrong-location data" for this field; it is
    // location-invariant and binds to any subject. The old "never bound" guard was
    // theater and is retired (FX5). dominant_element is the deprecated alias.
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample, // 0,0-derived, but western is location-invariant
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });

    expect(result.variables.western_dominant).toBe("Holz");
    expect(result.variables.dominant_element).toBe("Holz"); // alias
    // No location-mismatch issue for the western field.
    const issues = JSON.stringify(result.issues);
    expect(issues.toLowerCase()).not.toContain("western_dominant");
  });

  it("the LOCATED guard now applies to eastern_dominant (fusion): no fusion ⇒ unbound + flagged, never guessed", () => {
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: wuxingSample,
      // no fusion supplied
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.eastern_dominant).toBeUndefined();
    expect(
      result.issues.some(
        (i) => i.includes(PROMPT_VARIABLE_SOURCE_MISSING) && i.includes("eastern_dominant"),
      ),
    ).toBe(true);
  });

  it("when wuxing IS called with the real subject lat/lon, dominant_element may bind (positive path)", () => {
    // Same sample shape but tagged as computed at the real coordinates.
    const realWuxing = JSON.parse(JSON.stringify(wuxingSample));
    realWuxing.input.lat = REAL_LAT;
    realWuxing.input.lon = REAL_LON;
    const result = resolvePromptVariables({
      bazi: baziSample,
      wuxing: realWuxing,
      locale: "en",
      subject: { lat: REAL_LAT, lon: REAL_LON },
    });
    expect(result.variables.dominant_element).toBe("Holz");
  });
});

describe("AC-F-003a/b — render only safe mapped variables; missing var blocks render", () => {
  it("renders a template using only resolved variables", () => {
    const out = renderPromptTemplate("animal={{animal}} element={{element}} year={{birth_year}}", {
      animal: "Horse",
      element: "Metall",
      birth_year: 1990,
    });
    expect(out).toContain("Horse");
    expect(out).toContain("Metall");
    expect(out).toContain("1990");
  });

  it("a required template variable with no resolved source blocks the render", () => {
    expect(() =>
      renderPromptTemplate("animal={{animal}} dominant={{dominant_element}}", { animal: "Horse" }),
    ).toThrow(/PROMPT_VARIABLE_SOURCE_MISSING|render.?block/i);
  });
});

describe("AC-F-003c / VCHK-SFB-005 — claim-discipline: no FuFirE interpretation asserted as verified truth", () => {
  it("rendered/mapped output does not label FuFirE interpretation as 'verified truth'", () => {
    const result = interpretFufireResponse({ operation: "bazi", response: baziSample });
    const serialized = JSON.stringify(result).toLowerCase();
    // Forbidden claim phrasings on interpretation.
    expect(serialized).not.toContain("verified truth");
    expect(serialized).not.toContain("objective truth");
    expect(serialized).not.toContain("guaranteed fortune");
  });
});
