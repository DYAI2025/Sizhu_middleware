/**
 * Bazzi Middleware Platform - Local Storage Repository Implementation
 * Explicit implementation of all interfaces storing data in client localStorage.
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

import { DEFAULT_ROLE_PERMISSIONS } from '../domain/permissions';

// Default mock seeds
const DEFAULT_USERS: AppUser[] = [
  { id: 'usr-001', email: 'Ben.Poersch@gmail.com', role: 'Owner', createdAt: new Date('2026-01-15').toISOString() },
  { id: 'usr-002', email: 'clara.admin@bazziprint.com', role: 'Admin', createdAt: new Date('2026-03-01').toISOString() },
  { id: 'usr-003', email: 'sam.observer@bazziprint.com', role: 'Observer', createdAt: new Date('2026-03-12').toISOString() },
  { id: 'usr-004', email: 'custom.agent@bazziprint.com', role: 'Custom', createdAt: new Date('2026-05-20').toISOString() }
];

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    shopProvider: 'Etsy',
    externalProductId: 'etsy-8842103',
    externalVariantId: 'var-99412',
    title: 'Divine Astrology Birth Chart Map (Canvas)',
    productType: 'Home Decor',
    isActive: true,
    activeTemplateId: 'temp-001',
    createdAt: new Date('2026-03-10').toISOString()
  },
  {
    id: 'prod-002',
    shopProvider: 'Eatsy',
    externalProductId: 'eatsy-2239481',
    externalVariantId: 'var-11029',
    title: 'Ethereal Cosmic Guardian Animal Print',
    productType: 'Fine Art Print',
    isActive: true,
    activeTemplateId: 'temp-002',
    createdAt: new Date('2026-04-12').toISOString()
  },
  {
    id: 'prod-003',
    shopProvider: 'Etsy',
    externalProductId: 'etsy-4458810',
    externalVariantId: 'var-55319',
    title: 'Elemental Soul Path Guided Map',
    productType: 'Hardcover Poster',
    isActive: false,
    createdAt: new Date('2026-05-01').toISOString()
  }
];

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'temp-001',
    name: 'Astrological Birth Constellation Map Prompt',
    content: `# Cosmic Astrological Prompt Template v2\nDefine the astrological alignment for order Reference: {{order.order_number}}\nCreate a highly intricate, high-contrast celestial star map.\nThe central sphere represents the celestial coordinates at date {{personalization.birth_date}} and time {{personalization.birth_time}} (Source verification: {{personalization.birth_time_source}}).\nPlace the observer location at coordinates derived from {{personalization.birth_place}}.\n\nVisual Guidelines:\n- Style: Celestial vintage engraving, deep indigo slate watercolor splash background, gold leaf vector accents.\n- Core animal spirit guide: {{fufire.animal}}\n- Primary elemental aura: {{fufire.dominant_element}} (derived Dominant Element)\n- Background: Pitch black star field overlay with subtle nebula smoke.\n- Aspect Ratio: 4:5 vertical poster alignment.`,
    version: 2,
    status: 'active',
    createdAt: new Date('2026-03-15').toISOString(),
    createdBy: 'Owner'
  },
  {
    id: 'temp-002',
    name: 'Cosmic Spirit Guardian Prompt',
    content: `# Guardian Elemental Totem Prompt v1\nGenerate an ethereal portrait of the Customer's Cosmic Totem: {{personalization.name}}\nBorn in the year: {{fufire.birth_year}}\nDynamic Animal Profile: {{fufire.animal}} with the elemental aspect of {{fufire.element}}.\n\nMandatory Specifications:\n- Depict a majestic {{fufire.animal}} radiating with pure {{fufire.element}} particle systems.\n- Centered, symmetrical canvas framing.\n- Masterpiece quality, detailed fur shading, high contrast shadows.\n- No text overlays, no human features, pure mythical illustration.`,
    version: 1,
    status: 'active',
    createdAt: new Date('2026-04-15').toISOString(),
    createdBy: 'Admin'
  }
];

const DEFAULT_PROVIDERS: ApiProvider[] = [
  { id: 'prov-001', name: 'FuFire Personalization API', type: 'personalization', status: 'MOCK', baseUrl: 'https://api.fufire.io/v1/personalization', secretRef: 'SECRET_REF_FUFIRE_LIVE_KEY' },
  { id: 'prov-002', name: 'OpenAI Image Generator', type: 'image_generation', status: 'MOCK', baseUrl: 'https://api.openai.v1/images', secretRef: 'SECRET_REF_OPENAI_MAIN' },
  { id: 'prov-003', name: 'Gemini QA Vision LLM', type: 'quality_gate', status: 'MOCK', baseUrl: 'https://generativelanguage.googleapis.com', secretRef: 'SECRET_REF_GEMINI_QA' },
  { id: 'prov-004', name: 'Gelato POD Engine', type: 'pod', status: 'MOCK', baseUrl: 'https://api.gelato.com/v2/orders', secretRef: 'SECRET_REF_GELATO_PROD_TOKEN' },
  { id: 'prov-005', name: 'Postmark Email Dispatcher', type: 'mail', status: 'CONFIGURED', baseUrl: 'https://api.postmarkapp.com/email', secretRef: 'SECRET_REF_POSTMARK_KEY' }
];

const DEFAULT_GENERATION_CONFIGS: GenerationConfig[] = [
  {
    productId: 'prod-001',
    numInitiallyGenerated: 3,
    imageFormat: 'png',
    imageQuality: 'hd',
    primaryProvider: 'OpenAI',
    primaryModel: 'dall-e-3',
    primarySecretRef: 'SECRET_REF_OPENAI_MAIN',
    fallbackProvider: 'Gemini',
    fallbackModel: 'imagen-3.0-generate-002',
    fallbackLLM: 'gemini-1.5-pro',
    fallbackSecretRef: 'SECRET_REF_GEMINI_FALLBACK'
  },
  {
    productId: 'prod-002',
    numInitiallyGenerated: 2,
    imageFormat: 'png',
    imageQuality: 'standard',
    primaryProvider: 'Gemini',
    primaryModel: 'imagen-3.0-generate-002',
    primarySecretRef: 'SECRET_REF_GEMINI_MAIN',
    fallbackProvider: 'Stability',
    fallbackModel: 'stable-diffusion-xl-1.0',
    fallbackLLM: 'gemini-2.5-pro',
    fallbackSecretRef: 'SECRET_REF_SD_FALLBACK'
  }
];

const DEFAULT_QUALITY_GATE_CONFIGS: QualityGateConfig[] = [
  {
    productId: 'prod-001',
    llmProvider: 'Gemini',
    model: 'gemini-2.5-pro',
    secretRef: 'SECRET_REF_GEMINI_QA',
    fallbackProvider: 'OpenAI',
    fallbackModel: 'gpt-4o',
    fallbackSecretRef: 'SECRET_REF_GPT_QA_FALLBACK',
    qaPrompt: 'Evaluate stars alignment...',
    referenceImages: [],
    faultTolerance: 'low',
    minAcceptanceScore: 82,
    maxRejectedBeforeEscalation: 2,
    escalationEmailTemplate: `To: support@bazziprint.com\nSubject: [ESCALATION] Order Personalization Blocked - Ref #{{order_number}}\n\nFailed iteration threshold reached.`
  },
  {
    productId: 'prod-002',
    llmProvider: 'OpenAI',
    model: 'gpt-4o',
    secretRef: 'SECRET_REF_OPENAI_QA',
    fallbackProvider: 'Gemini',
    fallbackModel: 'gemini-2.5-flash',
    fallbackSecretRef: 'SECRET_REF_GEMINI_QA_FALLBACK',
    qaPrompt: 'Analyze the spirit animal totem image. Ensure it details a majestic animal portrait with striking elemental features (fire/water/earth effects) and is centered. Report any distortion, blurred limbs, or bad gradients.',
    referenceImages: [],
    faultTolerance: 'medium',
    minAcceptanceScore: 78,
    maxRejectedBeforeEscalation: 3,
    escalationEmailTemplate: `Subject: QA Warning - Escalation Ticket for Order {{order_number}}\nA cosmic totem image generation failed to pass Bazzi Quality Gate 1 within {{iteration_count}} iterations.\nProduct: {{product_title}}\nOrder Details: {{workflow_run_url}}`
  }
];

const DEFAULT_PERSONALIZATION_CONFIG: PersonalizationApiConfig = {
  name: 'FuFire API',
  baseUrl: 'https://api.fufire.space',
  apiKeySecretRef: 'SECRET_REF_FUFIRE',
  enabled: true,
  endpointPaths: {
    chronometryResolve: '/v1/chronometry/resolve',
    bazi: '/v1/calculate/bazi',
    baziTrace: '/v1/calculate/bazi/trace',
    wuxing: '/v1/calculate/wuxing'
  },
  defaultStandard: 'CIVIL',
  defaultBoundary: 'midnight',
  ambiguousTimePolicy: 'earlier',
  nonexistentTimePolicy: 'error',
  timeoutMs: 10000,
  retryCount: 3,
  healthStatus: 'unknown'
};

const DEFAULT_POD_CONFIG: PodProviderConfig = {
  id: 'pod-001',
  name: 'Gelato POD Default Engine',
  baseUrl: 'https://api.gelato.com/v2/orders',
  secretRef: 'SECRET_REF_GELATO_PROD_TOKEN',
  dispatchMode: 'draft',
  productUidMappings: {
    'prod-001': 'canvas-40x50-engraved-vintage-gold',
    'prod-002': 'fineartpaper-30x40-spirit-totem',
    'prod-003': 'poster-hardcover-soul-path-2026'
  }
};

const DEFAULT_ROLES: Role[] = [
  { role: 'Owner', description: 'Full account ownership. Can modify billing, configurations, credentials and permissions.' },
  { role: 'Admin', description: 'Full operational access. Can configure templates, products, and triggers.' },
  { role: 'Observer', description: 'Read-only access. Can inspect dashboards, logs, but is blocked from writing.' },
  { role: 'Custom', description: 'Restricted set of permissions dynamically configured by team Administrators.' }
];

const DEFAULT_PERMISSIONS: Permission[] = [
  { id: 'view_dashboard', name: 'View Dashboard', description: 'Access dashboard metrics and active timeline streams' },
  { id: 'manage_products', name: 'Manage Products', description: 'Create, edit, and bind prompt templates to shop product catalog' },
  { id: 'manage_templates', name: 'Manage Templates', description: 'Upload, modify, version, and edit Markdown prompt blueprints' },
  { id: 'manage_credentials', name: 'Manage Credentials', description: 'View, add, and override secure API tokens & credentials' },
  { id: 'run_simulation', name: 'Run Simulator', description: 'Initiate simulation order workflows and webhook pipelines' },
  { id: 'manage_roles', name: 'Modify Roles & Permissions', description: 'Adjust granular permission matrix assignments for roles/team members' }
];

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const memoryStore: Record<string, string> = {};

// Clean isolated helper for localStorage
function getStorageItem<T>(key: string, defaultVal: T): T {
  try {
    const data = isBrowser 
      ? localStorage.getItem(`bazzi_${key}`) 
      : memoryStore[`bazzi_${key}`];
    return data ? JSON.parse(data) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function setStorageItem(key: string, data: any): void {
  try {
    if (isBrowser) {
      localStorage.setItem(`bazzi_${key}`, JSON.stringify(data));
    } else {
      memoryStore[`bazzi_${key}`] = JSON.stringify(data);
    }
  } catch (e) {}
}

export class LocalProductRepository implements ProductRepository {
  async getProducts(): Promise<Product[]> {
    return getStorageItem<Product[]>('products', DEFAULT_PRODUCTS);
  }
  async saveProducts(products: Product[]): Promise<void> {
    setStorageItem('products', products);
  }
}

export class LocalTemplateRepository implements TemplateRepository {
  async getTemplates(): Promise<PromptTemplate[]> {
    return getStorageItem<PromptTemplate[]>('templates', DEFAULT_TEMPLATES);
  }
  async saveTemplates(templates: PromptTemplate[]): Promise<void> {
    setStorageItem('templates', templates);
  }
}

export class LocalProviderRepository implements ProviderRepository {
  async getProviders(): Promise<ApiProvider[]> {
    return getStorageItem<ApiProvider[]>('api_providers_list', DEFAULT_PROVIDERS);
  }
  async saveProvider(provider: ApiProvider): Promise<void> {
    const list = await this.getProviders();
    const index = list.findIndex(p => p.id === provider.id);
    if (index !== -1) {
      list[index] = provider;
    } else {
      list.push(provider);
    }
    setStorageItem('api_providers_list', list);
  }
  async performHealthCheck(providerId: string): Promise<ApiProvider['status']> {
    const list = await this.getProviders();
    const found = list.find(p => p.id === providerId);
    if (!found) return 'ERROR';
    // Emforce that it never says LIVE without a true implemented health check execution
    return 'MOCK';
  }
}

export class LocalWorkflowRepository implements WorkflowRepository {
  async getWorkflowRuns(): Promise<WorkflowRun[]> {
    return getStorageItem<WorkflowRun[]>('workflow_runs', []);
  }
  async saveWorkflowRuns(runs: WorkflowRun[]): Promise<void> {
    setStorageItem('workflow_runs', runs);
  }
  async getWorkflowLogs(): Promise<WorkflowLog[]> {
    return getStorageItem<WorkflowLog[]>('workflow_logs', []);
  }
  async saveWorkflowLogs(logs: WorkflowLog[]): Promise<void> {
    setStorageItem('workflow_logs', logs);
  }
  async getVisualWorkflows(): Promise<VisualWorkflow[]> {
    return getStorageItem<VisualWorkflow[]>('visual_workflows', []);
  }
  async saveVisualWorkflow(productId: string, workflow: VisualWorkflow): Promise<void> {
    const list = await this.getVisualWorkflows();
    const filtered = list.filter(w => w.productId !== productId);
    filtered.push(workflow);
    setStorageItem('visual_workflows', filtered);
  }
  async getVisualWorkflow(productId: string): Promise<VisualWorkflow> {
    const list = await this.getVisualWorkflows();
    const found = list.find(w => w.productId === productId);
    if (found) return found;

    // Build standard initial representation
    return {
      productId,
      nodes: [],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

export class LocalArtifactRepository implements ArtifactRepository {
  async getImageArtifacts(): Promise<ImageArtifact[]> {
    return getStorageItem<ImageArtifact[]>('image_artifacts', []);
  }
  async saveImageArtifacts(artifacts: ImageArtifact[]): Promise<void> {
    setStorageItem('image_artifacts', artifacts);
  }
}

export class LocalRoleRepository implements RoleRepository {
  async getRoles(): Promise<Role[]> {
    return DEFAULT_ROLES;
  }
  async getPermissions(): Promise<Permission[]> {
    return DEFAULT_PERMISSIONS;
  }
  async getRolePermissions(): Promise<RolePermissions[]> {
    return getStorageItem<RolePermissions[]>('role_permissions', DEFAULT_ROLE_PERMISSIONS);
  }
  async saveRolePermissions(bindings: RolePermissions[]): Promise<void> {
    setStorageItem('role_permissions', bindings);
  }
  async getUsers(): Promise<AppUser[]> {
    return getStorageItem<AppUser[]>('users', DEFAULT_USERS);
  }
  async saveUsers(users: AppUser[]): Promise<void> {
    setStorageItem('users', users);
  }
  async getActiveRole(): Promise<AppRoleName> {
    return getStorageItem<AppRoleName>('active_role', 'Owner');
  }
  async setActiveRole(role: AppRoleName): Promise<void> {
    setStorageItem('active_role', role);
  }
}

export class LocalSettingsRepository implements SettingsRepository {
  async getGenConfigs(): Promise<GenerationConfig[]> {
    return getStorageItem<GenerationConfig[]>('gen_configs', DEFAULT_GENERATION_CONFIGS);
  }
  async saveGenConfigs(configs: GenerationConfig[]): Promise<void> {
    setStorageItem('gen_configs', configs);
  }
  async getQualityConfigs(): Promise<QualityGateConfig[]> {
    return getStorageItem<QualityGateConfig[]>('quality_configs', DEFAULT_QUALITY_GATE_CONFIGS);
  }
  async saveQualityConfigs(configs: QualityGateConfig[]): Promise<void> {
    setStorageItem('quality_configs', configs);
  }
  async getPersonalizationConfig(): Promise<PersonalizationApiConfig> {
    return getStorageItem<PersonalizationApiConfig>('personalization_config', DEFAULT_PERSONALIZATION_CONFIG);
  }
  async savePersonalizationConfig(config: PersonalizationApiConfig): Promise<void> {
    setStorageItem('personalization_config', config);
  }
  async getPodConfig(): Promise<PodProviderConfig> {
    return getStorageItem<PodProviderConfig>('pod_config', DEFAULT_POD_CONFIG);
  }
  async savePodConfig(config: PodProviderConfig): Promise<void> {
    setStorageItem('pod_config', config);
  }
}
