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
}

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
      // F2 (T4): the captured FuFire RESPONSE is currently echoed raw below.
      // server/services/fufireResponseInterpreter.ts is the trust-boundary
      // primitive that maps a real response → prompt variables (no invented
      // data); it is NOT yet wired here (Sprint-4 deferred, integration-fake).
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
           // F2 (T4): this raw response is the input the response interpreter
           // (server/services/fufireResponseInterpreter.ts) is designed to map
           // into prompt variables under the "no invented data" trust boundary.
           // It is NOT yet wired in (Sprint-4 deferred) — see the breadcrumb above.
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

    return {
       input,
       normalizedBirthPayload,
       requests,
       responses,
       warnings,
       gatewayIssues: issues,
       readinessStatus: 'READY'
    };
  }
}
