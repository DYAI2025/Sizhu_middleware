import { fufireDataConfig } from '../../src/lib/apiConnections/dataRequestConfig';
import { GatewayIssue } from '../../src/lib/apiConnections/types';
import {
  ALLOWED_FUFIRE_OPERATIONS,
  isAllowedFuFireOperation,
  collectRequestedOperations,
} from './fufireOperations';
import {
  buildChronometryRequest,
  buildBaziRequest,
  buildBaziTraceRequest,
  buildWuxingRequest,
  type NormalizedBirthInput,
} from './fufireRequestBuilders';
import {
  FUFIRE_STANDARDS,
  FUFIRE_BOUNDARIES,
  FUFIRE_AMBIGUOUS_TIME,
  FUFIRE_NONEXISTENT_TIME,
  type FufireStandard,
  type FufireBoundary,
  type FufireAmbiguousTime,
  type FufireNonexistentTime,
} from '../contracts/fufireContract';
import { normalizeBirthInputWithWarnings } from './birthInputNormalizer';
import {
  resolvePromptVariables,
  interpretFufireResponse,
  type PromptVariables,
} from './fufireResponseInterpreter';

/** L2 cap: the maximum upstream error-body length surfaced in a gateway issue. */
const MAX_UPSTREAM_ERROR_CHARS = 500;

/**
 * L3 — typed boundary input for {@link FuFireDataService.executeTestRun}.
 * This is the SANITIZED test-run body (steering fields already stripped at the
 * route via `sanitizeTestRunBody`). Every field is optional + untrusted; the
 * service validates required coordinates/timezone before any dispatch.
 */
export interface FuFireTestRunInput {
  birthDate?: string;
  birthTime?: string;
  birthTimeKnown?: boolean;
  /** Manual location fields (no geocoder this iteration — both required or none). */
  manualLat?: number;
  manualLon?: number;
  manualTimezone?: string;
  standard?: FufireStandard | string;
  boundary?: FufireBoundary | string;
  ambiguousTime?: FufireAmbiguousTime | string;
  nonexistentTime?: FufireNonexistentTime | string;
  calendarPolicy?: string;
  /**
   * Active render locale; selects the (paired) animal source in the response
   * interpreter (`de` → pillars.year.tier, `en` → chinese.year.animal). Defaults
   * to 'en' when absent (matching the interpreter's own default — any non-'de'
   * selects the en source). Never mixes sources within a render.
   */
  locale?: string;
  /** Operations may arrive as an array OR a single `operation` field (L4). */
  requestedOperations?: unknown;
  operation?: unknown;
  [key: string]: unknown;
}

/** L3 — typed boundary result. */
export interface FuFireTestRunResult {
  input: FuFireTestRunInput;
  normalizedBirthPayload: Record<string, unknown>;
  requests: Array<{ operation: string; body: unknown }>;
  responses: Array<{ operation: string; data?: unknown; error?: string }>;
  warnings: string[];
  gatewayIssues: GatewayIssue[];
  readinessStatus: 'READY' | 'NOT_READY';
  /**
   * REQ-F-002 / REQ-F-003 (Task T9) — prompt variables MAPPED from the real
   * FuFire bazi + wuxing responses by {@link resolvePromptVariables} (the
   * trust-boundary "no invented data" interpreter). ADDITIVE: the raw
   * {@link FuFireTestRunResult.responses} array is untouched. A variable whose
   * declared source is absent (or, for `dominant_element`, computed for the wrong
   * location) is left UNDEFINED — never guessed — and the block is recorded in
   * {@link promptVariableIssues}. Absent on early returns that never reach the
   * fetch loop (NO_GEOCODER / disabled / no-key).
   */
  promptVariables?: PromptVariables;
  /**
   * Greppable issues from the response interpreter; each absent/blocked
   * prompt-variable source pushes one entry carrying the literal
   * `PROMPT_VARIABLE_SOURCE_MISSING` token (REQ-F-002 / AC-F-002b/f).
   */
  promptVariableIssues?: string[];
  /**
   * REQ-F-002 (Task FX3) — provider-declared caveats surfaced VERBATIM from each
   * successful response by {@link interpretFufireResponse}, the trust-boundary
   * caveat reader (AC-F-002e / AC-F-003c). The day-pillar `anchor_verification`
   * status (bazi) is carried through here without ever being relabeled; deferred
   * ops (bazi_trace / chronometry) carry their render-block issue. ADDITIVE — the
   * raw {@link FuFireTestRunResult.responses} array is untouched. Absent on early
   * returns that never reach the fetch loop.
   */
  responseInterpretation?: Array<{
    operation: string;
    verified: boolean;
    caveats: string[];
    issues: string[];
    note: string;
  }>;
}

/**
 * Internal op-name → authoritative contract op-name for the interpreter. The
 * service uses camelCase internal names (`baziTrace`); interpretFufireResponse's
 * deferred set + branches key on the contract names (`bazi_trace`). Mapping here
 * keeps the interpreter's deferred-op render-block correct on the live path.
 */
const INTERPRETER_OP_NAME: Record<string, string> = {
  baziTrace: 'bazi_trace',
};

/**
 * Single source of truth for the op-name → outbound config key + body builder.
 *
 * The op NAMES are the same server-owned allowlist enforced at the route
 * boundary ({@link ALLOWED_FUFIRE_OPERATIONS} in `fufireOperations.ts`); this
 * map only adds the per-op projection (which config entry resolves the path,
 * and which T3 builder shapes the body). It carries NO URL / header / secret —
 * those come exclusively from `fufireDataConfig` / env (T1 SSRF fix).
 */
const FUFIRE_OPERATION_DISPATCH: Record<
  (typeof ALLOWED_FUFIRE_OPERATIONS)[number],
  {
    configKey: keyof typeof fufireDataConfig.operations;
    build: (input: NormalizedBirthInput) => Record<string, unknown>;
  }
> = {
  chronometry: { configKey: 'chronometry_resolve', build: buildChronometryRequest },
  bazi: { configKey: 'bazi', build: buildBaziRequest },
  baziTrace: { configKey: 'bazi_trace', build: buildBaziTraceRequest },
  wuxing: { configKey: 'wuxing', build: buildWuxingRequest },
};

/** Coerce an untrusted value to a contract enum, else undefined (no invented value). */
function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export class FuFireDataService {
  async executeTestRun(input: FuFireTestRunInput): Promise<FuFireTestRunResult> {
    const issues: GatewayIssue[] = [];

    // Project the caller's birth fields into the normalized builder input.
    // `manual*` are the test-run's manual location fields (no geocoder in this
    // iteration). The normalizer owns the default-noon rule + its warning, so
    // there is no duplicated default-noon logic here anymore.
    const rawNormalized: NormalizedBirthInput = {
      birthDate: input.birthDate ?? '',
      birthTime: input.birthTime,
      birthTimeKnown: input.birthTimeKnown !== false ? Boolean(input.birthTime) : false,
      lat: input.manualLat,
      lon: input.manualLon,
      timezone: input.manualTimezone,
      // Coerce untrusted enum-shaped fields to the contract enums (or drop) so a
      // bad value never reaches the builder as an invented enum.
      standard: asEnum(input.standard, FUFIRE_STANDARDS),
      boundary: asEnum(input.boundary, FUFIRE_BOUNDARIES),
      ambiguousTime: asEnum(input.ambiguousTime, FUFIRE_AMBIGUOUS_TIME),
      nonexistentTime: asEnum(input.nonexistentTime, FUFIRE_NONEXISTENT_TIME),
      calendarPolicy: input.calendarPolicy,
    };
    const { normalized: normalizedBirthInput, warnings } = normalizeBirthInputWithWarnings(rawNormalized);

    // Echo a normalized payload for the run output (back-compat with prior shape).
    const normalizedBirthPayload = {
      ...input,
      birthTime: normalizedBirthInput.birthTime,
      birthTimeKnown: normalizedBirthInput.birthTimeKnown,
      ...(normalizedBirthInput.birthTimeSource
        ? { birthTimeSource: normalizedBirthInput.birthTimeSource }
        : {}),
    };

    // FP1 (F1): no geocoder this iteration, so the caller MUST supply BOTH manual
    // coordinates. Reject when EITHER is missing (`||`, not `&&`) — a half-coord
    // request previously slipped through and reached the builder, which would emit
    // a malformed `{ lat | lon: undefined }` body / attempt an outbound call.
    // Validate they are finite numbers too, so a non-numeric coordinate is caught
    // here as the controlled gateway issue rather than later in a builder throw.
    const latReady =
      typeof input.manualLat === 'number' && Number.isFinite(input.manualLat);
    const lonReady =
      typeof input.manualLon === 'number' && Number.isFinite(input.manualLon);
    if (!latReady || !lonReady) {
      // In this iteration we do not have a real geocoder configured
      return {
        input,
        normalizedBirthPayload,
        requests: [],
        responses: [],
        warnings,
        gatewayIssues: [{
          id: crypto.randomUUID(),
          providerKind: 'data_request',
          providerName: 'FuFire',
          operation: 'geocoder',
          errorCode: 'NO_GEOCODER_CONFIGURED',
          message: 'Manual Latitude/Longitude required, no geocoder configured.',
          retryable: false,
          retryCount: 0,
          severity: 'minor',
          status: 'open',
          // A field NAMED sanitizedRequestMetadata must not carry raw `input` (which
          // holds birth PII: birthDate/time, manual lat/lon). Mirror the POD _failure
          // fix (commit a113746) + the other issues here ({}). Which coord was missing
          // is the only non-PII diagnostic worth keeping.
          sanitizedRequestMetadata: { latProvided: latReady, lonProvided: lonReady },
          sanitizedResponseMetadata: {},
          createdAt: new Date().toISOString()
        } as GatewayIssue],
        readinessStatus: 'NOT_READY'
      };
    }

    // L4: single source for the requested ops. The route accepts either an
    // array (`requestedOperations`) OR a single `operation`; honor both here via
    // collectRequestedOperations() so a singular `operation` is NOT silently
    // ignored by the service (it is de-duplicated + still allowlist-checked below).
    const requestedOps = collectRequestedOperations(input);
    const requests: FuFireTestRunResult['requests'] = [];
    const responses: FuFireTestRunResult['responses'] = [];

    const config = fufireDataConfig;
    if (!config.enabled) {
         issues.push({
          id: crypto.randomUUID(),
          providerKind: 'data_request',
          providerName: 'FuFire',
          operation: 'all',
          errorCode: 'FUFIRE_ENDPOINT_DISABLED',
          message: 'FuFire endpoint is disabled by configuration.',
          retryable: false,
          retryCount: 0,
          severity: 'minor',
          status: 'open',
          sanitizedRequestMetadata: {},
          sanitizedResponseMetadata: {},
          createdAt: new Date().toISOString()
        } as GatewayIssue);
        return { input, normalizedBirthPayload, requests, responses, warnings, gatewayIssues: issues, readinessStatus: 'NOT_READY' };
    }

    // L1: read the key SOLELY from the configured secret reference — no bare
    // `|| process.env.FUFIRE_API_KEY` fallback. secretRef defaults to
    // SECRET_REF_FUFIRE_API_KEY (dataRequestConfig), so there is exactly one
    // resolved source for the outbound key.
    const secretRef = config.secretRef || 'FUFIRE_API_KEY';
    const apiKey = process.env[secretRef];
    if (!apiKey) {
      issues.push({
        id: crypto.randomUUID(),
        providerKind: 'data_request',
        providerName: 'FuFire',
        operation: 'all',
        errorCode: 'NO_FUFIRE_API_KEY_CONFIGURED',
        message: `Missing secret for ${secretRef}`,
        retryable: false,
        retryCount: 0,
        severity: 'major',
        status: 'open',
        sanitizedRequestMetadata: {},
        sanitizedResponseMetadata: {},
        createdAt: new Date().toISOString()
      });
      return { input, normalizedBirthPayload, requests, responses, warnings, gatewayIssues: issues, readinessStatus: 'NOT_READY' };
    }

    if (!config.baseUrl) {
       issues.push({
        id: crypto.randomUUID(),
        providerKind: 'data_request',
        providerName: 'FuFire',
        operation: 'all',
        errorCode: 'NO_FUFIRE_BASE_URL_CONFIGURED',
        message: 'Base URL missing',
        retryable: false,
        retryCount: 0,
        severity: 'major',
        status: 'open',
        sanitizedRequestMetadata: {},
        sanitizedResponseMetadata: {},
        createdAt: new Date().toISOString()
      });
      return { input, normalizedBirthPayload, requests, responses, warnings, gatewayIssues: issues, readinessStatus: 'NOT_READY' };
    }

    for (const op of requestedOps) {
      // Single source of truth: only the server-owned allowlist may dispatch.
      // (The route boundary already rejects disallowed ops; this is the
      // defense-in-depth guarantee that the service itself never builds/fetches
      // for an op outside the allowlist.)
      if (!isAllowedFuFireOperation(op)) {
        issues.push({
          id: crypto.randomUUID(),
          providerKind: 'data_request',
          providerName: 'FuFire',
          operation: op,
          errorCode: 'FUFIRE_OPERATION_NOT_ALLOWED',
          message: `Operation not allowed: ${op}`,
          retryable: false,
          retryCount: 0,
          severity: 'major',
          status: 'open',
          sanitizedRequestMetadata: {},
          sanitizedResponseMetadata: {},
          createdAt: new Date().toISOString()
        } as GatewayIssue);
        responses.push({ operation: op, error: 'FUFIRE_OPERATION_NOT_ALLOWED' });
        continue;
      }

      const dispatch = FUFIRE_OPERATION_DISPATCH[op];
      const operationCfg = config.operations[dispatch.configKey];
      if (!operationCfg) continue;

      // F1: chronometry additionally REQUIRES a timezone (the only nested-shape
      // endpoint). Guarantee its presence HERE so the builder never throws and no
      // malformed `{ timezone: undefined }` body is ever produced; surface a
      // controlled gateway issue instead. (lat/lon are already guaranteed by the
      // geocoder gate above.)
      if (
        op === 'chronometry' &&
        (typeof normalizedBirthInput.timezone !== 'string' ||
          normalizedBirthInput.timezone.trim() === '')
      ) {
        issues.push({
          id: crypto.randomUUID(),
          providerKind: 'data_request',
          providerName: 'FuFire',
          operation: op,
          errorCode: 'NO_GEOCODER_CONFIGURED',
          message: 'Manual timezone required for chronometry, no geocoder configured.',
          retryable: false,
          retryCount: 0,
          severity: 'minor',
          status: 'open',
          sanitizedRequestMetadata: {},
          sanitizedResponseMetadata: {},
          createdAt: new Date().toISOString()
        } as GatewayIssue);
        responses.push({ operation: op, error: 'NO_GEOCODER_CONFIGURED' });
        continue;
      }

      // Body is shaped ONLY by the T3 builders from normalized birth input.
      // No URL / path / header / secret is taken from the request body (T1).
      // The raw FuFire RESPONSE collected below is mapped into prompt variables
      // AFTER the loop by resolvePromptVariables (T9 — the trust-boundary "no
      // invented data" interpreter is now wired into this live execute path).
      const reqBody = dispatch.build(normalizedBirthInput);

      requests.push({ operation: op, body: reqBody });

      try {
        const fufireUrl = `${config.baseUrl.replace(/\/$/, '')}${operationCfg.path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

        const response = await fetch(fufireUrl, {
          method: operationCfg.method,
          headers: {
            "Content-Type": "application/json",
            [config.authHeaderName || "X-API-Key"]: apiKey
          },
          body: JSON.stringify(reqBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
           let errorCode = 'FUFIRE_INVALID_RESPONSE';
           if (response.status === 401) errorCode = 'FUFIRE_UNAUTHORIZED';
           else if (response.status === 429) errorCode = 'FUFIRE_RATE_LIMITED';
           else if (op === 'chronometry') errorCode = 'FUFIRE_CHRONOMETRY_FAILED';
           else if (op === 'bazi' || op === 'baziTrace') errorCode = 'FUFIRE_BAZI_FAILED';
           else if (op === 'wuxing') errorCode = 'FUFIRE_WUXING_FAILED';

           // L2: bound the raw upstream error body so an arbitrarily large /
           // attacker-influenced response cannot bloat the gateway issue. The
           // controlled `errorCode` above is the client-facing signal; the capped
           // upstream text is kept only as a diagnostic tail.
           const rawUpstream = await response.text();
           const upstreamTail =
             rawUpstream.length > MAX_UPSTREAM_ERROR_CHARS
               ? `${rawUpstream.slice(0, MAX_UPSTREAM_ERROR_CHARS)}… [truncated ${rawUpstream.length - MAX_UPSTREAM_ERROR_CHARS} chars]`
               : rawUpstream;

           issues.push({
            id: crypto.randomUUID(),
            providerKind: 'data_request',
            providerName: 'FuFire',
            operation: op,
            httpStatus: response.status,
            errorCode,
            message: `${errorCode} (HTTP ${response.status}): ${upstreamTail}`,
            retryable: response.status >= 500 || response.status === 429,
            retryCount: config.retryCount,
            severity: 'major',
            status: 'open',
            sanitizedRequestMetadata: { body: reqBody },
            sanitizedResponseMetadata: { status: response.status },
            createdAt: new Date().toISOString()
           });
           responses.push({ operation: op, error: errorCode });
        } else {
           // This raw response is retained as-is in `responses` (additive) AND
           // is the input the response interpreter maps into prompt variables
           // after the loop (T9 — resolvePromptVariables, "no invented data").
           const data = await response.json();
           responses.push({ operation: op, data });
        }
      } catch (err: any) {
        let errorCode = 'FUFIRE_INVALID_RESPONSE';
        if (err.name === 'AbortError') errorCode = 'FUFIRE_TIMEOUT';
        issues.push({
          id: crypto.randomUUID(),
          providerKind: 'data_request',
          providerName: 'FuFire',
          operation: op,
          errorCode,
          message: err.message,
          retryable: true,
          retryCount: config.retryCount,
          severity: 'major',
          status: 'open',
          sanitizedRequestMetadata: { body: reqBody },
          sanitizedResponseMetadata: {},
          createdAt: new Date().toISOString()
        });
        responses.push({ operation: op, error: errorCode });
      }
    }

    // T9 (REQ-F-002 / REQ-F-003): WIRE the response interpreter into the live
    // execute path. After the fetch loop, map the REAL bazi + wuxing response
    // bodies into the small, source-traced prompt-variable set via
    // resolvePromptVariables — the trust-boundary "no invented data" primitive.
    // This is ADDITIVE: `responses` (the raw payloads) is left exactly as-is.
    //
    //  - bazi/wuxing data = the SUCCESSFUL op's `data` (undefined if the op was
    //    not requested, or failed — in which case the resolver surfaces a
    //    PROMPT_VARIABLE_SOURCE_MISSING issue rather than inventing a value).
    //  - locale picks the (paired) animal source; default 'en' when unspecified
    //    (the resolver itself treats any non-'de' value as 'en').
    //  - subject = the REAL caller coordinates (validated finite above): the
    //    resolver guards `dominant_element` against the wuxing 0,0 trap by
    //    comparing the response's source coords to THESE subject coords.
    //  - deferred ops (baziTrace / chronometry) are deliberately NOT mapped:
    //    resolvePromptVariables only reads bazi + wuxing, so a deferred op can
    //    never contribute a (verified) prompt variable.
    const findOpData = (operation: string): unknown =>
      responses.find((r) => r.operation === operation && 'data' in r)?.data;

    const resolved = resolvePromptVariables({
      bazi: findOpData('bazi'),
      wuxing: findOpData('wuxing'),
      // Default to 'en' when no locale is supplied — this matches the
      // interpreter's own default (any non-'de' selects the en animal source),
      // so an unspecified-locale render is deterministic and never a guess.
      locale: typeof input.locale === 'string' ? input.locale : 'en',
      // Both coords are guaranteed finite numbers here by the latReady/lonReady
      // guard above (which returns early otherwise); the resolver re-checks with
      // Number.isFinite, so this is safe even if the guard ever changes.
      subject: { lat: input.manualLat as number, lon: input.manualLon as number },
    });

    // FX3 (REQ-F-002 / AC-F-002e): surface the provider-declared caveats on the
    // LIVE path. interpretFufireResponse reads each SUCCESSFUL op's response and
    // carries the day-pillar `anchor_verification` caveat (bazi) verbatim — never
    // relabeling "unverified" as verified. ADDITIVE: `responses` is untouched. This
    // gives interpretFufireResponse its first production caller (closing the
    // lens-4 finding that the caveat half had zero prod importers).
    const responseInterpretation = responses
      .filter((r) => 'data' in r && r.data !== undefined)
      .map((r) => {
        const opName = INTERPRETER_OP_NAME[r.operation] ?? r.operation;
        const i = interpretFufireResponse({ operation: opName, response: r.data });
        return {
          operation: r.operation,
          verified: i.verified,
          caveats: i.caveats,
          issues: i.issues,
          note: i.note,
        };
      });

    return {
       input,
       normalizedBirthPayload,
       requests,
       responses,
       warnings,
       gatewayIssues: issues,
       readinessStatus: 'READY',
       promptVariables: resolved.variables,
       promptVariableIssues: resolved.issues,
       responseInterpretation,
    };
  }
}
