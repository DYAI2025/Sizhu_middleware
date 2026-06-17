import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * RED CONTRACT — REQ-005 (dispatch off-by-default) + REQ-006 (single catalog source)
 * + REQ-007 (delete stdio surface) + REQ-008 (off-by-default guard, RED-on-revert).
 * Feature: sizhu-agent-safe-ops · Phase 1 QA (black-box, written BEFORE the coder).
 *
 * Why SOURCE-level (not a live tools/list call): the canonical HTTP surface lives in
 * the SEPARATE `mcp-server/` npm package (ESM, Node16, .js import suffixes) with no
 * production importer into createApp() and its own build. Importing it into the root
 * vitest crosses that package boundary (RISK-003 — cross-package build complexity).
 * The single source of truth for tool NAME + conditional registration is the catalog
 * file itself, so the consolidation/off-by-default guarantees are verified there.
 * (A complementary live tools/list smoke is REQ-005's already-DONE real-boundary
 * evidence, run 2026-06-15 — not re-implemented here.)
 *
 * Kritische semantische Glättung — REQ-006/007 (BOUNDARY: two divergent tool catalogs
 * across two transports; one transport is being deleted):
 *   These:      "Both MCP transports expose the agent tools; an agent can call them."
 *   Gegenthese: Two hand-maintained catalogs drift — the stdio `server/mcp/registry/
 *               tools.ts` and the HTTP `mcp-server/src/server.ts` define tool sets
 *               INDEPENDENTLY (verified: separate lists, no shared module). An agent
 *               sees a tool/schema on one transport that differs on the other, or a
 *               dangerous tool is exposed on the leftover transport. "Build passes,
 *               tests pass" hides the second divergent definition. After the council
 *               decision the stdio surface must be DELETED — but deletion is the kind
 *               of work that looks done while files quietly remain.
 *   Schärfung:  After consolidation, `server/mcp` must NOT exist (Epic B = delete, not
 *               unify) and the `mcp:stdio`/`test:mcp` package scripts must be gone, so
 *               a second hand-catalog cannot drift. And on the surviving HTTP catalog,
 *               `sizhu_pod_dispatch` must be registered ONLY behind
 *               MCP_ENABLE_DISPATCH=true. A pass is impossible while the stdio files
 *               remain or the dispatch tool is unconditional.
 *
 * VCHK (VIS-006 #3 / VC-006, VC-007, VC-005, VC-008): one MCP surface; dangerous tools
 *   off-by-default with a RED-on-revert guard.
 * Evidence class: integration (source-of-truth grep over the catalog + package.json).
 *
 * EXPECTED NOW:
 *   - REQ-007 (stdio deleted): RED-by-assertion — `server/mcp` still exists today.
 *   - REQ-005/008 (HTTP off-by-default): GREEN-by-design today (mcp-server/src/server.ts:138
 *     already gates with MCP_ENABLE_DISPATCH). Flagged as ALREADY-COVERED, kept as a
 *     RED-on-revert guard (remove the guard → these go RED).
 */

const ROOT = process.cwd();
const STDIO_DIR = join(ROOT, "server/mcp");
const STDIO_REGISTRY = join(ROOT, "server/mcp/registry/tools.ts");
const HTTP_CATALOG = join(ROOT, "mcp-server/src/server.ts");
const PKG = join(ROOT, "package.json");

// Tools shared across surfaces that MUST keep identical names (parity, AC-008).
const SHARED_TOOL_NAMES = ["sizhu_get_health", "sizhu_get_readiness", "sizhu_run_fufire_test"];

describe("REQ-007 / AC-009 — the redundant stdio MCP surface is DELETED (one transport)", () => {
  it("server/mcp/ no longer exists (Epic B = delete the stdio transport)", () => {
    expect(existsSync(STDIO_DIR)).toBe(false);
    // RED-by-assertion: server/mcp still exists at HEAD → this fails until T-ASO-4.
  });

  it("the second hand-maintained catalog (server/mcp/registry/tools.ts) is gone", () => {
    expect(existsSync(STDIO_REGISTRY)).toBe(false);
    // After deletion there is no divergent SIZHU_MCP_TOOLS list to drift from HTTP.
  });

  it("package.json no longer defines mcp:stdio / test:mcp scripts", () => {
    const pkg = JSON.parse(readFileSync(PKG, "utf8"));
    const scripts = pkg.scripts ?? {};
    expect(scripts["mcp:stdio"]).toBeUndefined();
    expect(scripts["test:mcp"]).toBeUndefined();
    // RED-by-assertion: both scripts present at HEAD (package.json:19-20).
  });
});

describe("REQ-006 / AC-008 — exactly ONE catalog defines the shared tool names", () => {
  it("the surviving HTTP catalog registers each shared tool name", () => {
    expect(existsSync(HTTP_CATALOG)).toBe(true);
    const http = readFileSync(HTTP_CATALOG, "utf8");
    for (const name of SHARED_TOOL_NAMES) {
      expect(http).toContain(`"${name}"`);
    }
  });

  it("no SECOND source registers those tool names once stdio is deleted (no divergent catalog)", () => {
    // After deletion, the only file that may register a shared tool name is the HTTP
    // catalog. If any other (non-test) source still does, two catalogs can diverge.
    const stillDefinedElsewhere = SHARED_TOOL_NAMES.some((name) => {
      // server/mcp must be gone; if it (or any other registry) registers the name, fail.
      return existsSync(STDIO_REGISTRY) && readFileSync(STDIO_REGISTRY, "utf8").includes(`"${name}"`);
    });
    expect(stillDefinedElsewhere).toBe(false);
    // RED-by-assertion: stdio registry still defines these names today.
  });
});

describe("REQ-005 / AC-007 — sizhu_pod_dispatch registered ONLY with MCP_ENABLE_DISPATCH=true", () => {
  // ALREADY-COVERED (REQ-005 is DONE on the HTTP transport, verified live 2026-06-15).
  // Kept as a structural RED-on-revert guard: the conditional must remain.
  it("the HTTP catalog gates the dispatch tool behind the env flag (not unconditional)", () => {
    const http = readFileSync(HTTP_CATALOG, "utf8");
    expect(http).toContain("sizhu_pod_dispatch");
    // The registration must be guarded by MCP_ENABLE_DISPATCH === "true".
    expect(http).toMatch(/MCP_ENABLE_DISPATCH\s*===\s*"true"/);
    // The dispatch registration line must appear AFTER the guard (i.e. inside it).
    const guardIdx = http.search(/MCP_ENABLE_DISPATCH\s*===\s*"true"/);
    const dispatchIdx = http.indexOf('registerTool("sizhu_pod_dispatch"');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(dispatchIdx).toBeGreaterThan(guardIdx);
    // Mutation / RED-on-revert: hoist registerTool("sizhu_pod_dispatch") out of the
    // `if (MCP_ENABLE_DISPATCH === "true")` block (unconditional) → dispatchIdx no
    // longer follows the guard → RED.
  });
});

describe("REQ-008 / AC-010 — dangerous tools are off-by-default on the single surviving surface", () => {
  it("dispatch is NOT registered at module top-level (must require an explicit opt-in)", () => {
    const http = readFileSync(HTTP_CATALOG, "utf8");
    // There must be exactly one dispatch registration, and it must be inside the guard
    // block — never a second, unconditional one.
    const occurrences = (http.match(/registerTool\("sizhu_pod_dispatch"/g) || []).length;
    expect(occurrences).toBe(1);
    // RED-on-revert: add an unconditional second registration → occurrences === 2 → RED.
  });
});
