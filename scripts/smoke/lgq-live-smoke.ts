/**
 * Live LGQ generate→QA boundary smoke (T8, REQ-LGQ-008 success signal).
 *
 * Retires the RED-for-confidence on the live generate→QA loop: the wired path
 * (the REAL OpenRouterImageGenerationProvider + OpenRouterQualityGateProvider, the
 * cost cap, and the runner-side PII redaction) has only mock/integration-fake
 * evidence. This hits the REAL OpenRouter boundary with the REAL secret and, per
 * CLAUDE.md P7, carries DISCRIMINATING guards so a green run cannot hide a defect.
 * The harness was itself adversarially reviewed; the checks below exist because a
 * naive "did a number / a data-URI come back" smoke false-greens on every one of
 * them.
 *
 * What a green --live run actually proves (each is a discriminating probe, not a
 * presence check):
 *   1. Slug freshness — both model ids exist in the LIVE /models catalog (FAIL LOUD
 *      on a stale slug, before any spend).
 *   2. Real image — the returned image is a valid PNG/JPEG of NON-trivial size
 *      (decoded bytes >= MIN_IMAGE_BYTES); a 1x1/blank/truncated image FAILS. (A
 *      hosted https URL is accepted as the provider's real contract allows it.)
 *   3. Real, image-conditioned QA — the gate scores the real image AND an obviously
 *      bad CONTROL (1x1) with the same rubric; the smoke FAILS unless the real score
 *      meaningfully exceeds the control. A model that default-passes (same score for
 *      both) turns the smoke RED.
 *   4. Real cost — FAILS if the cap accrued the per-image ESTIMATE because the live
 *      response omitted usage.cost (a fabricated "real cost" is not accepted).
 *   5. No PII on the wire — the prompt is compiled via the REAL renderPrompt path and
 *      run through the REAL redactKnownPiiValues; the captured outbound bodies,
 *      headers AND urls carry NO sentinel.
 *   6. Secret hygiene — the resolved key appears in NO captured material (the
 *      Authorization header is redacted at capture) and in NO line printed to stdout.
 *
 * Discriminating DRY-RUN modes (no network, no spend) prove each GUARD bites:
 *   --inject-drift     image response with no images[]  → ContractDriftError expected
 *   --inject-qa-drift  QA response with no parseable score → ContractDriftError expected
 *   --inject-402       non-2xx image response → OpenRouterHttpError expected
 *   --inject-pii       bypass redaction → the on-wire detector MUST catch sentinels
 *                      on BOTH the image and QA surfaces (per-surface discrimination)
 * Inject modes are FORCED to dry-run — they never spend money or leak the raw
 * sentinels to a third party.
 *
 * Run:
 *   npm run smoke:lgq                       # DRY-RUN happy path (no key needed)
 *   npm run smoke:lgq -- --inject-drift     # proves the image contract-drift guard bites
 *   npm run smoke:lgq -- --inject-qa-drift  # proves the QA no-default-pass guard bites
 *   npm run smoke:lgq -- --inject-402       # proves the non-2xx guard fails loud
 *   npm run smoke:lgq -- --inject-pii       # proves the PII-on-wire detector discriminates
 *   npm run smoke:lgq -- --live             # REAL call — spends ~$0.04 on 1 image (needs the key)
 *
 * KNOWN BOUNDARIES (stated, not hidden): the smoke runs a single 1-candidate live
 * generation, so the count-cap BITE and the n>1 byte-dup-fan-out paths are not
 * exercised live (both are unit-tested + a dry-run cap-bite assertion below proves
 * the cap refuses). After a green --live run, still adversarially re-verify before
 * flipping the Reality Ledger (P7).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARGS = new Set(process.argv.slice(2));
const INJECT_DRIFT = ARGS.has("--inject-drift");
const INJECT_QA_DRIFT = ARGS.has("--inject-qa-drift");
const INJECT_402 = ARGS.has("--inject-402");
const INJECT_PII = ARGS.has("--inject-pii");
const ANY_INJECT = INJECT_DRIFT || INJECT_QA_DRIFT || INJECT_402 || INJECT_PII;
const WANTS_LIVE = ARGS.has("--live") || process.env.LGQ_SMOKE_LIVE === "1";
// Money + leak safety: inject modes are ALWAYS dry-run (they craft responses and, for
// --inject-pii, deliberately send unredacted sentinels — must never touch the wire).
const LIVE = WANTS_LIVE && !ANY_INJECT;
const DRY_RUN = !LIVE;

const MIN_IMAGE_BYTES = 1000; // a real generated image is KBs; a 1x1/blank is < this.

// Unique sentinels — astronomically unlikely to occur incidentally on the wire.
const PII_NAME = "SENTINEL_NAME_Zq7_Aldébaran_DELETEME"; // accented, to exercise non-ASCII
const PII_DATE = "SENTINEL_DATE_1991-07-23_Zq7";
const PII_PLACE = "SENTINEL_PLACE_Vega-IV_Zq7_DELETEME";
const PII_TIME = "SENTINEL_TIME_03h14_Zq7";
const SENTINELS = [PII_NAME, PII_DATE, PII_PLACE, PII_TIME];

const ART = "Watercolor celestial totem, intricate gold linework, deep indigo background";

// A real 1x1 PNG (the QA CONTROL — an obviously-bad image a real gate must score low).
const CONTROL_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const CONTROL_MARKER = "C1HAwCAAAAC0lEQVR42mP8z8BQ"; // unique substring of the 1x1
// A dry-run "good" image: valid PNG magic + padded to exceed MIN_IMAGE_BYTES.
const DRY_GOOD_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA" + "A".repeat(1600);

interface Captured {
  url: string;
  body: string; // request body, coerced to a scannable string
  headers: Record<string, string>; // Authorization value redacted
  responseBody: string; // captured for cost-provenance + adversarial re-read
  kind: "image" | "qa" | "catalog" | "other";
}
const captured: Captured[] = [];

// ── stdout capture (real secret-hygiene scan) ──
const printed: string[] = [];
const _log = console.log.bind(console);
const _err = console.error.bind(console);
function log(...a: any[]) { printed.push(a.join(" ")); _log(...a); }
console.error = (...a: any[]) => { printed.push(a.join(" ")); _err(...a); };

function loadDotEnv(file = resolve(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

function normalizeHeaders(h: any): Record<string, string> {
  if (!h) return {};
  let out: Record<string, string> = {};
  if (typeof h.entries === "function") out = Object.fromEntries(h.entries());
  else if (Array.isArray(h)) out = Object.fromEntries(h);
  else out = { ...h };
  // Redact the bearer so a captured-dump (or this harness) can never echo the key.
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === "authorization") out[k] = "Bearer [REDACTED-KEY]";
  }
  return out;
}

/** Coerce any request-body shape to a scannable string, or FAIL LOUD on an unscannable one. */
function bodyToString(body: any): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return Buffer.from(body as any).toString("utf8");
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body.toString();
  throw new Error(`unscannable request body shape (${body?.constructor?.name ?? typeof body}) — refusing to claim no-PII over a body the detector cannot read`);
}

function classify(body: string): Captured["kind"] {
  try {
    const j = JSON.parse(body);
    if (j && j.modalities !== undefined) return "image"; // only image-gen sends modalities
    if (j && Array.isArray(j.messages)) return "qa";
  } catch { /* not JSON */ }
  return "other";
}

function decodeDataUri(uri: string): { ok: boolean; bytes: number; magic: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(uri);
  if (!m) return { ok: false, bytes: 0, magic: "" };
  const buf = Buffer.from(m[2], "base64");
  const isPng = buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return { ok: isPng || isJpeg, bytes: buf.length, magic: isPng ? "PNG" : isJpeg ? "JPEG" : "?" };
}

function imageIsReal(storagePath: string): { ok: boolean; detail: string } {
  if (typeof storagePath !== "string" || storagePath.length === 0) return { ok: false, detail: "empty" };
  if (/^https?:\/\//.test(storagePath)) return { ok: true, detail: "hosted https URL (provider-accepted shape)" };
  const d = decodeDataUri(storagePath);
  if (!d.ok) return { ok: false, detail: "not a valid PNG/JPEG data URI" };
  if (d.bytes < MIN_IMAGE_BYTES) return { ok: false, detail: `${d.magic} but only ${d.bytes}B (< ${MIN_IMAGE_BYTES}B — blank/trivial)` };
  return { ok: true, detail: `${d.magic} ${d.bytes}B` };
}

/** Dry-run / inject fetch: records the request, returns a crafted response per mode. */
function installCapturingFetch(realFetch: typeof globalThis.fetch): void {
  (globalThis as any).fetch = async (url: any, init?: any): Promise<any> => {
    const reqBody = bodyToString(init?.body);
    const kind = String(url).includes("/models") ? "catalog" : classify(reqBody);

    if (!DRY_RUN) {
      const res = await realFetch(url, init);
      let respBody = "";
      try { respBody = await res.clone().text(); } catch { respBody = "<unreadable>"; }
      captured.push({ url: String(url), body: reqBody, headers: normalizeHeaders(init?.headers), responseBody: respBody, kind });
      return res;
    }

    // ── DRY-RUN stubs ──
    const stub = (status: number, ok: boolean, obj: any) => {
      const text = JSON.stringify(obj);
      captured.push({ url: String(url), body: reqBody, headers: normalizeHeaders(init?.headers), responseBody: text, kind });
      return { ok, status, json: async () => obj, text: async () => text };
    };

    if (kind === "catalog") {
      return stub(200, true, { data: [{ id: "google/gemini-2.5-flash-image" }, { id: "google/gemini-2.5-flash" }] });
    }
    if (kind === "image") {
      if (INJECT_402) return stub(402, false, { error: { message: "can only afford 337" } });
      if (INJECT_DRIFT) return stub(200, true, { choices: [{ message: { content: "sorry, no image" } }], usage: { cost: 0 } });
      return stub(200, true, { choices: [{ message: { images: [{ image_url: { url: DRY_GOOD_IMAGE } }], content: "ok" } }], usage: { cost: 0.0387 } });
    }
    // QA
    if (INJECT_QA_DRIFT) return stub(200, true, { choices: [{ message: { content: "the model rambled with no JSON score" } }], usage: { cost: 0.0012 } });
    // Score by image: the 1x1 control scores LOW, a real image scores HIGH (so the
    // dry-run also exercises the control-probe discrimination logic).
    const score = reqBody.includes(CONTROL_MARKER) ? 22 : 88;
    return stub(200, true, { choices: [{ message: { content: JSON.stringify({ score, reason: "stub" }) } }], usage: { cost: 0.0012 } });
  };
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return "<invalid>"; }
}

async function scoreImage(qaProvider: any, storagePath: string, rubric: string, secretRef: string, qaModel: string): Promise<number | null> {
  const evals = await qaProvider.evaluate(
    [{ candidateIndex: 0, storagePath, metadata: {} }],
    70,
    rubric,
    secretRef,
    qaModel,
    { animal: "Dragon", element: "Fire" },
    1,
  );
  return evals[0]?.score ?? null;
}

async function main(): Promise<void> {
  loadDotEnv();

  const gateway = await import("../../src/lib/modelGateway/openRouterGateway");
  const creds = gateway.resolveOpenRouterCredentials();

  // Dry-run needs no real secret: inject a dummy so the provider's key-presence guard
  // passes and the (stubbed) call path runs on a keyless checkout / CI.
  if (DRY_RUN && !process.env[creds.secretRef]) process.env[creds.secretRef] = "sk-or-DRYRUN-DUMMY-0000";
  const resolvedKey = process.env[creds.secretRef];

  const { OpenRouterImageGenerationProvider } = await import("../../src/lib/providers/openrouter/openRouterImageGenerationProvider");
  const { OpenRouterQualityGateProvider } = await import("../../src/lib/providers/openrouter/openRouterQualityGateProvider");
  const { CostCappedImageGenerationProvider } = await import("../../src/lib/providers/openrouter/costCappedImageProvider");
  const costCap = await import("../../src/lib/workflow/costCap");
  const { redactKnownPiiValues } = await import("../../src/lib/providers/openrouter/piiRedaction");
  const { renderPrompt } = await import("../../src/lib/workflow/promptRenderer");
  const { ContractDriftError, OpenRouterHttpError } = await import("../../src/lib/providers/openrouter/errors");

  const imageModel = gateway.selectModelForOperation("image_generation");
  const qaModel = gateway.selectModelForOperation("quality_gate");

  log("── Live LGQ generate→QA boundary smoke ──────────────────────");
  const modeLabel = LIVE ? "LIVE — REAL OpenRouter (spends ~$0.04)" : "DRY-RUN (stubbed, no spend)";
  const injectLabel = INJECT_DRIFT ? " +INJECT-DRIFT" : INJECT_QA_DRIFT ? " +INJECT-QA-DRIFT" : INJECT_402 ? " +INJECT-402" : INJECT_PII ? " +INJECT-PII" : "";
  log(`mode            : ${modeLabel}${injectLabel}`);
  if (WANTS_LIVE && ANY_INJECT) log("note            : --live ignored — inject modes are forced to dry-run (no spend, no leak).");
  log(`base URL host   : ${hostOf(creds.baseUrl)}`);
  log(`secret-ref var  : ${creds.secretRef} (key ${creds.present ? "PRESENT" : "ABSENT"})`);
  log(`models          : image=${imageModel} · qa=${qaModel}`);

  if (LIVE && !creds.present) {
    log(`✗ FAIL: --live requested but no OpenRouter key under ${creds.secretRef}. Export it or drop --live.`);
    process.exit(1);
  }

  // Compile the prompt via the REAL runner path: renderPrompt(template, payload) then
  // redact (or, for --inject-pii, SKIP redaction to prove the detector bites).
  const templateContent = `${ART}. Totem for {{personalization.name}}, born {{personalization.birth_date}} at {{personalization.birth_time}} in {{personalization.birth_place}}. Zodiac {{fufire.animal}}, element {{fufire.element}}.`;
  const payload = {
    personalization: { name: PII_NAME, birth_date: PII_DATE, birth_time: PII_TIME, birth_place: PII_PLACE },
    fufire: { animal: "Dragon", element: "Fire", dominant_element: "Fire", birth_year: 1991 },
  };
  const compiled = renderPrompt(templateContent, payload);
  const piiValues = [PII_NAME, PII_DATE, PII_PLACE, PII_TIME];
  const prompt = INJECT_PII ? compiled : redactKnownPiiValues(compiled, piiValues);
  const rubricRaw = `Rate composition, color harmony and motif clarity for ${PII_NAME} (${PII_PLACE}). 0-100.`;
  const rubric = INJECT_PII ? rubricRaw : redactKnownPiiValues(rubricRaw, piiValues);

  const cap = { maxImagesPerRun: 2, maxUsdPerRun: 0.5 };
  const cappedImage = new CostCappedImageGenerationProvider(new OpenRouterImageGenerationProvider(), cap);
  const qaProvider = new OpenRouterQualityGateProvider();

  const realFetch = globalThis.fetch;
  installCapturingFetch(realFetch);

  const derived = { animal: "Dragon", element: "Fire", dominant_element: "Fire", birth_year: 1991, iteration: 1 };
  let driftThrown = false;
  let httpThrown = false;
  let candidate: any = null;
  let realScore: number | null = null;
  let controlScore: number | null = null;

  // ── 0. Slug freshness (LIVE only) ──
  let slugDrift: string[] = [];
  if (LIVE) {
    try {
      const res = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${resolvedKey}` } });
      const ids: string[] = res.ok ? (((await res.json()) as any).data ?? []).map((m: any) => m.id) : [];
      slugDrift = [imageModel, qaModel].filter((s) => !ids.includes(s));
      log(`catalog         : ${res.ok ? `${ids.length} models` : "UNAVAILABLE"}${slugDrift.length ? " — ✗ STALE: " + slugDrift.join(", ") : " (slugs fresh)"}`);
    } catch (e: any) { log(`catalog         : ✗ ${e?.message ?? e}`); slugDrift = [imageModel, qaModel]; }
  }

  // ── 1. Image generation ──
  try {
    const candidates = await cappedImage.generate(prompt, 1, "png", "hd", imageModel, creds.secretRef, derived);
    candidate = candidates[0];
  } catch (e: any) {
    if (e instanceof ContractDriftError) { driftThrown = true; log(`drift guard     : ✓ ContractDriftError — "${String(e.message).slice(0, 70)}"`); }
    else if (e instanceof OpenRouterHttpError) { httpThrown = true; log(`http guard      : ✓ OpenRouterHttpError (status ${e.status})`); }
    else log(`image gen       : ✗ ${e?.message ?? e}`);
  }

  // ── 2/3. QA score (real) + control probe ──
  if (candidate && !driftThrown && !httpThrown) {
    try {
      realScore = await scoreImage(qaProvider, candidate.storagePath, rubric, creds.secretRef, qaModel);
      controlScore = await scoreImage(qaProvider, CONTROL_IMAGE, rubric, creds.secretRef, qaModel);
      log(`qa scores       : real=${realScore} · control(1x1)=${controlScore}`);
    } catch (e: any) {
      if (e instanceof ContractDriftError) { driftThrown = true; log(`qa drift guard  : ✓ ContractDriftError — "${String(e.message).slice(0, 70)}"`); }
      else log(`qa eval         : ✗ ${e?.message ?? e}`);
    }
  }

  // ── 4. Cost provenance ──
  const imageResp = captured.find((c) => c.kind === "image");
  let usageCostPresent = false;
  try { usageCostPresent = typeof JSON.parse(imageResp?.responseBody ?? "{}")?.usage?.cost === "number"; } catch { /* */ }
  const realCostUsd = cappedImage.enforcer.accumulatedUsd;

  // ── 5. PII on wire (body + headers + url, per surface) ──
  const scan = (pred: (c: Captured) => boolean) =>
    SENTINELS.filter((s) => captured.filter(pred).some((c) => c.body.includes(s) || JSON.stringify(c.headers).includes(s) || c.url.includes(s)));
  const piiAnywhere = scan(() => true);
  const piiOnImage = scan((c) => c.kind === "image");
  const piiOnQa = scan((c) => c.kind === "qa");

  // ── 6. Secret hygiene (captured material + everything printed) ──
  const keyReal = !!resolvedKey && !resolvedKey.includes("DRYRUN") && resolvedKey.length > 8;
  const secretLeak = keyReal && (JSON.stringify(captured).includes(resolvedKey) || printed.join("\n").includes(resolvedKey));

  // ── cap-bite dry assertion (no spend): the cap REFUSES once at the ceiling ──
  let capBites = false;
  try {
    const enf = costCap.createCostCapEnforcer({ maxImagesPerRun: 1, maxUsdPerRun: 100 });
    enf.assertCanIssueImageCall(); enf.recordImageCall(0.04);
    try { enf.assertCanIssueImageCall(); } catch (e: any) { capBites = e instanceof costCap.CostCapError; }
  } catch { /* */ }

  log(`captured reqs   : ${captured.length} (${captured.map((c) => c.kind).join(",")})`);
  log(`cap bite (dry)  : ${capBites ? "✓ enforcer refuses at ceiling" : "✗ cap did not bite"}`);
  log(`secret hygiene  : ${secretLeak ? "✗ KEY LEAKED" : "✓ key in no captured material or stdout"}`);

  // ── Verdict ──
  let fail = false;
  if (INJECT_DRIFT) { log(`inject-drift    : ${driftThrown ? "✓ guard bit" : "✗ NO drift error"}`); fail = !driftThrown; }
  else if (INJECT_QA_DRIFT) { log(`inject-qa-drift : ${driftThrown ? "✓ QA guard bit" : "✗ NO QA drift error"}`); fail = !driftThrown; }
  else if (INJECT_402) { log(`inject-402      : ${httpThrown ? "✓ HTTP guard bit" : "✗ NO http error"}`); fail = !httpThrown; }
  else if (INJECT_PII) {
    const perSurface = piiOnImage.length > 0 && piiOnQa.length > 0;
    log(`inject-pii      : image-surface=${piiOnImage.length ? "caught" : "MISSED"} · qa-surface=${piiOnQa.length ? "caught" : "MISSED"}`);
    fail = !perSurface; // detector must catch the leak on BOTH egress surfaces
  } else {
    const img = candidate ? imageIsReal(candidate.storagePath) : { ok: false, detail: "no candidate" };
    const qaDiscriminates = realScore !== null && controlScore !== null && realScore - controlScore >= 10;
    const costOk = realCostUsd <= cap.maxUsdPerRun;
    const costReal = !LIVE || usageCostPresent;
    log(`image           : ${img.ok ? "✓ " : "✗ "}${img.detail}`);
    log(`qa discriminates: ${qaDiscriminates ? "✓ real >> control" : `✗ real=${realScore} control=${controlScore} (default-pass?)`}`);
    log(`pii on wire     : ${piiAnywhere.length ? "✗ LEAK: " + piiAnywhere.join(",") : "✓ none"}`);
    log(`cost            : $${realCostUsd.toFixed(4)} (${usageCostPresent ? "from usage.cost" : "ESTIMATE — usage.cost absent"}) cap $${cap.maxUsdPerRun.toFixed(2)}`);
    fail =
      (LIVE && slugDrift.length > 0) ||
      !img.ok ||
      !qaDiscriminates ||
      piiAnywhere.length > 0 ||
      !costOk ||
      !costReal ||
      !capBites ||
      secretLeak;
    if (LIVE && !costReal) log("cost            : ✗ usage.cost absent on a LIVE call — real spend UNVERIFIED (estimate fired).");
  }

  log("─────────────────────────────────────────────────────────────");
  log(`VERDICT         : ${fail ? "✗ FAIL" : "✓ PASS"}`);
  if (LIVE && !fail) log("reminder        : P7 — adversarially re-verify this PASS (re-read captured responseBody, confirm a real non-default score + a real image) before flipping the Reality Ledger.");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("✗ smoke harness crashed:", e?.message ?? e);
  process.exit(2);
});
