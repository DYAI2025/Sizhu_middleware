import { describe, it, expect } from 'vitest';
import { 
  renderPrompt, 
  WorkflowRunner 
} from '../lib/workflow/runner';
import { 
  LocalProductRepository, 
  LocalTemplateRepository, 
  LocalWorkflowRepository, 
  LocalArtifactRepository, 
  LocalSettingsRepository, 
  LocalRoleRepository,
  LocalProviderRepository
} from '../lib/repositories/localRepository';
import { 
  MockImageGenerationProvider, 
  MockQualityGateProvider, 
  MockFuFireProvider, 
  MockPodProvider, 
  MockMailProvider 
} from '../lib/providers/mock';
import { ApiProvider } from '../lib/domain/models';
import { secureMutateConfig } from '../lib/domain/permissions';
import { WorkflowStateMachine } from '../lib/workflow/stateMachine';
import { ISSUE_CATEGORIES, ISSUE_CODES } from '../lib/domain/issueTaxonomy';

describe('Bazzi Workflow System Tests', () => {

  // 1. Prompt template rendering with variables
  it('should render template variables correctly', () => {
    const template = 'Hello {{personalization.name}}, born in year {{fufire.birth_year}} with guide {{fufire.animal}}';
    const payload = {
      personalization: { name: 'Ben' },
      fufire: { birth_year: '2026', animal: 'Dragon' }
    };
    
    const rendered = renderPrompt(template, payload);
    expect(rendered).toBe('Hello Ben, born in year 2026 with guide Dragon');
  });

  // 2. Missing template variable returns a controlled error
  it('should throw controlled compilation error if variable is missing', () => {
    const template = 'Hello {{personalization.name}}, cosmic zodiac {{fufire.animal}} with element {{fufire.element}}';
    const payload = {
      personalization: { name: 'Ben' },
      fufire: { animal: 'Dragon' }
      // fufire.element is missing
    };

    expect(() => renderPrompt(template, payload)).toThrow(
      'Controlled compilation error: Required template variable "fufire.element" is missing or undefined.'
    );
  });

  // 3. Unknown birth time stores default noon correctly
  it('should store default noon and unknown indicators when birthTimeKnown is false', async () => {
    const mockFufire = new MockFuFireProvider();
    
    const result = await mockFufire.calculate(
      'Ben',
      '2026-06-12',
      '08:30', 
      false, // birthTimeKnown is false
      'London',
      {
        birth_time: '12:00',
        birth_time_known: false,
        birth_time_source: 'default_noon'
      }
    );

    expect(result.resolvedTime).toBe('12:00');
    expect(result.resolvedTimeSource).toBe('default_noon');
  });

  // 4, 5, 6, 7. Orchestrator and runner behavior with repository interfaces
  it('should create N image artifacts for N candidates, store statuses, handle escalation and observe observer constraints', async () => {
    // Instantiate Local repos (instantiated as mock data engines)
    const productRepo = new LocalProductRepository();
    const templatesRepo = new LocalTemplateRepository();
    const workflowRepo = new LocalWorkflowRepository();
    const artifactsRepo = new LocalArtifactRepository();
    const settingsRepo = new LocalSettingsRepository();
    const roleRepo = new LocalRoleRepository();

    // Setup providers
    const genProvider = new MockImageGenerationProvider();
    const qaProvider = new MockQualityGateProvider();
    const personalizationProvider = new MockFuFireProvider();
    const podProvider = new MockPodProvider();
    const mailProvider = new MockMailProvider();

    // Construct runner
    const runner = new WorkflowRunner(
      productRepo,
      templatesRepo,
      workflowRepo,
      artifactsRepo,
      settingsRepo,
      roleRepo,
      genProvider,
      qaProvider,
      personalizationProvider,
      podProvider,
      mailProvider
    );

    // Ensure we start with simulated Owner privilege to bypass permission block
    await roleRepo.setActiveRole('Owner');

    // Execute run
    const resultRun = await runner.run(
      'ORD-77491',
      'prod-001',
      'Test User',
      '2026-01-01',
      '14:00',
      true,
      'London'
    );

    // Verification of Workflow structure
    expect(resultRun).toBeDefined();
    expect(resultRun.orderNumber).toBe('ORD-77491');
    expect(resultRun.status).toBe('completed'); // Passed iteration 1 successfully in Mock gate!

    // Verify 4. Workflow creates N image artifacts for N candidates
    const postArtifacts = await artifactsRepo.getImageArtifacts();
    const newlyCreated = postArtifacts.filter(a => a.workflowRunId === resultRun.id);
    
    // In DEFAULT_GENERATION_CONFIGS, numInitiallyGenerated is 3
    expect(newlyCreated.length).toBe(3);

    // Verify 5. QA accepted/rejected/not_selected statuses are persisted
    const statuses = newlyCreated.map(a => a.status);
    expect(statuses).toContain('accepted');
    expect(statuses).toContain('rejected');
    expect(statuses).toContain('not_selected');

    // Verify 7. Observer cannot start simulation (Observer constraint test)
    await roleRepo.setActiveRole('Observer');
    
    await expect(runner.run(
      'ORD-INVALID',
      'prod-001',
      'Observer Thief',
      '2026-01-01',
      '14:00',
      true,
      'London'
    )).rejects.toThrow(
      "Permission Denied: User role \"Observer\" does not hold 'run_simulation' privileges."
    );
  });

  // Verify 6. Max rejected iterations triggers escalation event
  it('should escalated workflow run when max iterations fail', async () => {
    const productRepo = new LocalProductRepository();
    const templatesRepo = new LocalTemplateRepository();
    const workflowRepo = new LocalWorkflowRepository();
    const artifactsRepo = new LocalArtifactRepository();
    const settingsRepo = new LocalSettingsRepository();
    const roleRepo = new LocalRoleRepository();

    const genProvider = new MockImageGenerationProvider();
    
    // Setup a strict QA provider that always returns scores below minScore to guarantee escalation
    const badQaProvider = {
      async evaluate(candidates: any[], minScore: number) {
        return candidates.map(c => ({
          candidateIndex: c.candidateIndex,
          score: minScore - 10, // Always fail
          status: 'rejected' as const,
          reason: 'Intentional test failure',
          detailedJson: '{}'
        }));
      }
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
      badQaProvider,
      personalizationProvider,
      podProvider,
      mailProvider
    );

    await roleRepo.setActiveRole('Admin'); // Admin has execution rights

    const escalationResult = await runner.run(
      'ORD-99999',
      'prod-001',
      'Ben Poersch',
      '1995-10-12',
      '12:00',
      false,
      'London'
    );

    expect(escalationResult.status).toBe('escalated');
  });

  // Verify 8. Provider status label never shows LIVE without health check
  it('should report provider status honestly (never shows LIVE without real health check)', async () => {
    const providerRepo = new LocalProviderRepository();
    
    // Create an API provider that pretends to be LIVE
    const livePretender: ApiProvider = {
      id: 'prov-pretend',
      name: 'Fake Live Provider',
      type: 'image_generation',
      status: 'LIVE', // Pretending to be LIVE
      baseUrl: 'https://fake.openai.com',
      secretRef: 'SECRET_REF_NONE'
    };

    await providerRepo.saveProvider(livePretender);

    // Call dynamic performHealthCheck
    const verifiedStatus = await providerRepo.performHealthCheck('prov-pretend');
    
    // It should fallback to MOCK or honest state to ensure integrity
    expect(verifiedStatus).not.toBe('LIVE');
    expect(verifiedStatus).toBe('MOCK');
  });

  // NEW REQUIREMENT TESTS

  // 9. Verification that Observer role cannot mutate configurations on the permissions helper.
  it('should prevent Observer role from mutating configuration settings', () => {
    const originalConfig = {
      productId: 'prod-001',
      numInitiallyGenerated: 3,
      imageFormat: 'png' as const
    };

    // Attempting modification under Observer role
    expect(() => 
      secureMutateConfig('Observer', 'manage_products', originalConfig, (cfg) => {
        cfg.numInitiallyGenerated = 5;
      })
    ).toThrow(/Unauthorized mutation/);

    // Ensure state was not mutated (is immutable)
    expect(originalConfig.numInitiallyGenerated).toBe(3);

    // Success with Owner role
    const updated = secureMutateConfig('Owner', 'manage_products', originalConfig, (cfg) => {
      cfg.numInitiallyGenerated = 5;
    });
    expect(updated.numInitiallyGenerated).toBe(5);
  });

  // 10. Issue taxonomy validation
  it('should export all structured issue categories and key taxonomic codes', () => {
    expect(ISSUE_CATEGORIES.PERSONALIZATION).toContain('Zodiac');
    expect(ISSUE_CODES.NAME_MISMATCH.category).toBe('PERSONALIZATION');
    expect(ISSUE_CODES.POD_PAYLOAD_REJECTED.category).toBe('POD_DISPATCH');
    expect(ISSUE_CODES.WATERMARK_DETECTED.category).toBe('STYLE');
  });

  // 11. State machine transition block check
  it('should enforce state machine progression and forbid invalid mock POD dispatching', () => {
    // Transition validations
    expect(WorkflowStateMachine.canTransition('running', 'completed')).toBe(true);
    expect(WorkflowStateMachine.canTransition('completed', 'running')).toBe(false);

    const mockRun: any = { status: 'running', orderNumber: '001' };
    const rejectedArtifact: any = { id: 'art-re', status: 'rejected' };
    const acceptedArtifact: any = { id: 'art-ok', status: 'accepted' };

    // Fails because artifact is rejected
    expect(() => 
      WorkflowStateMachine.assertDispatchAllowed(mockRun, rejectedArtifact)
    ).toThrow(/State Machine Rejection/);

    // Allowed for accepted artifacts
    expect(() => 
      WorkflowStateMachine.assertDispatchAllowed(mockRun, acceptedArtifact)
    ).not.toThrow();
  });

});
