import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OpenRouterImageGenerationProvider } from "../services/openRouterImageGenerationProvider";
import { OpenRouterQualityGateProvider } from "../services/openRouterQualityGateProvider";
import type { ImageGenerationProvider, QualityGateProvider } from "../../src/lib/providers/interfaces";

describe("OpenRouterImageGenerationProvider", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("implements ImageGenerationProvider interface", () => {
    const provider: ImageGenerationProvider = new OpenRouterImageGenerationProvider(
      "https://openrouter.ai/api/v1",
      "TEST_SECRET_REF",
    );
    expect(provider).toBeInstanceOf(OpenRouterImageGenerationProvider);
    expect(typeof provider.generate).toBe("function");
  });

  it("throws when the API key is missing (empty ref)", async () => {
    const provider = new OpenRouterImageGenerationProvider(
      "https://openrouter.ai/api/v1",
      "MISSING_REF_THAT_DOES_NOT_EXIST",
    );
    await expect(
      provider.generate("prompt", 1, "png", "hd", "some-model", "MISSING_REF_THAT_DOES_NOT_EXIST", {}),
    ).rejects.toThrow(/OpenRouter API key not found/i);
  });

  it("throws when the API key is empty string", async () => {
    process.env.EMPTY_KEY_REF = "";
    const provider = new OpenRouterImageGenerationProvider(
      "https://openrouter.ai/api/v1",
      "EMPTY_KEY_REF",
    );
    await expect(
      provider.generate("prompt", 1, "png", "hd", "some-model", "EMPTY_KEY_REF", {}),
    ).rejects.toThrow(/OpenRouter API key not found/i);
  });
});

describe("OpenRouterQualityGateProvider", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("implements QualityGateProvider interface", () => {
    const provider: QualityGateProvider = new OpenRouterQualityGateProvider(
      "https://openrouter.ai/api/v1",
      "TEST_SECRET_REF",
    );
    expect(provider).toBeInstanceOf(OpenRouterQualityGateProvider);
    expect(typeof provider.evaluate).toBe("function");
  });

  it("throws when the API key is missing", async () => {
    const provider = new OpenRouterQualityGateProvider(
      "https://openrouter.ai/api/v1",
      "MISSING_QA_REF",
    );
    await expect(
      provider.evaluate(
        [{ candidateIndex: 0, storagePath: "data:image/svg+xml;utf8,<svg></svg>", metadata: {} }],
        80,
        "Evaluate quality",
        "MISSING_QA_REF",
        "some-model",
        {},
        1,
      ),
    ).rejects.toThrow(/OpenRouter API key not found/i);
  });

  it("resolves secret from env using its configured ref", () => {
    process.env.LIVE_QA_REF = "sk-live-key-123";
    const provider = new OpenRouterQualityGateProvider(
      "https://openrouter.ai/api/v1",
      "LIVE_QA_REF",
    );
    expect(provider).toBeInstanceOf(OpenRouterQualityGateProvider);
  });
});
