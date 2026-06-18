/**
 * promptCompilationService — Lane-1 (deterministic) prompt compile.
 *
 * Lane 1 is the NO-LLM, NO-network half of the prompt-compile pipeline. Given a
 * REAL FuFire bazi response and a registered template id, it produces the filled
 * placeholder payload (master-prompt §4 Year Pillar), the deterministic overlay
 * plan (§11), the raw→source bindings (§2), and a per-field source status. It is
 * a PURE function composed entirely of the three existing deterministic
 * authorities:
 *   - {@link readCompileFields}  (fufireResponseInterpreter) — raw token projection.
 *   - {@link mapStem}/{@link mapBranch}/{@link mapWuxing} (baziSymbolMapper) — the
 *     SINGLE symbol authority; an unknown token returns a SOURCE_NEEDED sentinel.
 *   - {@link getTemplate} (templateRegistryService) — variant + negative constraints.
 *
 * True-Line invariants (mirrors the interpreter's "no invented data" boundary):
 *   - **No guessed symbol.** When a mapper returns SOURCE_NEEDED, the dependent
 *     placeholder is LEFT as its literal `{{...}}` token (so the downstream
 *     validator catches it) and `sourceStatus` records "SOURCE_NEEDED". We never
 *     substitute a plausible-but-wrong hanzi/pinyin.
 *   - **No half-invented composite.** A composite placeholder (year_pillar_*) is
 *     only filled when BOTH of its parts resolved; otherwise it too stays literal.
 *   - **Deterministic.** No clock, RNG, env, or I/O — the same input always yields
 *     a deep-equal output.
 *   - **Fail-closed lookup.** An unknown templateId throws (the registry's BLOCKED
 *     sentinel is surfaced as an Error) — a caller cannot silently proceed
 *     template-less.
 */

import {
  readCompileFields,
  type PromptLocale,
} from "./fufireResponseInterpreter";
import {
  mapStem,
  mapBranch,
  mapWuxing,
  type StemSymbol,
  type BranchSymbol,
  type WuxingSymbol,
  type SourceNeeded,
} from "./baziSymbolMapper";
import {
  getTemplate,
  type RegionPolicy,
} from "./templateRegistryService";

/** A resolved per-field source status. */
export type SourceStatus = "VERIFIED" | "SOURCE_NEEDED" | "API_VERIFIED_REQUIRED";

/** A single deterministic overlay zone (§11). */
export interface DeterministicOverlayItem {
  zone: string;
  placeholder: string;
  value: string;
  pinyinPlaceholder?: string;
  pinyinValue?: string;
  priority: number;
}

/** The Lane-1 compile output — the filled placeholder payload + audit metadata. */
export interface CompiledTemplate {
  variantId: string;
  regionPolicy: RegionPolicy;
  /** "{{year_stem_hanzi}}" → "庚". Unresolved placeholders keep their literal token. */
  templatePlaceholders: Record<string, string>;
  /** §11 overlay zones, ordered by priority. */
  deterministicOverlayPlan: DeterministicOverlayItem[];
  /** Logical field → FuFire raw path, e.g. yearStem → "data.pillars.year.stamm". */
  rawDataBindings: Record<string, string>;
  /** §10 negative constraints, copied from the template def. */
  negativeConstraints: string;
  /** Per logical field: VERIFIED | SOURCE_NEEDED | API_VERIFIED_REQUIRED. */
  sourceStatus: Record<string, SourceStatus>;
}

export interface CompileLane1Input {
  templateId: string;
  /** REAL FuFire bazi response (`{ _note?, data }` envelope or the inner object). */
  rawFuFireResponse: unknown;
  /** Render locale; selects the animal source. Defaults to "en". */
  locale?: PromptLocale | string;
}

function isSourceNeeded(v: unknown): v is SourceNeeded {
  return typeof v === "object" && v !== null && (v as SourceNeeded).status === "SOURCE_NEEDED";
}

/** The literal placeholder token for a key (kept verbatim when its source is missing). */
function token(key: string): string {
  return `{{${key}}}`;
}

/**
 * The raw FuFire source path each logical field is read from (master-prompt §2).
 * Recorded with the `data.` envelope prefix to mirror the captured response shape.
 */
const RAW_DATA_BINDINGS: Readonly<Record<string, string>> = Object.freeze({
  yearStem: "data.pillars.year.stamm",
  yearBranch: "data.pillars.year.zweig",
  animalDe: "data.pillars.year.tier",
  animalEn: "data.chinese.year.animal",
  elementDe: "data.pillars.year.element",
  birthLocal: "data.dates.birth_local",
  birthUtc: "data.dates.birth_utc",
  lichunLocal: "data.dates.lichun_local",
  isBeforeLichun: "data.transition.is_before_lichun",
  solarYear: "data.transition.solar_year",
  provenance: "data.provenance",
});

/**
 * Compile the Lane-1 deterministic placeholder payload from a FuFire response and
 * a registered template. Pure: no LLM, no network, no clock, no env.
 *
 * @throws {Error} when `templateId` is not registered (fail-closed; the registry's
 *   BLOCKED sentinel is surfaced as an Error rather than returned).
 */
export function compileLane1(input: CompileLane1Input): CompiledTemplate {
  const { templateId, rawFuFireResponse } = input;

  const template = getTemplate(templateId);
  if ("status" in template) {
    // BLOCKED / UNKNOWN_TEMPLATE — fail closed.
    throw new Error(`UNKNOWN_TEMPLATE: no registered template "${templateId}"`);
  }

  const fields = readCompileFields(rawFuFireResponse);

  const placeholders: Record<string, string> = {};
  const sourceStatus: Record<string, SourceStatus> = {};

  // Seed every known placeholder with its literal token; resolved ones overwrite.
  for (const key of FILLABLE_KEYS) {
    placeholders[token(key)] = token(key);
  }

  // --- Year Stem (天干) ------------------------------------------------------
  const stem = fields.yearStem !== undefined ? mapStem(fields.yearStem) : undefined;
  const stemSymbol = stem !== undefined && !isSourceNeeded(stem) ? (stem as StemSymbol) : undefined;
  if (stemSymbol) {
    placeholders[token("year_stem_hanzi")] = stemSymbol.hanzi;
    placeholders[token("year_stem_pinyin")] = stemSymbol.pinyin;
    sourceStatus.yearStem = "VERIFIED";
  } else {
    sourceStatus.yearStem = "SOURCE_NEEDED";
  }

  // --- Year Branch (地支) + Zodiac animal -----------------------------------
  const branch = fields.yearBranch !== undefined ? mapBranch(fields.yearBranch) : undefined;
  const branchSymbol =
    branch !== undefined && !isSourceNeeded(branch) ? (branch as BranchSymbol) : undefined;
  if (branchSymbol) {
    placeholders[token("year_branch_hanzi")] = branchSymbol.hanzi;
    placeholders[token("year_branch_pinyin")] = branchSymbol.pinyin;
    placeholders[token("year_animal_hanzi")] = branchSymbol.animalHanzi;
    placeholders[token("year_animal_pinyin")] = branchSymbol.animalPinyin;
    sourceStatus.yearBranch = "VERIFIED";
    sourceStatus.animal = "VERIFIED";
  } else {
    sourceStatus.yearBranch = "SOURCE_NEEDED";
    sourceStatus.animal = "SOURCE_NEEDED";
  }

  // --- Combined Year Pillar (柱) — only when BOTH halves resolved -----------
  if (stemSymbol && branchSymbol) {
    placeholders[token("year_pillar_hanzi")] = stemSymbol.hanzi + branchSymbol.hanzi;
    placeholders[token("year_pillar_pinyin")] = `${stemSymbol.pinyin} ${branchSymbol.pinyin}`;
    sourceStatus.yearPillar = "VERIFIED";
  } else {
    sourceStatus.yearPillar = "SOURCE_NEEDED";
  }

  // --- WuXing element (五行) -------------------------------------------------
  const element = fields.elementDe !== undefined ? mapWuxing(fields.elementDe) : undefined;
  const elementSymbol =
    element !== undefined && !isSourceNeeded(element) ? (element as WuxingSymbol) : undefined;
  if (elementSymbol) {
    placeholders[token("year_element_hanzi")] = elementSymbol.hanzi;
    placeholders[token("year_element_pinyin")] = elementSymbol.pinyin;
    sourceStatus.element = "VERIFIED";
  } else {
    sourceStatus.element = "SOURCE_NEEDED";
  }

  // --- Fixed labels (deterministic, never sourced from the response) --------
  placeholders[token("year_pillar_label_hanzi")] = "年柱";
  placeholders[token("year_pillar_label_pinyin")] = "niánzhù";
  placeholders[token("year_stem_label_hanzi")] = "天干";
  placeholders[token("year_branch_label_hanzi")] = "地支";

  // --- Lichun verification status (API-verified gate, §2) -------------------
  if (fields.lichunLocal === undefined || fields.isBeforeLichun === undefined) {
    sourceStatus.lichun = "API_VERIFIED_REQUIRED";
  } else {
    sourceStatus.lichun = "VERIFIED";
  }

  // --- Provenance status ----------------------------------------------------
  sourceStatus.provenance =
    fields.provenance.engineVersion !== undefined ? "VERIFIED" : "SOURCE_NEEDED";

  const deterministicOverlayPlan = buildOverlayPlan(placeholders);

  return {
    variantId: template.variantId,
    regionPolicy: template.regionPolicy,
    templatePlaceholders: placeholders,
    deterministicOverlayPlan,
    rawDataBindings: { ...RAW_DATA_BINDINGS },
    negativeConstraints: template.negativeConstraints,
    sourceStatus,
  };
}

/** Placeholder keys this lane can fill (seeded as literal tokens, then overwritten). */
const FILLABLE_KEYS: readonly string[] = [
  "year_pillar_hanzi",
  "year_pillar_pinyin",
  "year_stem_hanzi",
  "year_stem_pinyin",
  "year_branch_hanzi",
  "year_branch_pinyin",
  "year_animal_hanzi",
  "year_animal_pinyin",
  "year_element_hanzi",
  "year_element_pinyin",
  "year_pillar_label_hanzi",
  "year_pillar_label_pinyin",
  "year_stem_label_hanzi",
  "year_branch_label_hanzi",
];

/**
 * Build the §11 deterministic overlay plan from the resolved placeholders. The
 * zone set and priority order are fixed; each zone references the placeholder it
 * renders (kept as the literal token when unresolved so the validator can catch it).
 */
function buildOverlayPlan(
  placeholders: Record<string, string>,
): DeterministicOverlayItem[] {
  const val = (key: string): string => placeholders[token(key)] ?? token(key);
  return [
    {
      zone: "primary_year_pillar",
      placeholder: token("year_pillar_hanzi"),
      value: val("year_pillar_hanzi"),
      pinyinPlaceholder: token("year_pillar_pinyin"),
      pinyinValue: val("year_pillar_pinyin"),
      priority: 1,
    },
    {
      zone: "year_pillar_label",
      placeholder: token("year_pillar_label_hanzi"),
      value: val("year_pillar_label_hanzi"),
      pinyinPlaceholder: token("year_pillar_label_pinyin"),
      pinyinValue: val("year_pillar_label_pinyin"),
      priority: 2,
    },
    {
      zone: "stem_branch_detail",
      placeholder: token("year_stem_hanzi"),
      value: val("year_stem_hanzi"),
      pinyinPlaceholder: token("year_stem_pinyin"),
      pinyinValue: val("year_stem_pinyin"),
      priority: 3,
    },
    {
      zone: "zodiac_animal",
      placeholder: token("year_animal_hanzi"),
      value: val("year_animal_hanzi"),
      pinyinPlaceholder: token("year_animal_pinyin"),
      pinyinValue: val("year_animal_pinyin"),
      priority: 4,
    },
    {
      zone: "wuxing_phase",
      placeholder: token("year_element_hanzi"),
      value: val("year_element_hanzi"),
      pinyinPlaceholder: token("year_element_pinyin"),
      pinyinValue: val("year_element_pinyin"),
      priority: 5,
    },
    {
      zone: "provenance_footer",
      placeholder: token("year_branch_hanzi"),
      value: val("year_branch_hanzi"),
      pinyinPlaceholder: token("year_branch_pinyin"),
      pinyinValue: val("year_branch_pinyin"),
      priority: 6,
    },
  ];
}
