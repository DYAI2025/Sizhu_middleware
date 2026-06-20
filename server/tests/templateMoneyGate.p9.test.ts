import { describe, it, expect } from "vitest";
import type { PromptTemplate } from "../../src/types";

/**
 * REQ-008 / CONTRA-MONEY (P9) guard — server-template-config-store Slice-1.
 *
 * Council (provokateur): "Geld-Pfad gated" is only true if NO template field shifts
 * provider/model/cost/dispatch — else `set-active` must go through the money gate.
 *
 * Verified (src/types.ts): `PromptTemplate` = { id, name, content, version, status,
 * createdAt, createdBy } — it carries NO money-influencing field. Provider/model/cost/
 * dispatch live on SEPARATE config types (GenerationConfig.primaryModel/maxUsdPerRun,
 * QualityGate*Config.model, *.dispatchMode) which are OUT of Slice-1 scope. So activating
 * a template only changes prompt TEXT, not cost/provider/dispatch → `set-active` needs NO
 * money gate. (Content-poisoning is covered by the T3 save-validation, not a cost concern.)
 *
 * This is the standing P9 guard: if a money-influencing key is ever added to PromptTemplate,
 * the compile-time assertion below FAILS — forcing a re-evaluation of whether `set-active`
 * must then be routed through the dispatch/approval gate.
 */

// Money-influencing field names that, if present on PromptTemplate, would make set-active a
// cost/provider/dispatch-shifting operation (and thus require the money gate).
type MoneyInfluencingKey =
  | "model"
  | "primaryModel"
  | "fallbackModel"
  | "provider"
  | "primaryProvider"
  | "fallbackProvider"
  | "cost"
  | "maxUsdPerRun"
  | "maxImagesPerRun"
  | "dispatchMode"
  | "secretRef"
  | "primarySecretRef";

// Compile-time guard: keyof PromptTemplate ∩ MoneyInfluencingKey MUST be empty.
// If PromptTemplate ever gains such a field, `LeakedMoneyKeys` becomes non-never and this
// assignment fails `tsc` → the P9 gate decision must be revisited.
type LeakedMoneyKeys = Extract<keyof PromptTemplate, MoneyInfluencingKey>;
const _p9Guard: LeakedMoneyKeys extends never ? true : false = true;

describe("REQ-008 P9 — PromptTemplate carries no money-influencing field (set-active needs no money gate)", () => {
  it("compile-time guard holds (no money key on PromptTemplate)", () => {
    expect(_p9Guard).toBe(true);
  });

  it("a representative PromptTemplate exposes only non-money fields", () => {
    const t: PromptTemplate = {
      id: "t1",
      name: "demo",
      content: "{{x}}",
      version: 1,
      status: "draft",
      createdAt: "2026-06-20T00:00:00Z",
      createdBy: "admin@example.com",
    };
    const moneyKeys = [
      "model",
      "primaryModel",
      "provider",
      "primaryProvider",
      "cost",
      "maxUsdPerRun",
      "dispatchMode",
      "secretRef",
    ];
    expect(Object.keys(t).some((k) => moneyKeys.includes(k))).toBe(false);
  });
});
