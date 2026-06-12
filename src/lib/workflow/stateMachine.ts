/**
 * Bazzi Middleware Platform - Workflow Run State Machine
 */

import { WorkflowRun, ImageArtifact } from '../domain/models';

export type WorkflowState = 'running' | 'pod_ready' | 'completed' | 'escalated' | 'failed';

export class WorkflowStateMachine {
  /**
   * Validates if a transition is permitted.
   */
  static canTransition(from: WorkflowState, to: WorkflowState): boolean {
    if (from === 'completed' || from === 'escalated' || from === 'failed') {
      return false; // Terminal states cannot transitioned out
    }
    return true; // From running/pod_ready to any state is fine
  }

  /**
   * Asserts and enforces that POD submission is only permitted for runs/artifacts that are accepted or approved.
   */
  static assertDispatchAllowed(run: WorkflowRun, artifact: ImageArtifact): void {
    const isQAApproved = artifact.status === 'accepted';
    const isHumanApproved = (run.status === 'completed' || run.status === 'pod_ready') && run.acceptedArtifactId === artifact.id;
    
    if (!isQAApproved && !isHumanApproved) {
      throw new Error(`State Machine Rejection: POD submission blocked. Candidate ${artifact.id} exhibits status "${artifact.status}" which fails quality gate mandates.`);
    }
  }
}
