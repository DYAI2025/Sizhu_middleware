/**
 * Bazzi Middleware Platform - Mock Quality Gate Provider
 */

import { QualityGateProvider } from '../interfaces';

export class MockQualityGateProvider implements QualityGateProvider {
  async evaluate(
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
  }[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const evaluations = [];
    let acceptedIndex: number | null = null;
    let highestScore = -1;

    // Fixed mock scoring strategy aligned with the constraints for deterministic testing
    const scores = candidates.map((_, index) => {
      if (iteration === 1) {
        if (index === 0) return minScore - 8; // Fail -> rejected
        if (index === 1) return minScore + 1; // Pass but outranked -> not_selected
        return minScore + 2; // Pass and highest -> accepted
      } else {
        return minScore + 5 + index; // Sub-iterations score higher due to refinement
      }
    });

    // Select the best passing index
    scores.forEach((score, index) => {
      if (score >= minScore) {
        if (score > highestScore) {
          highestScore = score;
          acceptedIndex = index;
        }
      }
    });

    for (let index = 0; index < candidates.length; index++) {
      const score = scores[index];
      let status: 'accepted' | 'rejected' | 'not_selected' = 'rejected';
      let reason = '';

      if (score < minScore) {
        status = 'rejected';
        reason = `LLM evaluator: Compositional score (${score}/100) falls below active threshold of ${minScore}. Background alignment is slightly distorted.`;
      } else if (index === acceptedIndex) {
        status = 'accepted';
        reason = `Outstanding compositional alignment (${score}/100). No visual anomalies detected. Passing threshold of ${minScore}.`;
      } else {
        status = 'not_selected';
        reason = `Sufficient score (${score}/${minScore}) but outranked by candidate ${acceptedIndex! + 1}.`;
      }

      evaluations.push({
        candidateIndex: index,
        score,
        status,
        reason,
        detailedJson: JSON.stringify({
          evaluation_timestamp: new Date().toISOString(),
          qa_prompt_used: qaPrompt.substring(0, 100),
          secret_used: secretRef,
          llm_model: model,
          scores: {
            composition: score,
            adherence: 100
          }
        }, null, 2)
      });
    }

    return evaluations;
  }
}
