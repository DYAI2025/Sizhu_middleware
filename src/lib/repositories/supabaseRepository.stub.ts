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

const SUPABASE_OFFLINE_ERR = "Supabase integration is currently offline. Please configure active client secret keys.";

export class SupabaseProductRepository implements ProductRepository {
  async getProducts(): Promise<Product[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveProducts(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
}

export class SupabaseTemplateRepository implements TemplateRepository {
  async getTemplates(): Promise<PromptTemplate[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveTemplates(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
}

export class SupabaseProviderRepository implements ProviderRepository {
  async getProviders(): Promise<ApiProvider[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveProvider(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async performHealthCheck(): Promise<ApiProvider['status']> {
    return 'LIVE_DISABLED';
  }
}

export class SupabaseWorkflowRepository implements WorkflowRepository {
  async getWorkflowRuns(): Promise<WorkflowRun[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveWorkflowRuns(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getWorkflowLogs(): Promise<WorkflowLog[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveWorkflowLogs(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getVisualWorkflows(): Promise<VisualWorkflow[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveVisualWorkflow(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getVisualWorkflow(): Promise<VisualWorkflow> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
}

export class SupabaseArtifactRepository implements ArtifactRepository {
  async getImageArtifacts(): Promise<ImageArtifact[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveImageArtifacts(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
}

export class SupabaseRoleRepository implements RoleRepository {
  async getRoles(): Promise<Role[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getPermissions(): Promise<Permission[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getRolePermissions(): Promise<RolePermissions[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveRolePermissions(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getUsers(): Promise<AppUser[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveUsers(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getActiveRole(): Promise<AppRoleName> {
    return 'Observer';
  }
  async setActiveRole(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
}

export class SupabaseSettingsRepository implements SettingsRepository {
  async getGenConfigs(): Promise<GenerationConfig[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveGenConfigs(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getQualityConfigs(): Promise<QualityGateConfig[]> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async saveQualityConfigs(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getPersonalizationConfig(): Promise<PersonalizationApiConfig> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async savePersonalizationConfig(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async getPodConfig(): Promise<PodProviderConfig> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
  async savePodConfig(): Promise<void> {
    throw new Error(SUPABASE_OFFLINE_ERR);
  }
}
