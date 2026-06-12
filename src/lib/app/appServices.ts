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

const SUPABASE_OFFLINE_ERR = "Supabase integration is currently offline. Please configure active client secret keys.";

// Stub runner that matches interface but throws
const supabaseRunner = {
  run: async () => {
    throw new Error(SUPABASE_OFFLINE_ERR);
  },
  dispatchManualApproval: async () => {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
} as unknown as WorkflowRunner;

export const appServices = {
  getMode(): AppMode {
    return getAppMode();
  },
  
  get products() {
    return getAppMode() === 'DEMO_LOCAL' ? localProductRepo : supabaseProductRepo;
  },
  
  get templates() {
    return getAppMode() === 'DEMO_LOCAL' ? localTemplateRepo : supabaseTemplateRepo;
  },
  
  get workflows() {
    return getAppMode() === 'DEMO_LOCAL' ? localWorkflowRepo : supabaseWorkflowRepo;
  },
  
  get artifacts() {
    return getAppMode() === 'DEMO_LOCAL' ? localArtifactRepo : supabaseArtifactRepo;
  },
  
  get settings() {
    return getAppMode() === 'DEMO_LOCAL' ? localSettingsRepo : supabaseSettingsRepo;
  },
  
  get roles() {
    return getAppMode() === 'DEMO_LOCAL' ? localRoleRepo : supabaseRoleRepo;
  },
  
  get providers() {
    return getAppMode() === 'DEMO_LOCAL' ? localProviderRepo : supabaseProviderRepo;
  },
  
  get workflowRunner() {
    return getAppMode() === 'DEMO_LOCAL' ? localRunner : supabaseRunner;
  }
};
