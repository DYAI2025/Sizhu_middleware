import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("magic link callback — PKCE code exchange", () => {
  it("AuthCallbackView reads ?code= from the URL and calls exchangeCodeForSession", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    expect(content).toContain("exchangeCodeForSession");
    expect(content).toContain('params.get("code")');
  });

  it("AuthCallbackView shows NO_AUTH_SESSION_AFTER_CALLBACK when no session after exchange", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    expect(content).toContain("NO_AUTH_SESSION_AFTER_CALLBACK");
  });

  it("AuthCallbackView shows Supabase error message from exchange", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    expect(content).toContain("exchangeError");
  });

  it("AuthCallbackView does not redirect before session is confirmed", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    const assignCalls = content.match(/location\.assign/g) || [];
    const getSessionCalls = content.match(/getSession/g) || [];
    // assign must come after getSession
    const assignIdx = content.indexOf("location.assign");
    const sessionIdx = content.lastIndexOf("getSession");
    expect(assignIdx).toBeGreaterThan(sessionIdx);
  });
});

describe("magic link send — shouldCreateUser", () => {
  it("sendMagicLink passes shouldCreateUser: true to signInWithOtp", () => {
    const content = read("src/lib/auth/authState.ts");
    const optsLine = content
      .split("\n")
      .find((l) => l.includes("shouldCreateUser"));
    expect(optsLine).toBeTruthy();
    expect(optsLine).toContain("true");
  });

  it("sendMagicLink sets emailRedirectTo to /auth/callback", () => {
    const content = read("src/lib/auth/authState.ts");
    expect(content).toContain("emailRedirectTo");
    expect(content).toContain("/auth/callback");
  });
});

describe("admin email allowlist — VITE_ prefix for frontend", () => {
  it("supabaseClient.ts reads VITE_ADMIN_EMAIL_ALLOWLIST from import.meta.env", () => {
    const content = read("src/lib/auth/supabaseClient.ts");
    expect(content).toContain("VITE_ADMIN_EMAIL_ALLOWLIST");
  });

  it(".env has VITE_ADMIN_EMAIL_ALLOWLIST set", () => {
    const content = read(".env");
    expect(content).toContain("VITE_ADMIN_EMAIL_ALLOWLIST=ben.poersch@gmail.com");
  });
});
