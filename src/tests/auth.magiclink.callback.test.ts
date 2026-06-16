import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseAllowlist } from "../lib/auth/parseAllowlist";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

describe("magic link callback — PKCE code exchange", () => {
  it("exchanges ?code= for session before redirecting", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    expect(content).toContain("exchangeCodeForSession");
    expect(content).toContain('params.get("code")');
  });

  it("surfaces exchange error message when exchange fails", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    expect(content).toContain("exchangeErrorMessage");
    expect(content).toContain("EXCHANGE_FAILED");
  });

  it("redirects with authError param when no session after exchange", () => {
    const content = read("src/components/auth/AuthCallbackView.tsx");
    expect(content).toContain("authError");
    expect(content).toContain("NO_AUTH_SESSION_AFTER_CALLBACK");
    expect(content).toContain("location.replace");
  });
});

describe("magic link send — shouldCreateUser", () => {
  it("passes shouldCreateUser: true to signInWithOtp", () => {
    const content = read("src/lib/auth/authState.ts");
    const optsLine = content
      .split("\n")
      .find((l) => l.includes("shouldCreateUser"));
    expect(optsLine).toBeTruthy();
    expect(optsLine).toContain("true");
  });

  it("sets emailRedirectTo to /auth/callback", () => {
    const content = read("src/lib/auth/authState.ts");
    expect(content).toContain("emailRedirectTo");
    expect(content).toContain("/auth/callback");
  });
});

describe("parseAllowlist", () => {
  it("splits comma-separated values", () => {
    expect(parseAllowlist("a@x.com,b@y.com,c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("trims whitespace around entries", () => {
    expect(parseAllowlist(" a@x.com , b@y.com ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("lowercases values", () => {
    expect(parseAllowlist("Admin@X.COM")).toEqual(["admin@x.com"]);
  });

  it("filters out empty entries", () => {
    expect(parseAllowlist("a@x.com,,b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("returns empty array for null / undefined / empty string", () => {
    expect(parseAllowlist(null)).toEqual([]);
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
  });

  it("supabaseClient.ts uses parseAllowlist for ADMIN_EMAIL_ALLOWLIST", () => {
    const content = read("src/lib/auth/supabaseClient.ts");
    expect(content).toContain("parseAllowlist");
  });
});
