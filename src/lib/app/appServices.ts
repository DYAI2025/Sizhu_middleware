import { getAppMode, AppMode } from './appMode';
import { 
  LocalProductRepository, 
  LocalTemplateRepository, 
  LocalWorkflowRepository, 
  LocalArtifactRepository, 
  LocalSettingsRepository, 
  LocalRoleRepository,
  LocalProviderRepository
} from '../repositories/localRepository';
import { 
  SupabaseProductRepository, 
  SupabaseTemplateRepository, 
  SupabaseWorkflowRepository, 
  SupabaseArtifactRepository, 
  SupabaseSettingsRepository, 
  SupabaseRoleRepository,
  SupabaseProviderRepository
} from '../repositories/supabaseRepository.stub';
import { 
  MockImageGenerationProvider, 
  MockQualityGateProvider, 
  MockFuFireProvider, 
  MockPodProvider, 
  MockMailProvider 
} from '../providers/mock';
import { WorkflowRunner } from '../workflow/runner';
import { SupabaseNotConfiguredError } from '../repositories/errors';

// Singletons for Local Mode
const localProductRepo = new LocalProductRepository();
const localTemplateRepo = new LocalTemplateRepository();
const localWorkflowRepo = new LocalWorkflowRepository();
const localArtifactRepo = new LocalArtifactRepository();
const localSettingsRepo = new LocalSettingsRepository();
const localRoleRepo = new LocalRoleRepository();
const localProviderRepo = new LocalProviderRepository();

const mockGen = new MockImageGenerationProvider();
const mockQa = new MockQualityGateProvider();
const mockFuFire = new MockFuFireProvider();
const mockPod = new MockPodProvider();
const mockMail = new MockMailProvider();

const localRunner = new WorkflowRunner(
  localProductRepo,
  localTemplateRepo,
  localWorkflowRepo,
  localArtifactRepo,
  localSettingsRepo,
  localRoleRepo,
  mockGen,
  mockQa,
  mockFuFire,
  mockPod,
  mockMail
);

// Singletons for Supabase Mode
const supabaseProductRepo = new SupabaseProductRepository();
const supabaseTemplateRepo = new SupabaseTemplateRepository();
const supabaseWorkflowRepo = new SupabaseWorkflowRepository();
const supabaseArtifactRepo = new SupabaseArtifactRepository();
const supabaseSettingsRepo = new SupabaseSettingsRepository();
const supabaseRoleRepo = new SupabaseRoleRepository();
const supabaseProviderRepo = new SupabaseProviderRepository();

// Stub runner that matches interface but throws the explicit, typed boundary error.
// AC-D-001a/b: outside DEMO_LOCAL the pipeline never runs against the local mock providers.
const supabaseRunner = {
  run: async () => {
    throw new SupabaseNotConfiguredError();
  },
  dispatchManualApproval: async () => {
    throw new SupabaseNotConfiguredError();
  }
} as unknown as WorkflowRunner;

/**
 * AC-D-001b/d — single, explicit selection guard. The production-vs-DEMO_LOCAL
 * boundary is read from the REAL getAppMode() resolver (not a re-implemented check),
 * and a Local* dependency may ONLY be returned in DEMO_LOCAL. This makes the
 * "no silent mock outside DEMO_LOCAL" invariant a single testable site.
 */
function selectDependency<T>(local: T, supabase: T): T {
  return getAppMode() === 'DEMO_LOCAL' ? local : supabase;
}

export const appServices = {
  getMode(): AppMode {
    return getAppMode();
  },
  
  get products() {
    return selectDependency(localProductRepo, supabaseProductRepo);
  },

  get templates() {
    return selectDependency(localTemplateRepo, supabaseTemplateRepo);
  },

  get workflows() {
    return selectDependency(localWorkflowRepo, supabaseWorkflowRepo);
  },

  get artifacts() {
    return selectDependency(localArtifactRepo, supabaseArtifactRepo);
  },

  get settings() {
    return selectDependency(localSettingsRepo, supabaseSettingsRepo);
  },

  get roles() {
    return selectDependency(localRoleRepo, supabaseRoleRepo);
  },

  get providers() {
    return selectDependency(localProviderRepo, supabaseProviderRepo);
  },

  get workflowRunner() {
    return selectDependency(localRunner, supabaseRunner);
  }
};
