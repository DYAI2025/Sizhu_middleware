import { fufireDataConfig } from '../../src/lib/apiConnections/dataRequestConfig';
import { GatewayIssue } from '../../src/lib/apiConnections/types';
import { ALLOWED_FUFIRE_OPERATIONS, isAllowedFuFireOperation } from './fufireOperations';
import {
  buildChronometryRequest,
  buildBaziRequest,
  buildBaziTraceRequest,
  buildWuxingRequest,
  type NormalizedBirthInput,
} from './fufireRequestBuilders';
import { normalizeBirthInputWithWarnings } from './birthInputNormalizer';

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
  { configKey: keyof typeof fufireDataConfig.operations; build: (input: NormalizedBirthInput) => unknown }
> = {
  chronometry: { configKey: 'chronometry_resolve', build: buildChronometryRequest },
  bazi: { configKey: 'bazi', build: buildBaziRequest },
  baziTrace: { configKey: 'bazi_trace', build: buildBaziTraceRequest },
  wuxing: { configKey: 'wuxing', build: buildWuxingRequest },
};

export class FuFireDataService {
  async executeTestRun(input: any): Promise<any> {
    const issues: GatewayIssue[] = [];

    // Project the caller's birth fields into the normalized builder input.
    // `manual*` are the test-run's manual location fields (no geocoder in this
    // iteration). The normalizer owns the default-noon rule + its warning, so
    // there is no duplicated default-noon logic here anymore.
    const rawNormalized: NormalizedBirthInput = {
      birthDate: input.birthDate,
      birthTime: input.birthTime,
      birthTimeKnown: input.birthTimeKnown !== false ? Boolean(input.birthTime) : false,
      lat: input.manualLat,
      lon: input.manualLon,
      timezone: input.manualTimezone,
      standard: input.standard,
      boundary: input.boundary,
      ambiguousTime: input.ambiguousTime,
      nonexistentTime: input.nonexistentTime,
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

    // Checking if Lat/Lon mapping exists if no geocoder configured
    if (input.manualLat === undefined && input.manualLon === undefined) {
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
          sanitizedRequestMetadata: { input },
          sanitizedResponseMetadata: {},
          createdAt: new Date().toISOString()
        } as GatewayIssue],
        readinessStatus: 'NOT_READY'
      };
    }

    // Call operations
    const requestedOps = input.requestedOperations || [];
    const requests = [];
    const responses = [];

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

    const apiKey = process.env[config.secretRef || ''] || process.env.FUFIRE_API_KEY;
    if (!apiKey) {
      issues.push({
        id: crypto.randomUUID(),
        providerKind: 'data_request',
        providerName: 'FuFire',
        operation: 'all',
        errorCode: 'NO_FUFIRE_API_KEY_CONFIGURED',
        message: `Missing secret for ${config.secretRef}`,
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

      // Body is shaped ONLY by the T3 builders from normalized birth input.
      // No URL / path / header / secret is taken from the request body (T1).
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

           issues.push({
            id: crypto.randomUUID(),
            providerKind: 'data_request',
            providerName: 'FuFire',
            operation: op,
            httpStatus: response.status,
            errorCode,
            message: await response.text(),
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
