export type ApiProviderKind = 'data_request' | 'fulfillment' | 'storage' | 'qa' | 'generation' | 'mail';

export interface ApiConnection {
  providerKind: ApiProviderKind;
  providerName: string;
  baseUrl: string;
  authMode: 'api_key_header' | 'bearer_token' | 'x_api_key' | 'none';
  authHeaderName?: string;
  secretRef?: string;
  enabled: boolean;
  timeoutMs: number;
  retryCount: number;
  healthStatus?: 'CONFIGURED' | 'FAILED' | 'READY';
}

export interface ApiOperation {
  key: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
}

export interface GatewayIssue {
  id: string;
  workflowRunId?: string;
  providerKind: ApiProviderKind;
  providerName: string;
  operation: string;
  httpStatus?: number;
  errorCode: string;
  message: string;
  retryable: boolean;
  retryCount: number;
  severity: 'minor' | 'major' | 'critical';
  status: 'open' | 'resolved' | 'ignored';
  sanitizedRequestMetadata: any;
  sanitizedResponseMetadata: any;
  createdAt: string;
  resolvedAt?: string;
}
