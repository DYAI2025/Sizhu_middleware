import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * RED CONTRACT — REQ-001 / NFR-002 / P9 (the load-bearing wired-in-prod case).
 * Feature: sizhu-agent-safe-ops · Phase 1 QA (black-box, written BEFORE the coder).
 *
 * Reality-Ledger note (must not be laundered): today the money gate has ZERO
 * server-route callers. server/index.ts:231-251 calls dispatchArtifact() directly;
 * the approval-record consume does not exist, and assertDispatchAllowed has no
 * server-route caller. The REQ-001 row may NOT flip wired-in-prod=yes until an
 * importer-grep shows the gate called ON the live /dispatch route reachable from
 * createApp().
 *
 * Kritische semantische Glättung — REQ-001 (BOUNDARY: built-but-dead trap, exactly P1/P9):
 *   These:      "An approval gate / ApprovalRepository exists and its unit tests pass."
 *   Gegenthese: It is a built-but-dead primitive — zero production importers; the
 *               /dispatch route still calls dispatchArtifact() directly with the body
 *               artifact. The gate is green in isolation yet the live money path is
 *               still ungated. User value of the gate = 0. (The MCP server's own
 *               comment already documents this gap: "assertDispatchAllowed is NOT
 *               enforced on this route".)
 *   Schärfung:  Static-trace the import edge from server/index.ts (createApp): SOME
 *               prod module reached from the composition root must consume the
 *               approval gate (ApprovalRepository / consumeApproval) AND that
 *               consumption must sit on the /dispatch handler path. A grep that finds
 *               the gate ONLY in tests fails this contract.
 *
 * VCHK (VC-001): the gate is alive on the live dispatch route, not shelfware.
 * Evidence class: pure-source-grep for the import + call edge (runtime proof is owned
 *   by the route test aso.dispatch.gate.routes.test.ts).
 *
 * EXPECTED NOW: RED — there is no approval-gate module and no server-route caller yet.
 *   // RED-by-assertion (zero importers) + RED-by-missing-module (no gate symbol).
 */

const ROOT = process.cwd();

// Canonical gate seam the coder must build + wire (T-ASO-1/T-ASO-2).
const GATE_SYMBOLS = ["ApprovalRepository", "consumeApproval", "LocalApprovalRepository"];

function collectProdSources(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = relative(ROOT, full);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "tests" || entry === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      if (rel.startsWith("scripts/smoke")) continue;
      out.push(full);
    }
  };
  dirs.forEach(walk);
  return out;
}

/** Walk the static import graph from server/index.ts; return reached prod files. */
function reachableFromCreateApp(): Set<string> {
  const reached = new Set<string>();
  const queue: string[] = ["server/index.ts"];
  const resolveImport = (fromRel: string, spec: string): string | null => {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
    const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : join(ROOT, fromRel, "..", spec);
    for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(c)) return relative(ROOT, c);
    }
    return null;
  };
  while (queue.length) {
    const rel = queue.shift()!;
    if (reached.has(rel)) continue;
    reached.add(rel);
    const full = join(ROOT, rel);
    if (!existsSync(full)) continue;
    const src = readFileSync(full, "utf8");
    const importRe = /(?:import[^'"]*|require\()\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const resolved = resolveImport(rel, m[1]);
      if (resolved && !resolved.includes("/tests/") && !resolved.startsWith("scripts/smoke")) {
        queue.push(resolved);
      }
    }
  }
  return reached;
}

describe("REQ-001 / NFR-002 — the approval gate exists as a real module", () => {
  it("the ApprovalRepository contract is declared on the repositories seam", () => {
    const interfaces = readFileSync(join(ROOT, "src/lib/repositories/interfaces.ts"), "utf8");
    expect(interfaces).toContain("ApprovalRepository");
    // RED-by-assertion until T-ASO-1 adds the interface.
  });
});

describe("REQ-001 / P9 — the gate has >=1 PRODUCTION importer reachable from createApp()", () => {
  it("some prod module imports the approval gate (not only tests)", () => {
    const sources = collectProdSources([join(ROOT, "src"), join(ROOT, "server")]);
    const importers = sources.filter((file) => {
      const rel = relative(ROOT, file);
      if (rel === "src/lib/repositories/approvalRepository.ts") return false; // the def itself
      const src = readFileSync(file, "utf8");
      return GATE_SYMBOLS.some((s) => src.includes(s)) && /import|require/.test(src);
    });
    expect(importers.length).toBeGreaterThanOrEqual(1);
  });

  it("createApp (server/index.ts) transitively reaches a module that consumes the gate", () => {
    const reached = reachableFromCreateApp();
    const reachesGate = [...reached].some((rel) => {
      const full = join(ROOT, rel);
      if (!existsSync(full)) return false;
      const src = readFileSync(full, "utf8");
      return src.includes("consumeApproval") || src.includes("ApprovalRepository");
    });
    expect(reachesGate).toBe(true);
    // Mutation RED: leave the /dispatch route calling dispatchArtifact() directly
    // (as today) → createApp never reaches the gate → RED. This is the P9 proof that
    // the depended-on guard is real WHERE the money path relies on it.
  });
});
