import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowRunner } from '../lib/workflow/runner';
import {
  LocalProductRepository,
  LocalTemplateRepository,
  LocalWorkflowRepository,
  LocalArtifactRepository,
  LocalSettingsRepository,
  LocalRoleRepository,
} from '../lib/repositories/localRepository';
import {
  MockFuFireProvider,
  MockPodProvider,
  MockMailProvider,
  MockQualityGateProvider,
} from '../lib/providers/mock';

/**
 * CONTRACT — REQ-LGQ-005 wiring: the runner ACTUALLY redacts the literal PII from the
 * compiled prompt BEFORE handing it to the image provider (the helper working in
 * isolation is not enough — the Gegenthese is "is it CALLED on the real path?").
 *
 * A spy image provider captures the exact prompt the runner forwards; the template
 * content embeds sentinel PII + real art direction. After the run, the captured
 * prompt must contain NO sentinel but MUST retain the art direction (fidelity).
 */

const PII_NAME = 'SENTINEL_NAME_Qx7_Aldebaran';
const PII_DATE = 'SENTINEL_DATE_1991-07-23_Qx7';
const PII_PLACE = 'SENTINEL_PLACE_Vega-IV_Qx7';
const PII_TIME = 'SENTINEL_TIME_03h14_Qx7';
const ART = 'Watercolor celestial totem with intricate gold linework';

describe('REQ-LGQ-005 — the runner strips literal PII from the prompt before generate(), keeps art direction', () => {
  beforeEach(() => {
    process.env.VITEST = 'true';
  });

  it('the prompt the image provider receives has no raw birth PII but retains the art direction', async () => {
    const productRepo = new LocalProductRepository();
    const templatesRepo = new LocalTemplateRepository();
    const settingsRepo = new LocalSettingsRepository();
    const roleRepo = new LocalRoleRepository();

    // Seed a template whose content literally carries the run's PII + art direction.
    const templates = await templatesRepo.getTemplates();
    const product = (await productRepo.getProducts())[0];
    const active = templates.find((t) => t.id === product.activeTemplateId) ?? templates[0];
    await templatesRepo.saveTemplates(
      templates.map((t) =>
        t.id === active.id
          ? {
              ...t,
              status: 'active' as const,
              content: `${ART} for ${PII_NAME}, born ${PII_DATE} at ${PII_TIME} in ${PII_PLACE}.`,
            }
          : t,
      ),
    );

    const captured: string[] = [];
    const spyGen = {
      async generate(prompt: string, n: number) {
        captured.push(prompt);
        return Array.from({ length: n }, (_v, i) => ({
          candidateIndex: i,
          storagePath: 'data:image/png;base64,iVBORw0KGgo',
          metadata: { promptUsed: 'p', model: 'm', provider: 'OpenRouter', quality: 'hd', resolution: '1024x1024', usdCost: 0 },
        }));
      },
    };

    const runner = new WorkflowRunner(
      productRepo,
      templatesRepo,
      new LocalWorkflowRepository(),
      new LocalArtifactRepository(),
      settingsRepo,
      roleRepo,
      spyGen as any,
      new MockQualityGateProvider(),
      new MockFuFireProvider(),
      new MockPodProvider(),
      new MockMailProvider(),
    );
    await roleRepo.setActiveRole('Owner');

    await runner.run('ORD-REDACT-1', product.id, PII_NAME, PII_DATE, PII_TIME, true, PII_PLACE);

    expect(captured.length).toBeGreaterThan(0);
    const prompt = captured[0];
    expect(prompt).not.toContain(PII_NAME);
    expect(prompt).not.toContain(PII_DATE);
    expect(prompt).not.toContain(PII_PLACE);
    expect(prompt).not.toContain(PII_TIME); // birth-time surface (raw + resolvedTime) redacted
    // Fidelity: the art direction survives the redaction (anti-tautology).
    expect(prompt).toContain('Watercolor celestial totem');
    expect(prompt).toContain('intricate gold linework');
    // Mutation RED: remove the runner's redactKnownPiiValues(compiledPrompt, piiValues)
    // call → the raw sentinels reach the provider.
  });
});
