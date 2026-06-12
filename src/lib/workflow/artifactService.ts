/**
 * Bazzi Middleware Platform - Artifact Lifecycle Management Service
 */

import { ImageArtifact, WorkflowRun } from '../domain/models';

export class ArtifactService {
  /**
   * Transforms raw image generation variants and their LLM evaluation scores into complete persistent ImageArtifact structures.
   * Assures that every generated candidate is accounted for (no visual candidate vanishes silently).
   */
  static createArtifactsFromSwarm(
    run: WorkflowRun,
    productId: string,
    templateId: string,
    iteration: number,
    candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
    evaluations: { candidateIndex: number; score: number; status: 'accepted' | 'rejected' | 'not_selected'; reason: string; detailedJson: string }[]
  ): ImageArtifact[] {
    const artifacts: ImageArtifact[] = [];

    for (let idx = 0; idx < candidates.length; idx++) {
      const candidate = candidates[idx];
      const evaluation = evaluations.find(ev => ev.candidateIndex === candidate.candidateIndex);

      if (evaluation) {
        artifacts.push({
          id: `art-${run.id}-it${iteration}-idx${candidate.candidateIndex}`,
          workflowRunId: run.id,
          orderNumber: run.orderNumber,
          productId,
          templateId,
          iteration,
          candidateIndex: candidate.candidateIndex,
          storagePath: candidate.storagePath,
          status: evaluation.status,
          qaScore: evaluation.score,
          rejectionReason: evaluation.reason,
          qaResultJson: evaluation.detailedJson,
          generatedAt: new Date().toISOString()
        });
      } else {
        // If some error happens and a candidate isn't evaluated, it becomes rejected/failed rather than disappearing
        artifacts.push({
          id: `art-${run.id}-it${iteration}-idx${candidate.candidateIndex}-un`,
          workflowRunId: run.id,
          orderNumber: run.orderNumber,
          productId,
          templateId,
          iteration,
          candidateIndex: candidate.candidateIndex,
          storagePath: candidate.storagePath,
          status: 'failed_generation',
          qaScore: 0,
          rejectionReason: 'Missing evaluation metadata, marked as failed.',
          qaResultJson: '{}',
          generatedAt: new Date().toISOString()
        });
      }
    }

    return artifacts;
  }
}
