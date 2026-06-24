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
import { LocalApprovalRepository } from '../repositories/approvalRepository';
import { ApiProductRepository } from '../repositories/apiProductRepository';
import {
  SupabaseTemplateRepository,
  SupabaseApprovalRepository
} from '../repositories/supabaseRepository.stub';
// Migrated data domains route through the SERVER data API (service-role behind
// apiGuard) — the browser uses Api* repos, NOT the throwing Supabase stubs.
import { ApiProviderRepository } from '../repositories/apiProviderRepository';
import { ApiWorkflowRepository } from '../repositories/apiWorkflowRepository';
import { ApiArtifactRepository } from '../repositories/apiArtifactRepository';
import { ApiRoleRepository } from '../repositories/apiRoleRepository';
import { ApiSettingsRepository } from '../repositories/apiSettingsRepository';
import { ApprovalRepository, ProductRepository } from '../repositories/interfaces';
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
const localApprovalRepo = new LocalApprovalRepository();

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
// Products go through the SERVER data API (service-role, behind apiGuard) — not
// browser-direct — so the non-DEMO_LOCAL repo is the ApiProductRepository (which
// fetches /api/v1/products with the current session token), NOT the throwing
// Supabase stub. The throwing SupabaseProductRepository stub is retained in
// supabaseRepository.stub.ts for the other (not-yet-migrated) domains.
const apiProductRepo = new ApiProductRepository();
const supabaseTemplateRepo = new SupabaseTemplateRepository();
const apiWorkflowRepo = new ApiWorkflowRepository();
const apiArtifactRepo = new ApiArtifactRepository();
const apiSettingsRepo = new ApiSettingsRepository();
const apiRoleRepo = new ApiRoleRepository();
const apiProviderRepo = new ApiProviderRepository();
const supabaseApprovalRepo = new SupabaseApprovalRepository();

// Stub runner that matches the runner's PUBLIC surface but throws the explicit,
// typed boundary error. AC-D-001a/b: outside DEMO_LOCAL the pipeline never runs
// against the local mock providers.
//
// L12: typed via `Pick<WorkflowRunner, 'run' | 'dispatchManualApproval'>` instead
// of `as unknown as WorkflowRunner`. Adding a NEW public method to WorkflowRunner
// without listing it here is a compile error at this site (the stub no longer
// satisfies the Pick), forcing the boundary stub to stay in lockstep with the
// real runner's public API. The single `as WorkflowRunner` projection is the only
// remaining cast (the facade exposes the full type for back-compat).
const supabaseRunner: Pick<WorkflowRunner, 'run' | 'dispatchManualApproval'> = {
  run: async () => {
    throw new SupabaseNotConfiguredError();
  },
  dispatchManualApproval: async () => {
    throw new SupabaseNotConfiguredError();
  }
};

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
  
  // DEMO_LOCAL → localStorage repo (browser pipeline). Every other mode → the
  // ApiProductRepository, which routes reads/writes through the SERVER data API
  // (/api/v1/products, service-role behind apiGuard) — never browser-direct.
  get products(): ProductRepository {
    return selectDependency<ProductRepository>(localProductRepo, apiProductRepo);
  },

  get templates() {
    return selectDependency(localTemplateRepo, supabaseTemplateRepo);
  },

  get workflows() {
    return selectDependency(localWorkflowRepo, apiWorkflowRepo);
  },

  get artifacts() {
    return selectDependency(localArtifactRepo, apiArtifactRepo);
  },

  get settings() {
    return selectDependency(localSettingsRepo, apiSettingsRepo);
  },

  get roles() {
    return selectDependency(localRoleRepo, apiRoleRepo);
  },

  get providers() {
    return selectDependency(localProviderRepo, apiProviderRepo);
  },

  // OQ-005: the approval store is the SOLE load-bearing money gate. In DEMO_LOCAL it is
  // the durable LocalApprovalRepository; in EVERY other mode it is the throwing Supabase
  // stub — so in production the store throws ⇒ the downstream dispatch gate fails CLOSED
  // (no store ⇒ no consumable approval ⇒ no real POD dispatch). Wired through the SAME
  // selectDependency() seam as every other repo (AC-D-001b: no Local* outside DEMO_LOCAL).
  get approvals(): ApprovalRepository {
    // Pin T to the interface: LocalApprovalRepository carries a test-only `reset()`
    // convenience the Supabase stub does not, so inference off the first arg would over-
    // constrain T. Both still satisfy the ApprovalRepository contract the facade exposes.
    return selectDependency<ApprovalRepository>(localApprovalRepo, supabaseApprovalRepo);
  },

  get workflowRunner(): WorkflowRunner {
    // The Supabase boundary stub implements only the public runner surface
    // (Pick<...>); the single explicit projection lives here so the facade keeps
    // exposing the full WorkflowRunner type for back-compat (L12).
    return selectDependency(localRunner, supabaseRunner as WorkflowRunner);
  }
};
