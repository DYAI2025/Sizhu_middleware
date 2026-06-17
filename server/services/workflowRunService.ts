import type { WorkflowRun } from "../../src/types";
import {
  LocalProductRepository,
  LocalTemplateRepository,
  LocalWorkflowRepository,
  LocalArtifactRepository,
  LocalSettingsRepository,
  LocalRoleRepository,
} from "../../src/lib/repositories/localRepository";
import {
  MockFuFireProvider,
  MockPodProvider,
  MockMailProvider,
  MockImageGenerationProvider,
  MockQualityGateProvider,
} from "../../src/lib/providers/mock";
// Real, GUARDED OpenRouter providers (canonical location per REQ-LGQ-008a /
// lgq.wiredInProd.contract). These carry the PII-redaction (F2), no-fake-success
// (contract-drift) and provenance guards the prior server/services providers lacked.
import { OpenRouterImageGenerationProvider } from "../../src/lib/providers/openrouter/openRouterImageGenerationProvider";
import { OpenRouterQualityGateProvider } from "../../src/lib/providers/openrouter/openRouterQualityGateProvider";
import { CostCappedImageGenerationProvider } from "../../src/lib/providers/openrouter/costCappedImageProvider";
import { deriveDefaultCap, COST_CAP_REACHED, type CostCap } from "../../src/lib/workflow/costCap";
import { WorkflowRunner } from "../../src/lib/workflow/runner";
import { resolveOpenRouterCredentials } from "../../src/lib/modelGateway";
import type { ImageGenerationProvider, QualityGateProvider } from "../../src/lib/providers/interfaces";

export interface RunWorkflowInput {
  orderNumber: string;
  productId: string;
  customerName: string;
  birthDate: string;
  birthTime: string;
  birthTimeKnown: boolean;
  birthPlace: string;
}

/** Run telemetry surfaced on the run-service RESULT (REQ-LGQ-006). */
export interface RunWorkflowResult extends WorkflowRun {
  realCostUsd: number;
  imageCallCount: number;
  capStopped: boolean;
  escalationReason?: string;
  rejectionRate: number;
  // false on the mock path: realCostUsd is NOT a measured value (mock records 0),
  // so a 0 must not be read as "measured zero cost".
  costMeasured: boolean;
}

function buildRealProviders(): {
  genProvider: ImageGenerationProvider;
  qaProvider: QualityGateProvider;
} {
  return {
    genProvider: new OpenRouterImageGenerationProvider(),
    qaProvider: new OpenRouterQualityGateProvider(),
  };
}

function buildMockProviders(): {
  genProvider: ImageGenerationProvider;
  qaProvider: QualityGateProvider;
} {
  return {
    genProvider: new MockImageGenerationProvider(),
    qaProvider: new MockQualityGateProvider(),
  };
}

export async function runWorkflow(input: RunWorkflowInput): Promise<RunWorkflowResult> {
  const settingsRepo = new LocalSettingsRepository();

  // Derive the per-run cost cap: explicit GenerationConfig fields win, else the
  // config worst-case default (deriveDefaultCap — never a blind guess).
  const genConfigs = await settingsRepo.getGenConfigs();
  const qualityConfigs = await settingsRepo.getQualityConfigs();
  const genConfig = genConfigs.find((c) => c.productId === input.productId) ?? genConfigs[0];
  const derived = deriveDefaultCap(
    genConfigs.map((c) => ({ productId: c.productId, numInitiallyGenerated: c.numInitiallyGenerated })),
    qualityConfigs.map((q) => ({ productId: q.productId, maxRejectedBeforeEscalation: q.maxRejectedBeforeEscalation })),
  );
  const cap: CostCap = {
    maxImagesPerRun: genConfig?.maxImagesPerRun ?? derived.maxImagesPerRun,
    maxUsdPerRun: genConfig?.maxUsdPerRun ?? derived.maxUsdPerRun,
  };

  // Tests drive the mock path (VITEST=true) to avoid real API calls; production
  // uses the real providers only when OpenRouter credentials are actually present.
  const inTest = process.env.VITEST === "true";
  const credentialCheck = resolveOpenRouterCredentials();
  const useReal = !inTest && credentialCheck.present;

  const { genProvider: baseGen, qaProvider } = useReal ? buildRealProviders() : buildMockProviders();

  // The cost cap wraps the image provider on BOTH paths so it is genuinely
  // load-bearing (the contract's Gegenthese: a cap that is never called is
  // decorative). The image-COUNT cap applies universally; the $ ceiling only bites
  // on the real path (the mock records 0 cost). The derived default sits above the
  // worst-case, so a legit run never trips its own cap.
  const cappedGen = new CostCappedImageGenerationProvider(baseGen, cap);
  const genProvider: ImageGenerationProvider = cappedGen;

  const artifactsRepo = new LocalArtifactRepository();
  const runner = new WorkflowRunner(
    new LocalProductRepository(),
    new LocalTemplateRepository(),
    new LocalWorkflowRepository(),
    artifactsRepo,
    settingsRepo,
    new LocalRoleRepository(),
    genProvider,
    qaProvider,
    new MockFuFireProvider(),
    new MockPodProvider(),
    new MockMailProvider(),
  );

  await runner["roleRepo"].setActiveRole("Owner");

  // The runner owns runId + state: a cost-cap bite is caught INSIDE its loop and
  // persisted as status=escalated + escalationReason=COST_CAP_REACHED. We read the
  // outcome off the returned run — no out-of-band run lookup, no concurrent-run race.
  const run = await runner.run(
    input.orderNumber,
    input.productId,
    input.customerName,
    input.birthDate,
    input.birthTime,
    input.birthTimeKnown,
    input.birthPlace,
  );

  // Per-run rejection rate from the persisted artifacts for THIS run id.
  const runArtifacts = (await artifactsRepo.getImageArtifacts()).filter((a) => a.workflowRunId === run.id);
  const rejected = runArtifacts.filter((a) => a.status !== "accepted").length;
  const rejectionRate = runArtifacts.length > 0 ? rejected / runArtifacts.length : 0;

  const capStopped = run.status === "escalated" && run.escalationReason === COST_CAP_REACHED;

  return {
    ...run,
    realCostUsd: cappedGen.enforcer.accumulatedUsd,
    imageCallCount: cappedGen.enforcer.imageCallCount,
    costMeasured: useReal,
    capStopped,
    escalationReason: run.escalationReason,
    rejectionRate,
  };
}
