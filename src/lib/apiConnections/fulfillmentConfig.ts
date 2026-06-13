import { ApiConnection, ApiOperation } from './types';

export interface FulfillmentProductMapping {
  shopProductId: string;
  externalVariantId: string;
  podProductUid: string;
  podVariantUid?: string;
  printFileSlot: string; // e.g. front, back
  shippingMethodUid?: string;
}

export interface FulfillmentConfig extends ApiConnection {
  providerKind: 'fulfillment';
  dispatchMode: 'disabled' | 'draft' | 'order';
  idempotencyHeaderName: string;
  operations: Record<string, ApiOperation>;
  productMappings: FulfillmentProductMapping[];
}

/**
 * Build the Gelato fulfillment config from the CURRENT process env (FP4 / F3).
 *
 * Read this via {@link getGelatoFulfillmentConfig} at CALL time. The env-derived
 * fields (`enabled`, `dispatchMode`, `baseUrl`) are evaluated on each call, so a
 * runtime env change (e.g. `POD_ENABLED=false` set per-request in a test or by a
 * config reload) actually takes effect — the prior import-time-frozen const made
 * such a change a silent no-op. The const export below is retained for
 * back-compat with any consumer that read the frozen value.
 */
export function getGelatoFulfillmentConfig(): FulfillmentConfig {
  return {
    providerKind: 'fulfillment',
    providerName: 'Gelato_Proxy',
    baseUrl: process.env.POD_BASE_URL || 'https://api.gelato.com', // Typically not directly to gelato but safe starting place
    authMode: 'api_key_header',
    authHeaderName: 'X-API-KEY',
    secretRef: 'SECRET_REF_GELATO_API_KEY', // Intentionally empty/missing so we don't accidentally send
    enabled: process.env.POD_ENABLED === 'true',
    dispatchMode: (process.env.POD_DISPATCH_MODE as FulfillmentConfig['dispatchMode']) || 'disabled',
    timeoutMs: 30000,
    retryCount: 0, // No retries on orders
    idempotencyHeaderName: 'Idempotency-Key',
    operations: {
      create_draft: { key: 'create_draft', method: 'POST', path: '/v2/drafts' },
      create_order: { key: 'create_order', method: 'POST', path: '/v4/orders' },
      get_order_status: { key: 'get_order_status', method: 'GET', path: '/v4/orders/:id' }
    },
    productMappings: []
  };
}

/**
 * Import-time snapshot, retained for BACK-COMPAT only. Prefer
 * {@link getGelatoFulfillmentConfig} for runtime-correct env evaluation — this
 * const freezes whatever env was present when the module first loaded.
 */
export const gelatoFulfillmentConfig: FulfillmentConfig = getGelatoFulfillmentConfig();
