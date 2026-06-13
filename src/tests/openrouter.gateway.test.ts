import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * REQ-A-002 — OpenRouter is the only default model gateway. (AC-A-002a..d)
 *
 * Kritische semantische Glättung — REQ-A-002 (BOUNDARY: env/config defaults that ship):
 *   These:      "The model gateway is configured."
 *   Gegenthese: A forced GEMINI_API_KEY / OPENAI default secret still ships in
 *               .env.example / default config, so an operator who follows the defaults
 *               wires a paid provider the project explicitly does not want as default,
 *               and OpenRouter is NOT actually the single default gateway. Config 'works'
 *               (green) yet the architectural value promise (single OpenRouter default,
 *               server-side only) is broken.
 *   Schärfung:  Grep the shipped default config (.env.example) and assert OPENROUTER_*
 *               defaults are present + server-side only, and no *required* default
 *               GEMINI_API_KEY / OPENAI_API_KEY is forced.
 *
 * Evidence class: real-boundary-smoke for the shipped .env.example artifact (the thing an
 * operator actually copies); pure-config-grep for source defaults.
 *
 * STATUS: RED CONTRACT — current .env.example forces GEMINI_API_KEY and has no
 * OPENROUTER_* defaults (verified at authoring time). The coder reconciles this in T5.
 */

const root = process.cwd();
function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("AC-A-002a — OpenRouter is the model-gateway default (server-side only)", () => {
  it(".env.example defines OPENROUTER_BASE_URL and OPENROUTER_API_KEY (server-side, no VITE_ prefix)", () => {
    const env = read(".env.example");
    expect(env).toContain("OPENROUTER_BASE_URL");
    expect(env).toContain("OPENROUTER_API_KEY");
    // Must NOT be exposed to the frontend bundle.
    expect(env).not.toContain("VITE_OPENROUTER_API_KEY");
    expect(env).not.toContain("VITE_OPENROUTER_BASE_URL");
  });
});

describe("AC-A-002b — no forced Gemini/OpenAI default secrets in default env", () => {
  it(".env.example does not force a required default GEMINI_API_KEY / OPENAI_API_KEY value", () => {
    const env = read(".env.example");
    // A forced default like `GEMINI_API_KEY="MY_GEMINI_API_KEY"` is the anti-pattern.
    expect(env).not.toMatch(/^\s*GEMINI_API_KEY\s*=\s*["']?\S+/m);
    expect(env).not.toMatch(/^\s*OPENAI_API_KEY\s*=\s*["']?\S+/m);
  });

  it("no forced default SECRET_REF_GEMINI_* / SECRET_REF_OPENAI_* in default env", () => {
    const env = read(".env.example");
    expect(env).not.toMatch(/^\s*SECRET_REF_GEMINI_\w+\s*=\s*["']?\S+/m);
    expect(env).not.toMatch(/^\s*SECRET_REF_OPENAI_\w+\s*=\s*["']?\S+/m);
  });
});
