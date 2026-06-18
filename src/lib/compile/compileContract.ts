/**
 * Shared compile-preview contract.
 *
 * Single source of truth for the validation/gate/result types of
 * `POST /api/v1/compile-template`. Imported by BOTH the server validator
 * (`server/services/compileValidationService.ts`) and the UI panel
 * (`src/components/CompileResultPanel.tsx`) so the API and the UI cannot drift
 * apart. Pure types only — no runtime, safe in both the server bundle and the
 * browser bundle.
 */

export type GateStatus = "PASS" | "FAIL";

export type Verdict = "PASS" | "BLOCKED";

/** One quality-gate outcome (master prompt §12). */
export interface GateResult {
  gate: string;
  required: string;
  status: GateStatus;
}

/** The full post-compile validation result. */
export interface ValidationResult {
  gates: GateResult[];
  verdict: Verdict;
  blockers: string[];
}

/** Minimal view of a compiled template that the validator reads (master prompt §5 + §12). */
export interface CompiledForValidation {
  variantId: string;
  regionPolicy: string;
  templatePlaceholders: Record<string, string>;
  imageGenerationPrompt?: string;
  negativeConstraints?: string;
  sourceStatus?: Record<string, string>;
  /** Earthly-Branch hanzi (e.g. 午, 申) — the §5 branch slot. */
  yearBranchHanzi?: string;
  /** Zodiac-animal hanzi (e.g. 马, 猴) — the §5 animal slot. */
  yearAnimalHanzi?: string;
}
