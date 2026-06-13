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
  PodProviderConfig 
} from '../domain/models';

import {
  ProductRepository,
  TemplateRepository,
  ProviderRepository,
  WorkflowRepository,
  ArtifactRepository,
  RoleRepository,
  SettingsRepository
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
}

export class SupabaseProviderRepository implements ProviderRepository {
  async getProviders(): Promise<ApiProvider[]> {
    return notConfigured();
  }
  async saveProvider(): Promise<void> {
    return notConfigured();
  }
  async performHealthCheck(): Promise<ApiProvider['status']> {
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
