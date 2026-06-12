/**
 * Bazzi Middleware Platform - Mock POD Provider (Gelato API replica)
 */

import { PodProvider } from '../interfaces';
import { ImageArtifact, PodProviderConfig } from '../../../types';

export class MockPodProvider implements PodProvider {
  async submitOrder(
    workflowRunId: string,
    orderNumber: string,
    productId: string,
    artifact: ImageArtifact,
    config: PodProviderConfig
  ): Promise<{
    success: boolean;
    podOrderId: string;
    dispatchMode: 'disabled' | 'draft' | 'order';
    estimatedDelivery: string;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    
    // Safety check block: Ensure status is passed or manually approved.
    if (artifact.status !== 'accepted') {
      throw new Error(`Fulfillment Rejection: Cannot transmit artifact ${artifact.id} with status "${artifact.status}". Only QA_PASSED ("accepted") candidates are dispatchable.`);
    }

    return {
      success: true,
      podOrderId: `G-ORD-${orderNumber}-${Math.floor(100000 + Math.random() * 900000)}`,
      dispatchMode: config.dispatchMode || 'draft',
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString()
    };
  }
}
export { MockPodProvider as MockPrintProvider };
