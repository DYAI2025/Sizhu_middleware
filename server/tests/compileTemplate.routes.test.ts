import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "../index";
import { signJwtHS256, JwtPayload } from "../lib/jwt";
import type { LlmProseClient } from "../services/promptCompilationService";

/**
 * Route tests for POST /api/v1/compile-template (REQ-001).
 * Auth: the route is session-protected via the default-deny apiGuard.
 * The LLM prose client is INJECTED (fake) so no network is touched.
 */

const JWT_SECRET = "test-jwt-secret-value-do-not-log";
const ADMIN_EMAIL = "admin@example.com";

function token(overrides: Partial<JwtPayload> = {}): string {
  const base: JwtPayload = {
    sub: "user-123",
    email: ADMIN_EMAIL,
    aal: "aal1",
    email_confirmed_at: "2024-01-01T00:00:00Z",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return signJwtHS256({ ...base, ...overrides }, JWT_SECRET);
}

const REPO = resolve(__dirname, "..", "..");
const SAMPLE = JSON.parse(
  readFileSync(resolve(REPO, "docs/contracts/fufire-samples/bazi.live.response.json"), "utf8"),
);

// Fake prose client — returns a clean, policy-safe image prompt; never hits the network.
const fakeProse: LlmProseClient = {
  async formulateImagePrompt() {
    return "A calm modern Mainland Chinese courtyard background with quiet blank overlay zones and a subtle non-textual monkey ornament.";
  },
};

let app: Express;

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
  app = createApp({ proseClient: fakeProse });
});

beforeEach(() => {
  process.env.AUTH_REQUIRED = "true";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_EMAIL_ALLOWLIST = ADMIN_EMAIL;
});

describe("POST /api/v1/compile-template", () => {
  it("rejects an unauthenticated request (default-deny session)", async () => {
    const res = await request(app)
      .post("/api/v1/compile-template")
      .send({ templateId: "bazi_solo_beijing_modern_v1", rawFuFireResponse: SAMPLE });
    expect(res.status).toBe(401);
  });

  it("compiles the Geng/Wu (1990) sample to a PASS preview", async () => {
    const res = await request(app)
      .post("/api/v1/compile-template")
      .set("Authorization", `Bearer ${token()}`)
      .send({ templateId: "bazi_solo_beijing_modern_v1", rawFuFireResponse: SAMPLE });
    expect(res.status).toBe(200);
    expect(res.body.compiled.templatePlaceholders["{{year_pillar_hanzi}}"]).toBe("庚午");
    expect(res.body.compiled.templatePlaceholders["{{year_animal_hanzi}}"]).toBe("马");
    expect(res.body.compiled.imageGenerationPrompt).toContain("courtyard");
    expect(res.body.validation.verdict).toBe("PASS");
  });

  it("returns 400 for an unknown templateId", async () => {
    const res = await request(app)
      .post("/api/v1/compile-template")
      .set("Authorization", `Bearer ${token()}`)
      .send({ templateId: "nope_v9", rawFuFireResponse: SAMPLE });
    expect(res.status).toBe(400);
  });

  it("shows a BLOCKED preview (200) when a stem is unknown — no fake success", async () => {
    const broken = JSON.parse(JSON.stringify(SAMPLE));
    broken.data.pillars.year.stamm = "Zzz";
    const res = await request(app)
      .post("/api/v1/compile-template")
      .set("Authorization", `Bearer ${token()}`)
      .send({ templateId: "bazi_solo_beijing_modern_v1", rawFuFireResponse: broken });
    expect(res.status).toBe(200);
    expect(res.body.validation.verdict).toBe("BLOCKED");
    expect(res.body.validation.blockers).toContain("no_unknown_symbols");
  });
});
