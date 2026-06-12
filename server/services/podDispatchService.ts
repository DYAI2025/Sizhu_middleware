import { GatewayIssue } from '../../src/lib/apiConnections/types';
import { gelatoFulfillmentConfig } from '../../src/lib/apiConnections/fulfillmentConfig';
import { getAppMode } from '../../src/lib/app/appMode';

export class PodDispatchService {
  async dispatchArtifact(workflowRunId: string, input: any, artifact: any): Promise<any> {
    const config = gelatoFulfillmentConfig;
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

    // In iteration 5, if we don't have the explicit request schema for Gelato, we return a contract missing error.
    return this._failure('MISSING_POD_CONTRACT', 'Gelato order creation contract schema is currently unknown. Safe adapter boundary engaged.', input);
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
