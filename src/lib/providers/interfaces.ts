import { ImageArtifact, PodProviderConfig } from '../../types';

export interface ImageGenerationProvider {
  /**
   * Generates a swarm of images based on dynamic astro-prompts.
   */
  generate(
    prompt: string,
    numCandidates: number,
    format: 'png' | 'jpeg',
    quality: 'standard' | 'hd',
    model: string,
    secretRef: string,
    customerData: any
  ): Promise<{
    candidateIndex: number;
    storagePath: string;
    metadata: {
      promptUsed: string;
      model: string;
      provider: string;
      quality: string;
      resolution: string;
      // Real per-candidate $ cost (usage.cost / numCandidates), surfaced for the
      // cost-cap enforcer + run telemetry (REQ-LGQ-006). Optional for the mock path.
      usdCost?: number;
    };
  }[]>;
}

export interface QualityGateProvider {
  /**
   * Screen candidates using visual analysis against specific quality controls.
   */
  evaluate(
    candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
    minScore: number,
    qaPrompt: string,
    secretRef: string,
    model: string,
    resolvedVariables: any,
    iteration: number
  ): Promise<{
    candidateIndex: number;
    score: number;
    status: 'accepted' | 'rejected' | 'not_selected';
    reason: string;
    detailedJson: string;
  }[]>;
}

export interface PersonalizationProvider {
  /**
   * Translates client inputs (name, date, time) into distinct star systems and auras.
   */
  calculate(
    name: string,
    birthDate: string,
    birthTime: string,
    birthTimeKnown: boolean,
    birthPlace: string,
    birthTimeFallback: {
      birth_time: string;
      birth_time_known: boolean;
      birth_time_source: string;
    }
  ): Promise<{
    animal: string;
    element: string;
    birth_year: number;
    dominant_element: string;
    resolvedTime: string;
    resolvedTimeSource: string;
  }>;
}

export interface PodProvider {
  /**
   * Transmits accepted customized graphic canvas directly to the POD fulfillment pipeline.
   */
  submitOrder(
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
  }>;
}

export interface MailProvider {
  /**
   * dispatches automated notifications when the generator reaches non-recoverable fails
   */
  sendEscalationMail(
    emailTemplate: string,
    variables: {
      order_number: string;
      product_id: string;
      product_title: string;
      template_name: string;
      iteration_count: string;
      min_score: string;
      rejection_reasons: string;
      failed_candidate_images: string;
      workflow_run_url: string;
    }
  ): Promise<{
    success: boolean;
    messageId: string;
  }>;
}
