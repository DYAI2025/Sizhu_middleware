/**
 * Bazzi Middleware Platform - Supabase Repository Stub
 * Implements the domain contracts as stubs, showing clean offline behavior.
 */

import { 
  Product, 
  ApiProvider, 
  Role, 
  QualityGateConfig, 
  PersonalizationApiConfig,
  PromptTemplate, 
  WorkflowRun, 
  ImageArtifact, 
  WorkflowLog, 
  VisualWorkflow, 
  AppUser, 
  AppRoleName, 
  Permission, 
  RolePermissions, 
  GenerationConfig,
  PodProviderConfig,
  DispatchApproval
} from '../domain/models';

import {
  ProductRepository,
  TemplateRepository,
  ProviderRepository,
  WorkflowRepository,
  ArtifactRepository,
  RoleRepository,
  SettingsRepository,
  ApprovalRepository,
  ConsumeApprovalResult
} from './interfaces';

import { SupabaseNotConfiguredError } from './errors';

// AC-D-001a: outside DEMO_LOCAL the persistence boundary raises an EXPLICIT, typed
// error carrying the machine-readable SUPABASE_NOT_CONFIGURED code — never a vague
// "offline" string and never a silent mock/localStorage fallback.
function notConfigured(): never {
  throw new SupabaseNotConfiguredError();
}

export class SupabaseProductRepository implements ProductRepository {
  async getProducts(): Promise<Product[]> {
    return notConfigured();
  }
  async saveProducts(): Promise<void> {
    return notConfigured();
  }
}

export class SupabaseTemplateRepository implements TemplateRepository {
  async getTemplates(): Promise<PromptTemplate[]> {
    return notConfigured();
  }
  async saveTemplates(): Promise<void> {
    return notConfigured();
  }
  // Granular ops (REQ-001, Slice-1): contract present; real Supabase persistence
  // is a later gated task. Until then they fail closed like every other write.
  async saveTemplate(): Promise<PromptTemplate> {
    return notConfigured();
  }
  async setActive(): Promise<void> {
    return notConfigured();
  }
  async listVersions(): Promise<PromptTemplate[]> {
    return notConfigured();
  }
}

export class SupabaseProviderRepository implements ProviderRepository {
  async getProviders(): Promise<ApiProvider[]> {
    return notConfigured();
  }
  async saveProvider(): Promise<void> {
    return notConfigured();
  }
  async performHealthCheck(): Promise<ApiProvider['status']> {
    // AC-D-001a carve-out (DELIBERATE, not an oversight): a health-check is a
    // UX-mirror READ, not a persistence side effect. It must fail SAFE to a
    // non-LIVE/non-success status rather than throw — so the console never paints
    // a provider as LIVE when Supabase is offline. The real authz/persistence
    // boundary still throws notConfigured() for every write/read of state.
    return 'LIVE_DISABLED';
  }
}

export class SupabaseWorkflowRepository implements WorkflowRepository {
  async getWorkflowRuns(): Promise<WorkflowRun[]> {
    return notConfigured();
  }
  async saveWorkflowRuns(): Promise<void> {
    return notConfigured();
  }
  async getWorkflowLogs(): Promise<WorkflowLog[]> {
    return notConfigured();
  }
  async saveWorkflowLogs(): Promise<void> {
    return notConfigured();
  }
  async getVisualWorkflows(): Promise<VisualWorkflow[]> {
    return notConfigured();
  }
  async saveVisualWorkflow(): Promise<void> {
    return notConfigured();
  }
  async getVisualWorkflow(): Promise<VisualWorkflow> {
    return notConfigured();
  }
}

export class SupabaseArtifactRepository implements ArtifactRepository {
  async getImageArtifacts(): Promise<ImageArtifact[]> {
    return notConfigured();
  }
  async saveImageArtifacts(): Promise<void> {
    return notConfigured();
  }
}

// AC (OQ-005): the approval store is the SOLE load-bearing money gate. Outside
// DEMO_LOCAL every method MUST throw the explicit, typed boundary error — never a
// fake-success / mock fallback. A throwing store makes the downstream dispatch gate
// fail CLOSED: no readable/writable approval record ⇒ no consume ⇒ no real POD
// dispatch. There is NO read carve-out here (unlike provider health / active role,
// which are UX mirrors): a money gate that silently "reads" an approval would be a
// fictional gate, so getApproval/consumeApproval throw too.
export class SupabaseApprovalRepository implements ApprovalRepository {
  async createApproval(): Promise<DispatchApproval> {
    return notConfigured();
  }
  async getApproval(): Promise<DispatchApproval | null> {
    return notConfigured();
  }
  async consumeApproval(): Promise<ConsumeApprovalResult> {
    return notConfigured();
  }
}

export class SupabaseRoleRepository implements RoleRepository {
  async getRoles(): Promise<Role[]> {
    return notConfigured();
  }
  async getPermissions(): Promise<Permission[]> {
    return notConfigured();
  }
  async getRolePermissions(): Promise<RolePermissions[]> {
    return notConfigured();
  }
  async saveRolePermissions(): Promise<void> {
    return notConfigured();
  }
  async getUsers(): Promise<AppUser[]> {
    return notConfigured();
  }
  async saveUsers(): Promise<void> {
    return notConfigured();
  }
  async getActiveRole(): Promise<AppRoleName> {
    // AC-D-001a carve-out (DELIBERATE, not an oversight): the active role is a
    // UX-mirror READ used to render the client shell. It fails SAFE to the
    // LOWEST-privilege role ('Observer', view-only) instead of throwing — so a
    // misread can never escalate. Real authorization is enforced SERVER-SIDE
    // (apiGuard + role/MFA checks), not by this client-side mirror; every
    // role-MUTATING op (setActiveRole, saveRolePermissions, …) still throws
    // notConfigured().
    return 'Observer';
  }
  async setActiveRole(): Promise<void> {
    return notConfigured();
  }
}

export class SupabaseSettingsRepository implements SettingsRepository {
  async getGenConfigs(): Promise<GenerationConfig[]> {
    return notConfigured();
  }
  async saveGenConfigs(): Promise<void> {
    return notConfigured();
  }
  async getQualityConfigs(): Promise<QualityGateConfig[]> {
    return notConfigured();
  }
  async saveQualityConfigs(): Promise<void> {
    return notConfigured();
  }
  async getPersonalizationConfig(): Promise<PersonalizationApiConfig> {
    return notConfigured();
  }
  async savePersonalizationConfig(): Promise<void> {
    return notConfigured();
  }
  async getPodConfig(): Promise<PodProviderConfig> {
    return notConfigured();
  }
  async savePodConfig(): Promise<void> {
    return notConfigured();
  }
}
