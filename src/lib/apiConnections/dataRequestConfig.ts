import { ApiConnection, ApiOperation } from './types';

export interface DataRequestConfig extends ApiConnection {
  providerKind: 'data_request';
  operations: Record<string, ApiOperation>;
}

export const fufireDataConfig: DataRequestConfig = {
  providerKind: 'data_request',
  providerName: 'FuFire',
  baseUrl: process.env.FUFIRE_BASE_URL || 'https://api.fufire.space',
  authMode: 'x_api_key',
  authHeaderName: process.env.FUFIRE_AUTH_HEADER_NAME || 'X-API-Key',
  secretRef: process.env.FUFIRE_API_KEY_SECRET_REF || 'SECRET_REF_FUFIRE_API_KEY',
  enabled: true,
  timeoutMs: Number(process.env.FUFIRE_TIMEOUT_MS || 15000),
  retryCount: Number(process.env.FUFIRE_RETRY_COUNT || 1),
  operations: {
    chronometry_resolve: { key: 'chronometry_resolve', method: 'POST', path: '/v1/chronometry/resolve' },
    bazi: { key: 'bazi', method: 'POST', path: '/v1/calculate/bazi' },
    bazi_trace: { key: 'bazi_trace', method: 'POST', path: '/v1/calculate/bazi/trace' },
    wuxing: { key: 'wuxing', method: 'POST', path: '/v1/calculate/wuxing' },
    fusion: { key: 'fusion', method: 'POST', path: '/v1/calculate/fusion' }
  }
};
