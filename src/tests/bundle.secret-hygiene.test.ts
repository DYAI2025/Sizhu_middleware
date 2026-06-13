import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

/**
 * AC-S-002d / VCHK-SFB-003 (secret hygiene tail) — the frontend bundle must expose
 * no Supabase service-role key value (only refs / the public anon key).
 *
 * Kritische semantische Glättung — AC-S-002d (BOUNDARY: what physically ships to the browser):
 *   These:      "The frontend uses the anon key; secret hygiene tests are green."
 *   Gegenthese: A service-role key VALUE (or a VITE_-prefixed service-role var) sneaks
 *               into the built bundle that actually ships to the browser — the source
 *               looks clean but the compiled artifact leaks the secret. A source-only
 *               grep stays green while the shipped artifact is compromised.
 *   Schärfung:  Grep the BUILT bundle (dist/assets) when it exists; otherwise fall back
 *               to scanning the shipped frontend source tree and record the lower
 *               evidence ceiling. The strongest form requires `npm run build` first.
 *
 * Evidence class: real-boundary-smoke when dist/ exists (the real shipped artifact);
 * otherwise pure-source-grep (lower ceiling — recorded honestly in the test plan).
 */

const root = process.cwd();
const FORBIDDEN_PATTERNS = [
  /VITE_[A-Z_]*SERVICE_ROLE/,
  /VITE_SUPABASE_SERVICE/,
  /service[_-]?role[_-]?key\s*[:=]\s*["'][^"']+["']/i,
];

function collectFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "tests") continue;
      out.push(...collectFiles(full, exts));
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

describe("AC-S-002d — no service-role key value in the frontend bundle/source", () => {
  it("the shipped frontend exposes no service-role key value or VITE_ service-role var", () => {
    const distAssets = join(root, "dist", "assets");
    let files: string[];
    let evidence: string;
    if (existsSync(distAssets)) {
      files = collectFiles(distAssets, [".js", ".css", ".html"]);
      evidence = "real-boundary-smoke (built dist bundle)";
    } else {
      // Fallback: scan the shipped frontend source tree (everything under src/ that
      // is not tests). Lower evidence ceiling — recorded in the test plan.
      files = collectFiles(join(root, "src"), [".ts", ".tsx", ".js", ".jsx"]);
      evidence = "pure-source-grep (dist not built; run `npm run build` for the stronger ceiling)";
    }

    expect(files.length, `expected files to scan (${evidence})`).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          pattern.test(content),
          `${file} must not contain a service-role key value [${evidence}] (matched ${pattern})`,
        ).toBe(false);
      }
    }
  });
});
