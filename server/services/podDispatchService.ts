import { createHash } from 'crypto';
import { GatewayIssue } from '../../src/lib/apiConnections/types';
import { getGelatoFulfillmentConfig } from '../../src/lib/apiConnections/fulfillmentConfig';
import { getAppMode } from '../../src/lib/app/appMode';

/**
 * Derive a DETERMINISTIC idempotency key for a logical POD order.
 *
 * AC-O-002c: the key must be the same across retries of the SAME logical order
 * (same workflowRunId + same artifact.id) so a retried dispatch does NOT create
 * a duplicate Gelato order / duplicate charge. It MUST therefore be a pure
 * function of stable order identity — never Date.now() / crypto.randomUUID() /
 * Math.random(), which would defeat idempotency.
 *
 * It is a SHA-256 hash, so it embeds no API key and no raw customer PII (the
 * inputs are only the run id and artifact id — order identity, not personal
 * data). Safe to log.
 */
export function deriveIdempotencyKey(workflowRunId: string, artifactId?: string): string {
  // artifactId is normally present at the would-dispatch point (guarded by the
  // artifact gate); fall back to an empty segment so the function is total.
  return createHash('sha256')
    .update(`${workflowRunId}:${artifactId ?? ''}`)
    .digest('hex');
}

export class PodDispatchService {
  async dispatchArtifact(workflowRunId: string, input: any, artifact: any): Promise<any> {
    // FP4 (F3): read the config at CALL time so a runtime env change
    // (POD_ENABLED / POD_DISPATCH_MODE / POD_BASE_URL) actually takes effect.
    // The prior import-time-frozen const made such a change a silent no-op.
    const config = getGelatoFulfillmentConfig();
    const isMock = getAppMode() === 'DEMO_LOCAL';

    if (isMock) {
       return {
         ok: true,
         dispatchId: `MOCK-ORDER-${Date.now()}`,
         status: 'mock_success'
       };
    }

    if (!config.enabled) {
      return this._failure('POD_PROVIDER_DISABLED', 'Fulfillment provider is not enabled.', input);
    }

    if (config.dispatchMode === 'disabled') {
      return this._failure('POD_DISPATCH_DISABLED', 'Dispatch mode is currently disabled.', input);
    }

    if (!artifact) {
      return this._failure('NO_ACCEPTED_ARTIFACT_FOR_DISPATCH', 'There is no approved final artifact to dispatch.', input);
    }

    // Usually we would map the product here
    if (config.productMappings.length === 0) {
      return this._failure('NO_POD_PRODUCT_UID_MAPPING', 'Missing product mapping configuration.', input);
    }

    const apiKey = process.env[config.secretRef || ''];
    if (!apiKey) {
      return this._failure('NO_POD_API_KEY_CONFIGURED', `Missing secret for ${config.secretRef}.`, input);
    }

    // ── Would-dispatch point (AC-O-002c) ─────────────────────────────────────
    // All safety gates have passed (enabled, dispatch mode, artifact present,
    // product mapping, API key). This is exactly where a REAL network POST to
    // Gelato would begin, so the idempotency key MUST be generated here — before
    // any real dispatch work — even though the dispatch itself is blocked below
    // (MISSING_POD_CONTRACT, the safe adapter boundary). The future real adapter
    // will send this value in the `config.idempotencyHeaderName` ('Idempotency-Key')
    // header so a retried POST de-duplicates to the same Gelato order.
    const idempotencyKey = deriveIdempotencyKey(workflowRunId, artifact?.id);

    // Log it SANITIZED: key + order identity ONLY. Never the apiKey, never raw
    // input / customer PII (the key is a hash, so it carries no secret/PII).
    console.info('[PodDispatch] idempotency key generated (no dispatch yet)', {
      idempotencyKey,
      workflowRunId,
      artifactId: artifact?.id,
      idempotencyHeaderName: config.idempotencyHeaderName,
    });

    // In iteration 5, if we don't have the explicit request schema for Gelato, we
    // return a contract missing error. The idempotency key is attached to the
    // result + its gatewayIssue's sanitized metadata so it survives across retries,
    // but the result stays ok:false (no fake success).
    return this._missingContractWithIdempotency(workflowRunId, idempotencyKey, artifact?.id);
  }

  /**
   * The MISSING_POD_CONTRACT result at the would-dispatch point, carrying the
   * deterministic idempotency key on the top-level result AND (identically) on
   * gatewayIssue.sanitizedRequestMetadata. Sanitized metadata holds ONLY order
   * identity + the key — no raw input/PII, no secret.
   */
  private _missingContractWithIdempotency(workflowRunId: string, idempotencyKey: string, artifactId?: string) {
    const errorCode = 'MISSING_POD_CONTRACT';
    const message = 'Gelato order creation contract schema is currently unknown. Safe adapter boundary engaged.';
    const issue: GatewayIssue = {
      id: crypto.randomUUID(),
      providerKind: 'fulfillment',
      providerName: 'Gelato_Proxy',
      operation: 'create_order',
      errorCode,
      message,
      retryable: false,
      retryCount: 0,
      severity: 'critical',
      status: 'open',
      // Sanitized: order identity + idempotency key ONLY (no raw input/PII, no secret).
      sanitizedRequestMetadata: { workflowRunId, artifactId, idempotencyKey },
      sanitizedResponseMetadata: {},
      createdAt: new Date().toISOString(),
    };
    return {
      ok: false,
      error_code: errorCode,
      message,
      idempotencyKey,
      gatewayIssue: issue,
    };
  }

  private _failure(errorCode: string, message: string, input: any) {
     const issue: GatewayIssue = {
        id: crypto.randomUUID(),
        providerKind: 'fulfillment',
        providerName: 'Gelato_Proxy',
        operation: 'create_order',
        errorCode,
        message,
        retryable: false,
        retryCount: 0,
        severity: 'critical',
        status: 'open',
        sanitizedRequestMetadata: { input },
        sanitizedResponseMetadata: {},
        createdAt: new Date().toISOString()
     };
     return {
        ok: false,
        error_code: errorCode,
        message,
        gatewayIssue: issue
     };
  }
}
