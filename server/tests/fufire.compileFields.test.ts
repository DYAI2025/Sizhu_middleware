/**
 * Tests for `readCompileFields` (FuFire Year-Pillar raw tokens + provenance reader).
 *
 * This is a NEW exported reader that surfaces the Year-Pillar raw tokens and the
 * provenance block that the existing prompt-variable interpreter does not expose.
 * It is a pure unwrap-and-project of the REAL captured bazi response shape
 * (`docs/contracts/fufire-samples/bazi.live.response.json`), which is `{ _note, data }`.
 *
 * Invariants (mirroring the interpreter's "no invented data" discipline):
 *  - Accepts BOTH the wrapped `{ data }` envelope and an already-unwrapped object.
 *  - A missing field is left `undefined` — never substituted, never thrown.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readCompileFields } from "../services/fufireResponseInterpreter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(
  __dirname,
  "../../docs/contracts/fufire-samples/bazi.live.response.json",
);

function loadSample(): unknown {
  return JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));
}

describe("readCompileFields", () => {
  it("surfaces the Year-Pillar raw tokens + provenance from the wrapped {data} envelope", () => {
    const fields = readCompileFields(loadSample());

    expect(fields.yearStem).toBe("Geng");
    expect(fields.yearBranch).toBe("Wu");
    expect(fields.animalDe).toBe("Pferd");
    expect(fields.animalEn).toBe("Horse");
    expect(fields.elementDe).toBe("Metall");

    expect(fields.birthLocal).toBe("1990-06-15T14:30:00+02:00");
    expect(fields.birthUtc).toBe("1990-06-15T12:30:00+00:00");
    expect(fields.lichunLocal).toBe("1990-02-04T03:14:00.239874+01:00");
    expect(fields.isBeforeLichun).toBe(false);
    expect(fields.solarYear).toBe(1990);

    expect(fields.provenance.engineVersion).toBe("1.0.0-rc1-20260220");
    expect(fields.provenance.rulesetId).toBe("traditional_bazi_2026");
    expect(fields.provenance.parameterSetId).toBe("default_v1");
    expect(fields.provenance.ephemerisId).toBe("swieph_sepl18");
    expect(fields.provenance.computationTimestamp).toBe(
      "2026-06-18T03:04:38.643901+00:00",
    );
  });

  it("accepts an already-unwrapped object (the inner `data`)", () => {
    const sample = loadSample() as { data: unknown };
    const fields = readCompileFields(sample.data);

    expect(fields.yearStem).toBe("Geng");
    expect(fields.yearBranch).toBe("Wu");
    expect(fields.elementDe).toBe("Metall");
    expect(fields.solarYear).toBe(1990);
    expect(fields.provenance.engineVersion).toBe("1.0.0-rc1-20260220");
    expect(fields.lichunLocal).toBe("1990-02-04T03:14:00.239874+01:00");
  });

  it("leaves provenance fields undefined (no throw) when provenance is absent", () => {
    const fields = readCompileFields({
      data: {
        pillars: { year: { stamm: "Geng", zweig: "Wu", tier: "Pferd", element: "Metall" } },
        chinese: { year: { animal: "Horse" } },
      },
    });

    expect(fields.yearStem).toBe("Geng");
    expect(fields.provenance.engineVersion).toBeUndefined();
    expect(fields.provenance.rulesetId).toBeUndefined();
    expect(fields.provenance.parameterSetId).toBeUndefined();
    expect(fields.provenance.ephemerisId).toBeUndefined();
    expect(fields.provenance.computationTimestamp).toBeUndefined();
  });

  it("leaves every field undefined (no throw) on an empty / unrecognized response", () => {
    const fields = readCompileFields({});

    expect(fields.yearStem).toBeUndefined();
    expect(fields.yearBranch).toBeUndefined();
    expect(fields.animalDe).toBeUndefined();
    expect(fields.animalEn).toBeUndefined();
    expect(fields.elementDe).toBeUndefined();
    expect(fields.birthLocal).toBeUndefined();
    expect(fields.solarYear).toBeUndefined();
    expect(fields.isBeforeLichun).toBeUndefined();
    expect(fields.provenance.engineVersion).toBeUndefined();
  });
});
