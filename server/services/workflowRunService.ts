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
import { OpenRouterImageGenerationProvider } from "./openRouterImageGenerationProvider";
import { OpenRouterQualityGateProvider } from "./openRouterQualityGateProvider";
import { WorkflowRunner } from "../../src/lib/workflow/runner";
import { buildOpenRouterGatewayConfig, resolveOpenRouterCredentials } from "../../src/lib/modelGateway";
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

function createServerProviders(): {
  genProvider: ImageGenerationProvider;
  qaProvider: QualityGateProvider;
} {
  const inTest = process.env.VITEST === "true";
  const credentialCheck = resolveOpenRouterCredentials();
  if (!inTest && credentialCheck.present) {
    const gatewayConfig = buildOpenRouterGatewayConfig();
    return {
      genProvider: new OpenRouterImageGenerationProvider(gatewayConfig.baseUrl, gatewayConfig.secretRef),
      qaProvider: new OpenRouterQualityGateProvider(gatewayConfig.baseUrl, gatewayConfig.secretRef),
    };
  }
  return {
    genProvider: new MockImageGenerationProvider(),
    qaProvider: new MockQualityGateProvider(),
  };
}

export async function runWorkflow(input: RunWorkflowInput): Promise<WorkflowRun> {
  const { genProvider, qaProvider } = createServerProviders();

  const personalizationProvider = new MockFuFireProvider();
  const podProvider = new MockPodProvider();
  const mailProvider = new MockMailProvider();

  const runner = new WorkflowRunner(
    new LocalProductRepository(),
    new LocalTemplateRepository(),
    new LocalWorkflowRepository(),
    new LocalArtifactRepository(),
    new LocalSettingsRepository(),
    new LocalRoleRepository(),
    genProvider,
    qaProvider,
    personalizationProvider,
    podProvider,
    mailProvider,
  );

  await runner["roleRepo"].setActiveRole("Owner");

  return runner.run(
    input.orderNumber,
    input.productId,
    input.customerName,
    input.birthDate,
    input.birthTime,
    input.birthTimeKnown,
    input.birthPlace,
  );
}
