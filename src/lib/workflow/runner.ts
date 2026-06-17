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
import { CostCapError } from './costCap';
import { WorkflowStateMachine } from './stateMachine';
import { ArtifactService } from './artifactService';
import { EscalationService } from './escalationService';
import { selectModelForOperation } from '../modelGateway';
import type { ModelGatewayOperation } from '../modelGateway';
// FP2 / REQ-F-001: single-source the default-noon display value. The canonical
// CLIENT-SIDE constant lives in domain/defaultBirthTime.ts; the FuFire ISO form
// (`DEFAULT_NOON_TIME` "12:00:00") lives in server/contracts/fufireContract.ts and
// is kept in sync there. The runner is client-safe, so it imports the display form.
import { DEFAULT_BIRTH_TIME, DEFAULT_BIRTH_TIME_SOURCE } from '../domain/defaultBirthTime';

export { getPropertyByPath, renderPrompt } from './promptRenderer';

/**
 * Safe env source for the model gateway. The runner runs client-side in
 * DEMO_LOCAL, where `process` is undefined; passing `{}` makes the gateway fall
 * back to its built-in OpenRouter defaults. On the server, the real env (with
 * any OPENROUTER_MODEL_* overrides) is read. Secrets are never read here — only
 * the per-operation model id is resolved.
 */
function gatewayEnv(): Record<string, string | undefined> {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

/**
 * Resolve the model id for an operation through the OpenRouter model gateway
 * (REQ-A-002) when the configured provider is the gateway. For legacy direct
 * providers the explicitly-configured model id is preserved (back-compat).
 */
function resolveModelId(
  provider: string,
  operation: ModelGatewayOperation,
  configuredModel: string
): string {
  if (provider === 'OpenRouter') {
    return selectModelForOperation(operation, gatewayEnv());
  }
  return configuredModel;
}

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
      birthTime: birthTimeKnown ? birthTime : DEFAULT_BIRTH_TIME,
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
      birth_time: DEFAULT_BIRTH_TIME,
      birth_time_known: false,
      birth_time_source: DEFAULT_BIRTH_TIME_SOURCE
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
      personalizationVars.resolvedTime = DEFAULT_BIRTH_TIME;
      personalizationVars.resolvedTimeSource = DEFAULT_BIRTH_TIME_SOURCE;
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
    // Set when the cost cap halts the run mid-loop (OQ-2): carried into the
    // escalation so a cap-stop is persisted distinguishably from quality exhaustion.
    let capStopReason: string | null = null;

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
      const configuredModel = currentIteration > 1 ? genConfig.fallbackModel : genConfig.primaryModel;
      // REQ-A-002: route the image-generation model id through the OpenRouter
      // gateway when the configured provider is the gateway (capability-checked).
      const modelUsed = resolveModelId(providerUsed, 'image_generation', configuredModel);

      const generationParams = {
        productTitle: product.title,
        orderNumber,
        animal: personalizationVars.animal,
        element: personalizationVars.element,
        dominant_element: personalizationVars.dominant_element,
        iteration: currentIteration
      };

      let generatedCandidates;
      try {
        generatedCandidates = await this.genProvider.generate(
          compiledPrompt,
          genConfig.numInitiallyGenerated,
          genConfig.imageFormat,
          genConfig.imageQuality,
          modelUsed,
          currentIteration > 1 ? genConfig.fallbackSecretRef : genConfig.primarySecretRef,
          generationParams
        );
      } catch (e: any) {
        // Cost cap bite: halt the run HERE (the runner owns runId + state), so the
        // escalation persists the distinct reason — no fragile out-of-band run lookup.
        if (e instanceof CostCapError) {
          capStopReason = e.reason;
          await saveAndFireLog(`Cost cap reached: ${e.message}. Halting run before further image spend.`, 'COST_CAP', 'error');
          break;
        }
        throw e;
      }

      // QA Evaluation Stage
      // REQ-A-002: route the quality-gate model id through the OpenRouter
      // gateway when the configured provider is the gateway (vision-capability
      // checked); legacy providers keep their explicitly-configured model.
      const qaModelUsed = resolveModelId(
        qualityConfig.llmProvider,
        'quality_gate',
        qualityConfig.model
      );
      const evaluations = await this.qaProvider.evaluate(
        generatedCandidates,
        qualityConfig.minAcceptanceScore,
        qualityConfig.qaPrompt,
        qualityConfig.secretRef,
        qaModelUsed,
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

      // 100% QA Passed! We stop here and set to pod_ready. No auto-submit.
      await saveAndFireLog(`QA Verified. Artifact is ready for POD dispatch. Automatic dispatch disabled by config. Action required.`, 'POD_READY', 'info');

      if (lIdx !== -1) {
        runsLatest[lIdx].status = 'pod_ready'; // Wait for manual dispatch or configured auto-job later
        runsLatest[lIdx].acceptedArtifactId = matchedArtifact.id;
        runsLatest[lIdx].completedAt = new Date().toISOString();
        await this.workflowRepo.saveWorkflowRuns(runsLatest);
      }

      await saveAndFireLog(`Automated orchestration paused awaiting execution boundary.`, 'PIPELINE_COMPLETE', 'success');
    } else {
      // Escalate using EscalationService!
      if (capStopReason) {
        await saveAndFireLog(`Run halted by cost cap (${capStopReason}) before quality exhaustion. Escalating for human review.`, 'ESCALATION_TRIGGER', 'error');
      } else {
        await saveAndFireLog(`ESCALATION LIMIT TRIGGERED! Exceeded maximum limit of ${qualityConfig.maxRejectedBeforeEscalation} rejected iterations.`, 'ESCALATION_TRIGGER', 'error');
      }

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
        if (capStopReason) runsLatest[lIdx].escalationReason = capStopReason;
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
