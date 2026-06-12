import { 
  Product, 
  QualityGateConfig, 
  PersonalizationApiConfig 
} from '../domain/models';
import { 
  PromptTemplate, 
  WorkflowRun, 
  ImageArtifact, 
  WorkflowLog, 
  GenerationConfig, 
  PodProviderConfig 
} from '../../types';
import { 
  ProductRepository,
  TemplateRepository,
  WorkflowRepository,
  ArtifactRepository,
  SettingsRepository,
  RoleRepository
} from '../repositories/interfaces';
import {
  ImageGenerationProvider,
  QualityGateProvider,
  PersonalizationProvider,
  PodProvider,
  MailProvider
} from '../providers/interfaces';

import { renderPrompt } from './promptRenderer';
import { WorkflowStateMachine } from './stateMachine';
import { ArtifactService } from './artifactService';
import { EscalationService } from './escalationService';

export { getPropertyByPath, renderPrompt } from './promptRenderer';

export class WorkflowRunner {
  private escalationService: EscalationService;

  constructor(
    private productsRepo: ProductRepository,
    private templatesRepo: TemplateRepository,
    private workflowRepo: WorkflowRepository,
    private artifactsRepo: ArtifactRepository,
    private settingsRepo: SettingsRepository,
    private roleRepo: RoleRepository,
    private genProvider: ImageGenerationProvider,
    private qaProvider: QualityGateProvider,
    private personalizationProvider: PersonalizationProvider,
    private podProvider: PodProvider,
    private mailProvider: MailProvider
  ) {
    this.escalationService = new EscalationService(this.mailProvider);
  }

  async run(
    orderNumber: string,
    productId: string,
    customerName: string,
    birthDate: string,
    birthTime: string,
    birthTimeKnown: boolean,
    birthPlace: string,
    onLogUpdate?: (log: WorkflowLog) => void
  ): Promise<WorkflowRun> {
    // Permission validation (Observer cannot start writes or simulations)
    const activeRole = await this.roleRepo.getActiveRole();
    const rolePermissions = await this.roleRepo.getRolePermissions();
    const activePerms = rolePermissions.find(p => p.role === activeRole)?.permissions || [];
    
    if (!activePerms.includes('run_simulation')) {
      throw new Error(`Permission Denied: User role "${activeRole}" does not hold 'run_simulation' privileges.`);
    }

    const products = await this.productsRepo.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) {
      throw new Error(`Product ${productId} not found in database.`);
    }

    const templates = await this.templatesRepo.getTemplates();
    const activeTemplate = templates.find(t => t.id === product.activeTemplateId && t.status === 'active') || templates[0];

    const genConfigs = await this.settingsRepo.getGenConfigs();
    const genConfig = genConfigs.find(c => c.productId === productId) || genConfigs[0];

    const qualityConfigs = await this.settingsRepo.getQualityConfigs();
    const qualityConfig = qualityConfigs.find(q => q.productId === productId) || qualityConfigs[0];

    const personalizationConfig = await this.settingsRepo.getPersonalizationConfig();
    const podConfig = await this.settingsRepo.getPodConfig();

    const runId = `wf-run-${Math.floor(1000 + Math.random() * 9000)}`;
    const runs = await this.workflowRepo.getWorkflowRuns();

    const newRun: WorkflowRun = {
      id: runId,
      orderNumber,
      productId,
      customerName,
      birthDate,
      birthTime: birthTimeKnown ? birthTime : '12:00',
      birthTimeKnown,
      birthPlace,
      status: 'running',
      startedAt: new Date().toISOString(),
      currentIteration: 1
    };

    runs.unshift(newRun);
    await this.workflowRepo.saveWorkflowRuns(runs);

    let logCounter = 0;
    const saveAndFireLog = async (
      message: string,
      step: string,
      status: 'info' | 'success' | 'warning' | 'error' = 'info',
      providerUsed?: string,
      modelUsed?: string,
      iteration?: number
    ) => {
      logCounter++;
      const log: WorkflowLog = {
        id: `log-${runId}-${logCounter}`,
        runId,
        orderNumber,
        timestamp: new Date().toISOString(),
        step,
        message,
        status,
        providerUsed,
        modelUsed,
        iteration
      };
      const existingLogs = await this.workflowRepo.getWorkflowLogs();
      existingLogs.unshift(log);
      await this.workflowRepo.saveWorkflowLogs(existingLogs);
      if (onLogUpdate) {
        onLogUpdate(log);
      }
    };

    await saveAndFireLog(`Starting automated workflow pipeline run for order Ref #${orderNumber}`, 'PIPELINE_INIT', 'info');

    // 1. ASTRO / PERSONALIZATION RESOLUTION
    const birthTimeFallback = {
      birth_time: '12:00',
      birth_time_known: false,
      birth_time_source: 'default_noon'
    };

    await saveAndFireLog(`Invoking Personalization Engine adapter on fufire...`, 'PERSONALIZATION_LOOKUP', 'info');
    const personalizationVars = await this.personalizationProvider.calculate(
      customerName,
      birthDate,
      birthTime,
      birthTimeKnown,
      birthPlace,
      birthTimeFallback
    );

    // Strict unknown fallback validation rule assertions
    if (!birthTimeKnown) {
      personalizationVars.resolvedTime = '12:00';
      personalizationVars.resolvedTimeSource = 'default_noon';
    }

    await saveAndFireLog(`Resolved Personalization parameters: animal=${personalizationVars.animal}, element=${personalizationVars.element}. Time Source: ${personalizationVars.resolvedTimeSource}`, 'PERSONALIZATION_LOOKUP', 'success');

    // Update run parameters
    newRun.personalizationData = personalizationVars;
    newRun.birthTime = personalizationVars.resolvedTime;
    newRun.birthTimeKnown = birthTimeKnown;
    const currentRuns = await this.workflowRepo.getWorkflowRuns();
    const runIdx = currentRuns.findIndex(r => r.id === runId);
    if (runIdx !== -1) {
      currentRuns[runIdx] = newRun;
      await this.workflowRepo.saveWorkflowRuns(currentRuns);
    }

    // Swarm Evaluation Loop
    let currentIteration = 1;
    let matchedArtifact: ImageArtifact | null = null;
    const allSwarmArtifacts: ImageArtifact[] = [];

    while (currentIteration <= qualityConfig.maxRejectedBeforeEscalation) {
      newRun.currentIteration = currentIteration;
      const allLatestRuns = await this.workflowRepo.getWorkflowRuns();
      const latestIdx = allLatestRuns.findIndex(r => r.id === runId);
      if (latestIdx !== -1) {
        allLatestRuns[latestIdx].currentIteration = currentIteration;
        await this.workflowRepo.saveWorkflowRuns(allLatestRuns);
      }

      await saveAndFireLog(`Beginning swarm variant generation. Iteration ${currentIteration}/${qualityConfig.maxRejectedBeforeEscalation}`, 'GENERATE_CANDIDATES', 'info');

      // Compile Prompt
      const templatePayload = {
        order: { order_number: orderNumber },
        personalization: {
          name: customerName,
          birth_date: birthDate,
          birth_time: personalizationVars.resolvedTime,
          birth_time_source: personalizationVars.resolvedTimeSource,
          birth_place: birthPlace
        },
        fufire: {
          animal: personalizationVars.animal,
          element: personalizationVars.element,
          birth_year: personalizationVars.birth_year,
          dominant_element: personalizationVars.dominant_element
        }
      };

      // Prompt rendering check
      let compiledPrompt = '';
      try {
        compiledPrompt = renderPrompt(activeTemplate.content, templatePayload);
      } catch (err: any) {
        await saveAndFireLog(`Compile Exception: ${err.message}`, 'GENERATE_CANDIDATES', 'error');
        newRun.status = 'failed';
        const failRuns = await this.workflowRepo.getWorkflowRuns();
        const fIdx = failRuns.findIndex(r => r.id === runId);
        if (fIdx !== -1) {
          failRuns[fIdx].status = 'failed';
          await this.workflowRepo.saveWorkflowRuns(failRuns);
        }
        throw err;
      }

      // Candidate execution
      const providerUsed = currentIteration > 1 ? genConfig.fallbackProvider : genConfig.primaryProvider;
      const modelUsed = currentIteration > 1 ? genConfig.fallbackModel : genConfig.primaryModel;
      
      const generationParams = {
        productTitle: product.title,
        orderNumber,
        animal: personalizationVars.animal,
        element: personalizationVars.element,
        dominant_element: personalizationVars.dominant_element,
        iteration: currentIteration
      };

      const generatedCandidates = await this.genProvider.generate(
        compiledPrompt,
        genConfig.numInitiallyGenerated,
        genConfig.imageFormat,
        genConfig.imageQuality,
        modelUsed,
        currentIteration > 1 ? genConfig.fallbackSecretRef : genConfig.primarySecretRef,
        generationParams
      );

      // QA Evaluation Stage
      const evaluations = await this.qaProvider.evaluate(
        generatedCandidates,
        qualityConfig.minAcceptanceScore,
        qualityConfig.qaPrompt,
        qualityConfig.secretRef,
        qualityConfig.model,
        personalizationVars,
        currentIteration
      );

      // Persist every candidate as artifact using visual ArtifactService
      const persistentArtifacts: ImageArtifact[] = ArtifactService.createArtifactsFromSwarm(
        newRun,
        productId,
        activeTemplate.id,
        currentIteration,
        generatedCandidates,
        evaluations
      );

      // Append artifacts to list
      allSwarmArtifacts.push(...persistentArtifacts);
      const existingArtifacts = await this.artifactsRepo.getImageArtifacts();
      await this.artifactsRepo.saveImageArtifacts([...persistentArtifacts, ...existingArtifacts]);

      // Handle logs and matching
      let itAcceptedArtifact: ImageArtifact | null = null;
      for (const art of persistentArtifacts) {
        if (art.status === 'accepted') {
          itAcceptedArtifact = art;
          await saveAndFireLog(`Candidate ${art.candidateIndex + 1} passed QA scoring with high score of ${art.qaScore}/100!`, 'QA_SCREENING', 'success');
        } else if (art.status === 'rejected') {
          await saveAndFireLog(`Candidate ${art.candidateIndex + 1} failed QA evaluation (${art.qaScore}/100): ${art.rejectionReason}`, 'QA_SCREENING', 'warning');
        } else {
          await saveAndFireLog(`Candidate ${art.candidateIndex + 1} outranked (${art.qaScore}/100)`, 'QA_SCREENING', 'info');
        }
      }

      if (itAcceptedArtifact) {
        matchedArtifact = itAcceptedArtifact;
        break;
      }

      await saveAndFireLog(`Iteration ${currentIteration} did not yield any passing templates. Composition unfulfilled.`, 'QA_SCREENING', 'warning');
      currentIteration++;
    }

    const runsLatest = await this.workflowRepo.getWorkflowRuns();
    const lIdx = runsLatest.findIndex(r => r.id === runId);

    if (matchedArtifact) {
      // State Machine assert check
      WorkflowStateMachine.assertDispatchAllowed(newRun, matchedArtifact);

      // 100% QA Passed! Auto submit to POD
      await saveAndFireLog(`QA Verified. Connecting to POD fulfillment provider Gelato...`, 'POD_SUBMISSION', 'info');
      
      const submitResponse = await this.podProvider.submitOrder(
        runId,
        orderNumber,
        productId,
        matchedArtifact,
        podConfig
      );

      await saveAndFireLog(`POD dispatch submitted successfully! Order Reference: ${submitResponse.podOrderId}. Dispatch Mode: ${submitResponse.dispatchMode.toUpperCase()}`, 'POD_SUBMISSION', 'success');

      if (lIdx !== -1) {
        runsLatest[lIdx].status = 'completed';
        runsLatest[lIdx].acceptedArtifactId = matchedArtifact.id;
        runsLatest[lIdx].completedAt = new Date().toISOString();
        await this.workflowRepo.saveWorkflowRuns(runsLatest);
      }

      await saveAndFireLog(`Automated orchestration completed successfully.`, 'PIPELINE_COMPLETE', 'success');
    } else {
      // Escalate using EscalationService!
      await saveAndFireLog(`ESCALATION LIMIT TRIGGERED! Exceeded maximum limit of ${qualityConfig.maxRejectedBeforeEscalation} rejected iterations.`, 'ESCALATION_TRIGGER', 'error');

      const escEvent = await this.escalationService.triggerEscalation(
        newRun,
        productId,
        product.title,
        activeTemplate.id,
        activeTemplate.name,
        qualityConfig.maxRejectedBeforeEscalation,
        qualityConfig.minAcceptanceScore,
        allSwarmArtifacts,
        qualityConfig.escalationEmailTemplate
      );

      await saveAndFireLog(`Escalation notification dispatched to Store Administrators. Event Ref: ${escEvent.id}`, 'ESCALATION_TRIGGER', 'warning');

      if (lIdx !== -1) {
        runsLatest[lIdx].status = 'escalated';
        runsLatest[lIdx].completedAt = new Date().toISOString();
        await this.workflowRepo.saveWorkflowRuns(runsLatest);
      }
    }

    const finalRun = (await this.workflowRepo.getWorkflowRuns()).find(r => r.id === runId)!;
    return finalRun;
  }

  /**
   * Action trigger used to submit orders containing manual approvals to Gelato.
   */
  async dispatchManualApproval(
    runId: string,
    artifact: ImageArtifact
  ): Promise<{ success: boolean; podOrderId: string }> {
    const runs = await this.workflowRepo.getWorkflowRuns();
    const run = runs.find(r => r.id === runId);
    
    if (!run) {
      throw new Error(`Workflow run ${runId} not found.`);
    }

    // State Machine assert check
    WorkflowStateMachine.assertDispatchAllowed(run, artifact);

    const podConfig = await this.settingsRepo.getPodConfig();
    const response = await this.podProvider.submitOrder(
      runId,
      run.orderNumber,
      run.productId,
      artifact,
      podConfig
    );

    run.status = 'completed';
    run.acceptedArtifactId = artifact.id;
    run.completedAt = new Date().toISOString();
    await this.workflowRepo.saveWorkflowRuns(runs);

    return {
      success: response.success,
      podOrderId: response.podOrderId
    };
  }
}
