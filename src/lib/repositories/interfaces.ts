import { 
  Product, 
  ApiProvider, 
  ReferenceImage, 
  Role, 
  QualityGateConfig, 
  PersonalizationApiConfig 
} from '../domain/models';
import { 
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
} from '../../types';

export interface ProductRepository {
  getProducts(): Promise<Product[]>;
  saveProducts(products: Product[]): Promise<void>;
}

export interface TemplateRepository {
  getTemplates(): Promise<PromptTemplate[]>;
  saveTemplates(templates: PromptTemplate[]): Promise<void>;
}

export interface ProviderRepository {
  getProviders(): Promise<ApiProvider[]>;
  saveProvider(provider: ApiProvider): Promise<void>;
  performHealthCheck(providerId: string): Promise<ApiProvider['status']>;
}

export interface WorkflowRepository {
  getWorkflowRuns(): Promise<WorkflowRun[]>;
  saveWorkflowRuns(runs: WorkflowRun[]): Promise<void>;
  getWorkflowLogs(): Promise<WorkflowLog[]>;
  saveWorkflowLogs(logs: WorkflowLog[]): Promise<void>;
  getVisualWorkflows(): Promise<VisualWorkflow[]>;
  saveVisualWorkflow(productId: string, workflow: VisualWorkflow): Promise<void>;
  getVisualWorkflow(productId: string): Promise<VisualWorkflow>;
}

export interface ArtifactRepository {
  getImageArtifacts(): Promise<ImageArtifact[]>;
  saveImageArtifacts(artifacts: ImageArtifact[]): Promise<void>;
}

export interface RoleRepository {
  getRoles(): Promise<Role[]>;
  getPermissions(): Promise<Permission[]>;
  getRolePermissions(): Promise<RolePermissions[]>;
  saveRolePermissions(bindings: RolePermissions[]): Promise<void>;
  getUsers(): Promise<AppUser[]>;
  saveUsers(users: AppUser[]): Promise<void>;
  getActiveRole(): Promise<AppRoleName>;
  setActiveRole(role: AppRoleName): Promise<void>;
}

export interface SettingsRepository {
  getGenConfigs(): Promise<GenerationConfig[]>;
  saveGenConfigs(configs: GenerationConfig[]): Promise<void>;
  getQualityConfigs(): Promise<QualityGateConfig[]>;
  saveQualityConfigs(configs: QualityGateConfig[]): Promise<void>;
  getPersonalizationConfig(): Promise<PersonalizationApiConfig>;
  savePersonalizationConfig(config: PersonalizationApiConfig): Promise<void>;
  getPodConfig(): Promise<PodProviderConfig>;
  savePodConfig(config: PodProviderConfig): Promise<void>;
}
