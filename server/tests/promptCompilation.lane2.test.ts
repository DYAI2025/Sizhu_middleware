import { describe, it, expect } from "vitest";

import {
  compileLane1,
  compileLane2,
  type CompiledTemplate,
  type LlmProseClient,
} from "../services/promptCompilationService";

/**
 * RED CONTRACT — Lane-2 LLM PROSE compile (the LLM formulates ONLY prose).
 * Feature: prompt-compile-preview · the LLM prose-formulation lane.
 *
 * compileLane2(lane1, templateId, client) takes the deterministic Lane-1 output
 * and lets an injected LLM formulate ONLY the `imageGenerationPrompt` prose text.
 * It MUST NOT touch any symbol value: templatePlaceholders, deterministicOverlayPlan,
 * rawDataBindings and sourceStatus stay byte-for-byte identical to Lane 1.
 * negativeConstraints stays the deterministic template value — NEVER the LLM output.
 *
 * Kritische semantische Glättung:
 *   These:      "The LLM writes the image prompt."
 *   Gegenthese: A careless lane could let the LLM output bleed into a symbol value
 *               (overwrite a placeholder, or replace negativeConstraints) — a
 *               hallucinated hanzi/constraint would ship onto a poster while the
 *               happy-path "prompt is set" test stays green.
 *   Schärfung:  AC-005 — templatePlaceholders/overlayPlan/rawDataBindings/sourceStatus
 *               are DEEP-EQUAL before and after compileLane2 (zero symbol values
 *               changed), and negativeConstraints equals the template's deterministic
 *               value, NOT the LLM output.
 */

const TEMPLATE_ID = "bazi_solo_beijing_modern_v1";

/** Minimal real-shaped bazi envelope (only the fields Lane 1 reads). */
function baziEnvelope(stamm: string, zweig: string): unknown {
  return {
    data: {
      pillars: { year: { stamm, zweig, tier: "—", element: "Metall" } },
      chinese: { year: { animal: "Horse" } },
      dates: {
        birth_local: "1990-06-15T14:30:00+02:00",
        birth_utc: "1990-06-15T12:30:00+00:00",
        lichun_local: "1990-02-04T03:14:00+01:00",
      },
      transition: { solar_year: 1990, is_before_lichun: false },
      provenance: { engine_version: "1.0.0-rc1", ruleset_id: "traditional_bazi_2026" },
    },
  };
}

const FAKE_PROSE = "A serene Beijing-modern poster background with a calm central blank zone.";

/** A recording fake — never touches the network; captures what it was called with. */
function makeFakeClient(): {
  client: LlmProseClient;
  calls: { seed: string; visualDirection: unknown; placeholders: Record<string, string> }[];
} {
  const calls: { seed: string; visualDirection: unknown; placeholders: Record<string, string> }[] = [];
  const client: LlmProseClient = {
    async formulateImagePrompt(input) {
      calls.push(input);
      return FAKE_PROSE;
    },
  };
  return { client, calls };
}

describe("compileLane2 — LLM prose lane (symbols stay deterministic)", () => {
  it("(1) sets imageGenerationPrompt to the LLM client's output", async () => {
    const lane1 = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: baziEnvelope("Geng", "Wu") });
    const { client } = makeFakeClient();

    const out = await compileLane2(lane1, TEMPLATE_ID, client);

    expect(out.imageGenerationPrompt).toBe(FAKE_PROSE);
  });

  it("(2) AC-005 — symbol values are DEEP-EQUAL before and after (zero changed by the LLM)", async () => {
    const lane1: CompiledTemplate = compileLane1({
      templateId: TEMPLATE_ID,
      rawFuFireResponse: baziEnvelope("Geng", "Wu"),
    });
    // Snapshot the deterministic symbol surfaces BEFORE Lane 2.
    const before = {
      templatePlaceholders: structuredClone(lane1.templatePlaceholders),
      deterministicOverlayPlan: structuredClone(lane1.deterministicOverlayPlan),
      rawDataBindings: structuredClone(lane1.rawDataBindings),
      sourceStatus: structuredClone(lane1.sourceStatus),
    };

    const { client } = makeFakeClient();
    const out = await compileLane2(lane1, TEMPLATE_ID, client);

    // The LLM lane changed ZERO symbol values. A mutation that lets the prose
    // output overwrite a placeholder (or any of these) makes this RED.
    expect(out.templatePlaceholders).toEqual(before.templatePlaceholders);
    expect(out.deterministicOverlayPlan).toEqual(before.deterministicOverlayPlan);
    expect(out.rawDataBindings).toEqual(before.rawDataBindings);
    expect(out.sourceStatus).toEqual(before.sourceStatus);
    // And the prose output must NOT have leaked into any placeholder value.
    expect(Object.values(out.templatePlaceholders)).not.toContain(FAKE_PROSE);
  });

  it("(3) negativeConstraints is the template's deterministic value, NOT the LLM output", async () => {
    const lane1 = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: baziEnvelope("Geng", "Wu") });
    const { client } = makeFakeClient();

    const out = await compileLane2(lane1, TEMPLATE_ID, client);

    expect(out.negativeConstraints).toBe(lane1.negativeConstraints);
    expect(out.negativeConstraints).toContain("no fake Chinese");
    expect(out.negativeConstraints).not.toBe(FAKE_PROSE);
  });

  it("(4) the client receives the template seed + the placeholders as read-only context", async () => {
    const lane1 = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: baziEnvelope("Geng", "Wu") });
    const { client, calls } = makeFakeClient();

    await compileLane2(lane1, TEMPLATE_ID, client);

    expect(calls).toHaveLength(1);
    // The seed is the template's imageGenerationPromptSeed (Beijing-modern).
    expect(calls[0].seed).toContain("Beijing Modern Mainland");
    // The placeholders are forwarded as read-only context.
    expect(calls[0].placeholders).toEqual(lane1.templatePlaceholders);
  });

  it("(5) returns a NEW object (does not mutate the Lane-1 input)", async () => {
    const lane1 = compileLane1({ templateId: TEMPLATE_ID, rawFuFireResponse: baziEnvelope("Geng", "Wu") });
    const { client } = makeFakeClient();

    const out = await compileLane2(lane1, TEMPLATE_ID, client);

    expect(out).not.toBe(lane1);
    // Lane 1 had no imageGenerationPrompt; mutating it would be a leak.
    expect((lane1 as CompiledTemplate).imageGenerationPrompt).toBeUndefined();
  });
});
