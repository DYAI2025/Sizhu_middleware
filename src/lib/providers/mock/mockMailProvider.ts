/**
 * Bazzi Middleware Platform - Mock Mail Provider (Postmark / SendGrid replica)
 */

import { MailProvider } from '../interfaces';

export class MockMailProvider implements MailProvider {
  async sendEscalationMail(
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
  }> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    
    const finalContent = emailTemplate
      .replace(/{{order_number}}/g, variables.order_number)
      .replace(/{{product_id}}/g, variables.product_id)
      .replace(/{{product_title}}/g, variables.product_title)
      .replace(/{{template_name}}/g, variables.template_name)
      .replace(/{{iteration_count}}/g, variables.iteration_count)
      .replace(/{{min_score}}/g, variables.min_score)
      .replace(/{{rejection_reasons}}/g, variables.rejection_reasons)
      .replace(/{{failed_candidate_images}}/g, variables.failed_candidate_images)
      .replace(/{{workflow_run_url}}/g, variables.workflow_run_url);

    // Save escalation dispatch to local records safely for testing
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`bazzi_escalated_email_${variables.order_number}`, finalContent);
      } catch (e) {}
    }

    return {
      success: true,
      messageId: `MOCK-MSG-${Date.now()}`
    };
  }
}
export { MockMailProvider as MockEmailProvider };
