/**
 * Bazzi Middleware Platform - Escalation and Alert Management Service
 */

import { EscalationEvent, WorkflowRun, ImageArtifact } from '../domain/models';
import { MailProvider } from '../providers/interfaces';

export class EscalationService {
  constructor(private mailProvider: MailProvider) {}

  /**
   * Generates a fully compiled EscalationEvent structure when quality gate iteration thresholds are exceeded.
   */
  async triggerEscalation(
    run: WorkflowRun,
    productId: string,
    productTitle: string,
    templateId: string,
    templateName: string,
    maxIterations: number,
    minScore: number,
    artifacts: ImageArtifact[],
    emailTemplate: string
  ): Promise<EscalationEvent> {
    const rejectionSummaries = artifacts
      .filter(a => a.status === 'rejected')
      .map(a => `Iteration ${a.iteration} Candidate ${a.candidateIndex + 1}: Score ${a.qaScore}/100 - Reason: ${a.rejectionReason}`)
      .join('\n');

    const signedImageLinks = artifacts
      .map(a => `[Staged Image Iteration ${a.iteration} Swarm Candidate ${a.candidateIndex + 1}]: bazzi-staging://${a.id}.svg`)
      .join('\n');

    const runUrl = `https://ais-pre-qdekpcbza6gzl5ntzblhcv-501750026591.europe-west2.run.app/workflow/${run.id}`;

    // Invoke upstream email transmitter
    await this.mailProvider.sendEscalationMail(emailTemplate, {
      order_number: run.orderNumber,
      product_id: productId,
      product_title: productTitle,
      template_name: templateName,
      iteration_count: String(maxIterations),
      min_score: String(minScore),
      rejection_reasons: rejectionSummaries,
      failed_candidate_images: signedImageLinks,
      workflow_run_url: runUrl
    });

    const event: EscalationEvent = {
      id: `esc-ev-${run.id}-${Date.now()}`,
      runId: run.id,
      orderNumber: run.orderNumber,
      productId,
      iterationReached: maxIterations,
      templateId,
      minScore,
      rejectionReasons: rejectionSummaries,
      failedImages: signedImageLinks,
      emailDispatchedTo: 'shop_admin@bazziprint.com',
      createdAt: new Date().toISOString()
    };

    return event;
  }
}
