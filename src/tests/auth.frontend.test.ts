import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Frontend secret-hygiene tests.
 *
 * The browser bundle must only ever reference the public anon key. These tests
 * statically scan the auth sources to make sure no service-role key or JWT
 * secret sneaks into anything that ships to the client.
 */

const root = process.cwd();

const FRONTEND_AUTH_FILES = [
  "src/lib/auth/supabaseClient.ts",
  "src/lib/auth/authState.ts",
  "src/components/auth/LoginView.tsx",
  "src/components/auth/AuthCallbackView.tsx",
  "src/components/auth/MfaSetupView.tsx",
  "src/components/auth/MfaChallengeView.tsx",
  "src/components/auth/AccountSecurityView.tsx",
  "src/components/auth/ProtectedRoute.tsx",
];

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("frontend secret hygiene", () => {
  it("no frontend auth file references a service-role key", () => {
    for (const file of FRONTEND_AUTH_FILES) {
      const content = read(file).toUpperCase();
      expect(content.includes("SERVICE_ROLE"), `${file} must not reference SERVICE_ROLE`).toBe(false);
      expect(content.includes("SERVICE-ROLE"), `${file} must not reference SERVICE-ROLE`).toBe(false);
    }
  });

  it("no frontend auth file references the JWT signing secret", () => {
    for (const file of FRONTEND_AUTH_FILES) {
      const content = read(file).toUpperCase();
      expect(content.includes("SUPABASE_JWT_SECRET"), `${file} must not reference SUPABASE_JWT_SECRET`).toBe(false);
    }
  });

  it("the Supabase client is created from the public anon key only", () => {
    const content = read("src/lib/auth/supabaseClient.ts");
    expect(content).toContain("VITE_SUPABASE_ANON_KEY");
    expect(content).toContain("VITE_SUPABASE_URL");
    expect(content.toUpperCase()).not.toContain("SERVICE_ROLE");
  });

  it("the LoginView never reads a service-role key", () => {
    // The anon key (public) may be referenced; the service-role key must not be.
    const content = read("src/components/auth/LoginView.tsx").toUpperCase();
    expect(content.includes("SERVICE_ROLE")).toBe(false);
    expect(content.includes("SERVICE-ROLE")).toBe(false);
  });
});
