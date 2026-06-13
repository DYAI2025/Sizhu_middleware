import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LocalSettingsRepository,
  LocalProductRepository,
  LocalTemplateRepository,
  LocalWorkflowRepository,
  LocalArtifactRepository,
  LocalRoleRepository,
} from '../lib/repositories/localRepository';
import {
  MockQualityGateProvider,
  MockFuFireProvider,
  MockPodProvider,
  MockMailProvider,
} from '../lib/providers/mock';
import { WorkflowRunner } from '../lib/workflow/runner';
import {
  buildOpenRouterGatewayConfig,
  selectModelForOperation,
} from '../lib/modelGateway';
import type { ImageGenerationProvider } from '../lib/providers/interfaces';

/**
 * REQ-A-002 — "wired-in-prod" proof for the OpenRouter model gateway.
 *
 * Kritische semantische Glättung — REQ-A-002 (BOUNDARY: runtime model selection):
 *   These:      "A real OpenRouter gateway module exists and its unit tests are green."
 *   Gegenthese: The gateway module has ZERO production importers — the runtime model
 *               selection still defaults to direct 'Gemini'/'OpenAI' providers (seed
 *               defaults + the runner reading genConfig.primaryModel verbatim). So the
 *               architectural promise ("OpenRouter is the only default model gateway")
 *               is GREEN in isolation yet FALSE at runtime: nothing in the production
 *               composition path ever calls the gateway.
 *   Schärfung:  Assert (a) the DEFAULT seeded GenerationConfig / QualityGate config use
 *               provider 'OpenRouter' + the OpenRouter secret-ref (NOT a forced
 *               Gemini/OpenAI default), and (b) the runner actually routes its model id
 *               through selectModelForOperation so the gateway is genuinely in the
 *               production composition path.
 *
 * Evidence class: real-composition (drives the real WorkflowRunner + Local repos that
 * ship in DEMO_LOCAL) + pure-source-grep for the import edge.
 */

const OPENROUTER_SECRET_REF = 'SECRET_REF_OPENROUTER_API_KEY';

// Sentinels: a raw config model the GATEWAY would NEVER return. Seeding the config
// with these (provider stays 'OpenRouter') makes the routing assertion INDEPENDENT of
// the seed default — so reverting the runner's resolveModelId to `return configuredModel`
// (the unwired behaviour) flips the test RED. Without this, seed==gateway-default made
// the assertion tautological (see code-review CHANGES-REQUIRED, T5b).
const GEN_SENTINEL = 'RAW-CONFIG-SENTINEL-image-not-a-gateway-id';
const QA_SENTINEL = 'RAW-CONFIG-SENTINEL-qa-not-a-gateway-id';

describe('REQ-A-002 wired-in-prod — default seeded configs use the OpenRouter gateway', () => {
  it('the FIRST seeded GenerationConfig defaults to provider "OpenRouter" + OpenRouter secret-ref (not forced Gemini/OpenAI)', async () => {
    const settings = new LocalSettingsRepository();
    const genConfigs = await settings.getGenConfigs();
    const def = genConfigs[0];

    expect(def.primaryProvider).toBe('OpenRouter');
    expect(def.primarySecretRef).toBe(OPENROUTER_SECRET_REF);
    // The default image model must be the gateway's OpenRouter image model.
    expect(def.primaryModel).toBe(
      buildOpenRouterGatewayConfig({}).models.image_generation.id,
    );
  });

  it('the FIRST seeded QualityGate config defaults to provider "OpenRouter" + OpenRouter secret-ref', async () => {
    const settings = new LocalSettingsRepository();
    const qaConfigs = await settings.getQualityConfigs();
    const def = qaConfigs[0];

    expect(def.llmProvider).toBe('OpenRouter');
    expect(def.secretRef).toBe(OPENROUTER_SECRET_REF);
    expect(def.model).toBe(buildOpenRouterGatewayConfig({}).models.quality_gate.id);
  });
});

describe('REQ-A-002 wired-in-prod — the runner routes the model id through the gateway', () => {
  it('imports selectModelForOperation in the runtime runner source (production composition edge exists)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/workflow/runner.ts'),
      'utf8',
    );
    expect(src).toMatch(/selectModelForOperation/);
    expect(src).toMatch(/from ['"]\.\.\/modelGateway['"]/);
  });

  it('calls selectModelForOperation("image_generation") and passes the resolved gateway model to genProvider.generate', async () => {
    const productRepo = new LocalProductRepository();
    const templatesRepo = new LocalTemplateRepository();
    const workflowRepo = new LocalWorkflowRepository();
    const artifactsRepo = new LocalArtifactRepository();
    const settingsRepo = new LocalSettingsRepository();
    const roleRepo = new LocalRoleRepository();

    // Capture the model the runner asks the generation provider to use.
    const captured: { model?: string } = {};
    const spyGen: ImageGenerationProvider = {
      async generate(_prompt, numCandidates, _format, _quality, model) {
        captured.model = model;
        return Array.from({ length: numCandidates }, (_v, i) => ({
          candidateIndex: i,
          storagePath: `mock://${i}`,
          metadata: {
            promptUsed: 'p',
            model,
            provider: 'OpenRouter',
            quality: 'hd',
            resolution: '1024x1024',
          },
        }));
      },
    };

    const qaProvider = new MockQualityGateProvider();
    const personalizationProvider = new MockFuFireProvider();
    const podProvider = new MockPodProvider();
    const mailProvider = new MockMailProvider();

    const runner = new WorkflowRunner(
      productRepo,
      templatesRepo,
      workflowRepo,
      artifactsRepo,
      settingsRepo,
      roleRepo,
      spyGen,
      qaProvider,
      personalizationProvider,
      podProvider,
      mailProvider,
    );

    await roleRepo.setActiveRole('Owner');

    // Seed the config with a SENTINEL primaryModel (provider stays OpenRouter) so the
    // assertion is independent of the seed default: pass-through would yield the sentinel.
    const genCfgs = await settingsRepo.getGenConfigs();
    genCfgs[0] = { ...genCfgs[0], primaryProvider: 'OpenRouter', primaryModel: GEN_SENTINEL };
    await settingsRepo.saveGenConfigs(genCfgs);

    await runner.run('ORD-GATEWAY-1', 'prod-001', 'Gateway User', '2026-01-01', '14:00', true, 'London');

    // The model handed to the provider MUST be the gateway-resolved OpenRouter id,
    // i.e. it routed through selectModelForOperation rather than passing the raw config string.
    const expected = selectModelForOperation('image_generation', {});
    expect(captured.model).toBe(expected);
    // And it must NOT be the raw configured sentinel — proves routing, not pass-through.
    expect(captured.model).not.toBe(GEN_SENTINEL);
  });

  it('routes the QA model id through selectModelForOperation("quality_gate")', async () => {
    const productRepo = new LocalProductRepository();
    const templatesRepo = new LocalTemplateRepository();
    const workflowRepo = new LocalWorkflowRepository();
    const artifactsRepo = new LocalArtifactRepository();
    const settingsRepo = new LocalSettingsRepository();
    const roleRepo = new LocalRoleRepository();

    const { MockImageGenerationProvider } = await import('../lib/providers/mock');
    const genProvider = new MockImageGenerationProvider();

    const captured: { model?: string } = {};
    const spyQa = {
      async evaluate(
        candidates: { candidateIndex: number }[],
        minScore: number,
        _qaPrompt: string,
        _secretRef: string,
        model: string,
      ) {
        captured.model = model;
        return candidates.map((c) => ({
          candidateIndex: c.candidateIndex,
          score: minScore + 5,
          status: (c.candidateIndex === 0 ? 'accepted' : 'not_selected') as
            | 'accepted'
            | 'rejected'
            | 'not_selected',
          reason: 'ok',
          detailedJson: '{}',
        }));
      },
    };

    const personalizationProvider = new MockFuFireProvider();
    const podProvider = new MockPodProvider();
    const mailProvider = new MockMailProvider();

    const runner = new WorkflowRunner(
      productRepo,
      templatesRepo,
      workflowRepo,
      artifactsRepo,
      settingsRepo,
      roleRepo,
      genProvider,
      spyQa,
      personalizationProvider,
      podProvider,
      mailProvider,
    );

    await roleRepo.setActiveRole('Owner');

    // Seed a SENTINEL QA model (provider stays OpenRouter) so the routing assertion is
    // independent of the seed default (pass-through would yield the sentinel).
    const qaCfgs = await settingsRepo.getQualityConfigs();
    qaCfgs[0] = { ...qaCfgs[0], llmProvider: 'OpenRouter', model: QA_SENTINEL };
    await settingsRepo.saveQualityConfigs(qaCfgs);

    await runner.run('ORD-GATEWAY-2', 'prod-001', 'Gateway User', '2026-01-01', '14:00', true, 'London');

    const expected = selectModelForOperation('quality_gate', {});
    expect(captured.model).toBe(expected);
    // Must NOT be the raw configured sentinel — proves routing, not pass-through.
    expect(captured.model).not.toBe(QA_SENTINEL);
  });
});
