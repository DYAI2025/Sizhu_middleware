/**
 * Bazzi Middleware Console
 * DB Mock Storage & Service Core
 * Implements Supabase client mocks, Postgres table replicas (persist in localStorage),
 * and the main automated personalization pipeline.
 */

import {
  ShopProduct,
  PromptTemplate,
  GenerationConfig,
  QualityGate1Config,
  PersonalizationConfig,
  PodProviderConfig,
  WorkflowRun,
  ImageArtifact,
  WorkflowLog,
  AppRole,
  RolePermissions,
  AppRoleName,
  VisualWorkflow,
  AppUser
} from './types';

// ==========================================
// 1. Initial State & Schema Declarations
// ==========================================

const DEFAULT_USERS: AppUser[] = [
  { id: 'usr-001', email: 'Ben.Poersch@gmail.com', role: 'Owner', createdAt: new Date('2026-01-15').toISOString() },
  { id: 'usr-002', email: 'clara.admin@bazziprint.com', role: 'Admin', createdAt: new Date('2026-03-01').toISOString() },
  { id: 'usr-003', email: 'sam.observer@bazziprint.com', role: 'Observer', createdAt: new Date('2026-03-12').toISOString() },
  { id: 'usr-004', email: 'custom.agent@bazziprint.com', role: 'Custom', createdAt: new Date('2026-05-20').toISOString() }
];

const DEFAULT_WORKFLOWS: VisualWorkflow[] = [
  {
    productId: 'prod-001',
    nodes: [
      {
        id: 'node-pc',
        type: 'personalization',
        title: 'Personalization API',
        description: 'Queries native birth maps & elements via webhook',
        x: 60,
        y: 190,
        config: { name: 'FuFire API Portal', apiUrl: 'https://api.fufire.io/v1/personalization', secretRef: 'SECRET_REF_FUFIRE_LIVE_KEY' }
      },
      {
        id: 'node-template',
        type: 'template',
        title: 'Prompt Template Selection',
        description: 'Compiles coordinates into fine art instruction prompts',
        x: 270,
        y: 190,
        config: { templateId: 'temp-001' }
      },
      {
        id: 'node-generation',
        type: 'generation',
        title: 'Image Generation Stage',
        description: 'Generates image candidate swarm variants dynamically',
        x: 480,
        y: 190,
        config: {
          numInitiallyGenerated: 3,
          imageFormat: 'png',
          imageQuality: 'hd',
          primaryProvider: 'OpenAI',
          primaryModel: 'dall-e-3',
          primarySecretRef: 'SECRET_REF_OPENAI_MAIN',
          fallbackProvider: 'Gemini',
          fallbackModel: 'imagen-3.0-generate-002',
          fallbackSecretRef: 'SECRET_REF_GEMINI_FALLBACK'
        }
      },
      {
        id: 'node-quality',
        type: 'quality_gate',
        title: 'Quality Gate 1 Evaluation',
        description: 'Screens aesthetics & filters distortion via Vision LLM',
        x: 690,
        y: 190,
        config: {
          llmProvider: 'Gemini',
          model: 'gemini-2.5-pro',
          secretRef: 'SECRET_REF_GEMINI_QA',
          minAcceptanceScore: 82,
          maxRejectedBeforeEscalation: 2,
          qaPrompt: 'Evaluate stars alignment...'
        }
      },
      {
        id: 'node-pod',
        type: 'pod',
        title: 'POD Provider Integration',
        description: 'Auto-submits approved canvas print orders to Gelato API',
        x: 900,
        y: 190,
        config: {
          name: 'Gelato POD Default Engine',
          baseUrl: 'https://api.gelato.com/v2/orders',
          secretRef: 'SECRET_REF_GELATO_PROD_TOKEN',
          dispatchMode: 'draft',
          productUid: 'canvas-40x50-engraved-vintage-gold'
        }
      }
    ],
    edges: [
      { id: 'edge-1', source: 'node-pc', target: 'node-template' },
      { id: 'edge-2', source: 'node-template', target: 'node-generation' },
      { id: 'edge-3', source: 'node-generation', target: 'node-quality' },
      { id: 'edge-4', source: 'node-quality', target: 'node-pod' }
    ],
    createdAt: new Date('2026-03-10').toISOString(),
    updatedAt: new Date('2026-03-10').toISOString()
  }
];

const DEFAULT_ROLES: AppRole[] = [
  { role: 'Owner', description: 'Full account ownership. Can modify billing, team members, credentials, and all settings.' },
  { role: 'Admin', description: 'Full operational access. Can configure templates, products, and triggers, and bypass quality gates.' },
  { role: 'Observer', description: 'Read-only access. Can inspect dashboards, logs, and artifacts, but cannot edit configs or run orders.' },
  { role: 'Custom', description: 'Restricted set of permissions configurable by Admins.' }
];

const DEFAULT_PERMISSIONS = [
  { id: 'view_dashboard', name: 'View Dashboard', description: 'Access dashboard metrics and activity pipelines' },
  { id: 'manage_products', name: 'Manage Products', description: 'Create, edit, and bind templates to shop products' },
  { id: 'manage_templates', name: 'Manage Templates', description: 'Upload, modify, and version Markdown prompts' },
  { id: 'manage_credentials', name: 'Manage Credentials', description: 'View and change secret references for APIs' },
  { id: 'run_simulation', name: 'Run Simulator', description: 'Initiate simulated order workflow pipeline runs' },
  { id: 'manage_roles', name: 'Modify Roles & Permissions', description: 'Adjust permission mappings for other team members' }
];

const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  { role: 'Owner', permissions: ['view_dashboard', 'manage_products', 'manage_templates', 'manage_credentials', 'run_simulation', 'manage_roles'] },
  { role: 'Admin', permissions: ['view_dashboard', 'manage_products', 'manage_templates', 'manage_credentials', 'run_simulation'] },
  { role: 'Observer', permissions: ['view_dashboard'] },
  { role: 'Custom', permissions: ['view_dashboard', 'run_simulation'] } // custom starts out with limited permissions
];

const DEFAULT_PRODUCTS: ShopProduct[] = [
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
    content: `# Cosmic Astrological Prompt Template v2
Define the astrological alignment for order Reference: {{order.order_number}}
Create a highly intricate, high-contrast celestial star map.
The central sphere represents the celestial coordinates at date {{personalization.birth_date}} and time {{personalization.birth_time}} (Source verification: {{personalization.birth_time_source}}).
Place the observer location at coordinates derived from {{personalization.birth_place}}.

Visual Guidelines:
- Style: Celestial vintage engraving, deep indigo slate watercolor splash background, gold leaf vector accents.
- Core animal spirit guide: {{fufire.animal}}
- Primary elemental aura: {{fufire.dominant_element}} (derived Dominant Element)
- Background: Pitch black star field overlay with subtle nebula smoke.
- Aspect Ratio: 4:5 vertical poster alignment.`,
    version: 2,
    status: 'active',
    createdAt: new Date('2026-03-15').toISOString(),
    createdBy: 'Owner'
  },
  {
    id: 'temp-002',
    name: 'Cosmic Spirit Guardian Prompt',
    content: `# Guardian Elemental Totem Prompt v1
Generate an ethereal portrait of the Customer's Cosmic Totem: {{personalization.name}}
Born in the year: {{fufire.birth_year}}
Dynamic Animal Profile: {{fufire.animal}} with the elemental aspect of {{fufire.element}}.

Mandatory Specifications:
- Depict a majestic {{fufire.animal}} radiating with pure {{fufire.element}} particle systems.
- Centered, symmetrical canvas framing.
- Masterpiece quality, detailed fur shading, high contrast shadows.
- No text overlays, no human features, pure mythical illustration.`,
    version: 1,
    status: 'active',
    createdAt: new Date('2026-04-15').toISOString(),
    createdBy: 'Admin'
  }
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

const DEFAULT_QUALITY_GATE_CONFIGS: QualityGate1Config[] = [
  {
    productId: 'prod-001',
    llmProvider: 'Gemini',
    model: 'gemini-2.5-pro',
    secretRef: 'SECRET_REF_GEMINI_QA',
    fallbackProvider: 'OpenAI',
    fallbackModel: 'gpt-4o',
    fallbackSecretRef: 'SECRET_REF_GPT_QA_FALLBACK',
    qaPrompt: 'Evaluate if the generated map shows a clear celestial ring, accurate star placement aligned with a vintage engraved style, clean indigo hue, and containing NO modern digital artifacts or misspelled banners of text. Verify the animal guardian elements look coherent.',
    referenceImages: [
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231a202c"/><circle cx="50" cy="50" r="35" stroke="gold" stroke-width="2" fill="none"/><path d="M50,15 L50,85 M15,50 L85,50" stroke="gold" stroke-opacity="0.3"/></svg>'
    ],
    faultTolerance: 'low',
    minAcceptanceScore: 82,
    maxRejectedBeforeEscalation: 2,
    escalationEmailTemplate: `To: support@bazziprint.com
Subject: [ESCALATION] Order Personalization Blocked - Ref #{{order_number}}

The automation workflow has reached its threshold of failed image candidate iterations for Order {{order_number}} (Product ID: {{product_id}} - Title: {{product_title}}).

Failed Threshold Details:
- Applied Template: {{template_name}}
- Total Iteration Swarms Attempted: {{iteration_count}}
- Target Minimum QA Score: {{min_score}}
- Rejection Explanations:
{{rejection_reasons}}

Please review the failed candidate images here:
{{failed_candidate_images}}

Direct console action link:
{{workflow_run_url}}`
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
    escalationEmailTemplate: `Subject: QA Warning - Escalation Ticket for Order {{order_number}}
A cosmic totem image generation failed to pass Bazzi Quality Gate 1 within {{iteration_count}} iterations.
Product: {{product_title}}
Order Details: {{workflow_run_url}}`
  }
];

const DEFAULT_PERSONALIZATION_CONFIG: PersonalizationConfig = {
  name: 'FuFire API Portal',
  apiUrl: 'https://api.fufire.io/v1/personalization',
  secretRef: 'SECRET_REF_FUFIRE_LIVE_KEY',
  birthTimeFallback: {
    birth_time: '12:00',
    birth_time_known: false,
    birth_time_source: 'default_noon'
  }
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

// ==========================================
// 2. Storage Helpers (Syncing to LocalStorage)
// ==========================================

export class LocalDb {
  private static get<T>(key: string, defaultVal: T): T {
    const data = localStorage.getItem(`bazzi_${key}`);
    return data ? JSON.parse(data) : defaultVal;
  }

  private static set(key: string, data: any): void {
    localStorage.setItem(`bazzi_${key}`, JSON.stringify(data));
  }

  // Active Role State (For Role Level Security Mocks)
  static getActiveRole(): AppRoleName {
    return this.get<AppRoleName>('active_role', 'Owner');
  }

  static setActiveRole(role: AppRoleName): void {
    this.set('active_role', role);
  }

  // Products
  static getProducts(): ShopProduct[] {
    return this.get<ShopProduct[]>('products', DEFAULT_PRODUCTS);
  }

  static saveProducts(products: ShopProduct[]): void {
    this.set('products', products);
  }

  // Templates
  static getTemplates(): PromptTemplate[] {
    return this.get<PromptTemplate[]>('templates', DEFAULT_TEMPLATES);
  }

  static saveTemplates(templates: PromptTemplate[]): void {
    this.set('templates', templates);
  }

  // Generation configurations
  static getGenConfigs(): GenerationConfig[] {
    return this.get<GenerationConfig[]>('gen_configs', DEFAULT_GENERATION_CONFIGS);
  }

  static saveGenConfigs(configs: GenerationConfig[]): void {
    this.set('gen_configs', configs);
  }

  // Quality gates
  static getQualityConfigs(): QualityGate1Config[] {
    return this.get<QualityGate1Config[]>('quality_configs', DEFAULT_QUALITY_GATE_CONFIGS);
  }

  static saveQualityConfigs(configs: QualityGate1Config[]): void {
    this.set('quality_configs', configs);
  }

  // Personalization Config
  static getPersonalizationConfig(): PersonalizationConfig {
    return this.get<PersonalizationConfig>('personalization_config', DEFAULT_PERSONALIZATION_CONFIG);
  }

  static savePersonalizationConfig(config: PersonalizationConfig): void {
    this.set('personalization_config', config);
  }

  // POD Provider Config
  static getPodConfig(): PodProviderConfig {
    return this.get<PodProviderConfig>('pod_config', DEFAULT_POD_CONFIG);
  }

  static savePodConfig(config: PodProviderConfig): void {
    this.set('pod_config', config);
  }

  // Workflow Runs
  static getWorkflowRuns(): WorkflowRun[] {
    return this.get<WorkflowRun[]>('workflow_runs', []);
  }

  static saveWorkflowRuns(runs: WorkflowRun[]): void {
    this.set('workflow_runs', runs);
  }

  // Image Artifacts
  static getImageArtifacts(): ImageArtifact[] {
    return this.get<ImageArtifact[]>('image_artifacts', []);
  }

  static saveImageArtifacts(artifacts: ImageArtifact[]): void {
    this.set('image_artifacts', artifacts);
  }

  // Workflow Logs
  static getWorkflowLogs(): WorkflowLog[] {
    return this.get<WorkflowLog[]>('workflow_logs', []);
  }

  static saveWorkflowLogs(logs: WorkflowLog[]): void {
    this.set('workflow_logs', logs);
  }

  // Role Permissions
  static getRolePermissions(): RolePermissions[] {
    return this.get<RolePermissions[]>('role_permissions', DEFAULT_ROLE_PERMISSIONS);
  }

  static saveRolePermissions(bindings: RolePermissions[]): void {
    this.set('role_permissions', bindings);
  }

  // Mock Users
  static getUsers(): AppUser[] {
    return this.get<AppUser[]>('users', DEFAULT_USERS);
  }

  static saveUsers(users: AppUser[]): void {
    this.set('users', users);
  }

  // Visual Workflows
  static getVisualWorkflows(): VisualWorkflow[] {
    return this.get<VisualWorkflow[]>('visual_workflows', DEFAULT_WORKFLOWS);
  }

  static saveVisualWorkflows(workflows: VisualWorkflow[]): void {
    this.set('visual_workflows', workflows);
  }

  static getVisualWorkflow(productId: string): VisualWorkflow {
    const list = this.getVisualWorkflows();
    const found = list.find(w => w.productId === productId);
    if (found) return found;

    // Return a auto-initialized sequential default template for other products
    const initWf: VisualWorkflow = {
      productId,
      nodes: [
        {
          id: 'node-pc',
          type: 'personalization',
          title: 'Personalization API',
          description: 'Queries native birth maps & elements via webhook',
          x: 60,
          y: 190,
          config: { name: 'FuFire API Portal', apiUrl: 'https://api.fufire.io/v1/personalization', secretRef: 'SECRET_REF_FUFIRE_LIVE_KEY' }
        },
        {
          id: 'node-template',
          type: 'template',
          title: 'Template Assignment',
          description: 'Compiles coordinates into fine art instruction prompts',
          x: 270,
          y: 190,
          config: { templateId: '' }
        },
        {
          id: 'node-generation',
          type: 'generation',
          title: 'Image Generation',
          description: 'Generates image candidate swarm variants dynamically',
          x: 480,
          y: 190,
          config: {
            numInitiallyGenerated: 3,
            imageFormat: 'png',
            imageQuality: 'standard',
            primaryProvider: 'Gemini',
            primaryModel: 'imagen-3.0-generate-002',
            primarySecretRef: 'SECRET_REF_GEMINI_MAIN',
            fallbackProvider: 'Stability',
            fallbackModel: 'stable-diffusion-xl-1.0',
            fallbackSecretRef: 'SECRET_REF_SD_FALLBACK'
          }
        },
        {
          id: 'node-quality',
          type: 'quality_gate',
          title: 'Quality Gate screening',
          description: 'Screens aesthetics & filters distortion via Vision LLM',
          x: 690,
          y: 190,
          config: {
            llmProvider: 'Gemini',
            model: 'gemini-2.5-flash',
            secretRef: 'SECRET_REF_GEMINI_QA',
            minAcceptanceScore: 80,
            maxRejectedBeforeEscalation: 3,
            qaPrompt: 'Search for any major visual defects...'
          }
        },
        {
          id: 'node-pod',
          type: 'pod',
          title: 'POD Fulfillment',
          description: 'Auto-submits approved canvas print orders to POD Provider API',
          x: 900,
          y: 190,
          config: {
            name: 'Gelato POD Default Engine',
            baseUrl: 'https://api.gelato.com/v2/orders',
            secretRef: 'SECRET_REF_GELATO_PROD_TOKEN',
            dispatchMode: 'draft',
            productUid: ''
          }
        }
      ],
      edges: [
        { id: 'edge-1', source: 'node-pc', target: 'node-template' },
        { id: 'edge-2', source: 'node-template', target: 'node-generation' },
        { id: 'edge-3', source: 'node-generation', target: 'node-quality' },
        { id: 'edge-4', source: 'node-quality', target: 'node-pod' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return initWf;
  }

  static saveVisualWorkflow(productId: string, config: VisualWorkflow): void {
    const list = this.getVisualWorkflows();
    const filtered = list.filter(w => w.productId !== productId);
    filtered.push(config);
    this.saveVisualWorkflows(filtered);
  }

  static getRoles(): AppRole[] {
    return DEFAULT_ROLES;
  }

  static getPermissions() {
    return DEFAULT_PERMISSIONS;
  }

  // Reset Storage to Defaults
  static resetAll(): void {
    localStorage.removeItem('bazzi_active_role');
    localStorage.removeItem('bazzi_products');
    localStorage.removeItem('bazzi_templates');
    localStorage.removeItem('bazzi_gen_configs');
    localStorage.removeItem('bazzi_quality_configs');
    localStorage.removeItem('bazzi_personalization_config');
    localStorage.removeItem('bazzi_pod_config');
    localStorage.removeItem('bazzi_workflow_runs');
    localStorage.removeItem('bazzi_image_artifacts');
    localStorage.removeItem('bazzi_workflow_logs');
    localStorage.removeItem('bazzi_role_permissions');
    localStorage.removeItem('bazzi_users');
    localStorage.removeItem('bazzi_visual_workflows');
  }
}

// ==========================================
// 3. Automated Personalization Pipeline Adapters (Refactored Delegators)
// ==========================================

import { 
  LocalProductRepository, 
  LocalTemplateRepository, 
  LocalWorkflowRepository, 
  LocalArtifactRepository, 
  LocalSettingsRepository, 
  LocalRoleRepository
} from './lib/repositories/localRepository';
import { 
  MockImageGenerationProvider, 
  MockQualityGateProvider, 
  MockFuFireProvider, 
  MockPodProvider, 
  MockMailProvider,
  generateSVGArtwork as mockGenerateSVGArtwork
} from './lib/providers/mock';
import { WorkflowRunner } from './lib/workflow/runner';

const productRepo = new LocalProductRepository();
const templatesRepo = new LocalTemplateRepository();
const workflowRepo = new LocalWorkflowRepository();
const artifactsRepo = new LocalArtifactRepository();
const settingsRepo = new LocalSettingsRepository();
const roleRepo = new LocalRoleRepository();

const genProvider = new MockImageGenerationProvider();
const qaProvider = new MockQualityGateProvider();
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
  qaProvider,
  personalizationProvider,
  podProvider,
  mailProvider
);

export async function calculatePersonalization(
  name: string,
  birthDate: string,
  birthTime: string,
  birthTimeKnown: boolean,
  birthPlace: string,
  config: PersonalizationConfig
): Promise<any> {
  const birthTimeFallback = {
    birth_time: '12:00',
    birth_time_known: false,
    birth_time_source: 'default_noon'
  };
  return personalizationProvider.calculate(
    name,
    birthDate,
    birthTime,
    birthTimeKnown,
    birthPlace,
    birthTimeFallback
  );
}

export function generateSVGArtwork(
  title: string,
  orderNumber: string,
  animal: string,
  element: string,
  dominantElement: string,
  candidateIndex: number,
  iteration: number,
  score: number,
  quality: string,
  isAccepted: boolean
): string {
  return mockGenerateSVGArtwork(
    title,
    orderNumber,
    animal,
    element,
    dominantElement,
    candidateIndex,
    iteration,
    score,
    quality,
    isAccepted
  );
}

export async function generateImages(
  orderNumber: string,
  variables: any,
  config: GenerationConfig,
  iteration: number,
  title: string
): Promise<any> {
  const modelUsed = iteration > 1 ? config.fallbackModel : config.primaryModel;
  const secretRef = iteration > 1 ? config.fallbackSecretRef : config.primarySecretRef;
  const quality = config.imageQuality === 'hd' ? 'hd' : 'standard';
  const format = config.imageFormat === 'jpeg' ? 'jpeg' : 'png';
  
  return genProvider.generate(
    '', // compiled prompt
    config.numInitiallyGenerated,
    format,
    quality,
    modelUsed,
    secretRef,
    {
      productTitle: title,
      orderNumber,
      animal: variables.animal || 'Dragon',
      element: variables.element || 'Fire',
      dominant_element: variables.dominant_element || 'Solar-Flare',
      iteration
    }
  );
}


export async function evaluateCandidates(
  candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
  gateConfig: QualityGate1Config,
  resolvedVariables: any,
  iteration: number
): Promise<{
  acceptedIndex: number | null;
  evaluations: any[];
}> {
  const results = await qaProvider.evaluate(
    candidates,
    gateConfig.minAcceptanceScore,
    gateConfig.qaPrompt,
    gateConfig.secretRef,
    gateConfig.model,
    resolvedVariables,
    iteration
  );
  
  const accepted = results.find(r => r.status === 'accepted');
  const acceptedIndex = accepted !== undefined ? accepted.candidateIndex : null;
  
  return {
    acceptedIndex,
    evaluations: results
  };
}



export async function submitPrintOrder(
  workflowRunId: string,
  orderNumber: string,
  productId: string,
  artifact: ImageArtifact,
  config: PodProviderConfig
): Promise<any> {
  return podProvider.submitOrder(
    workflowRunId,
    orderNumber,
    productId,
    artifact,
    config
  );
}

// ==========================================
// 4. Combined Workflow Run Executor
// ==========================================

export async function runFullWorkflowSimulator(
  orderNumber: string,
  productId: string,
  customerName: string,
  birthDate: string,
  birthTime: string,
  birthTimeKnown: boolean,
  birthPlace: string,
  onLogUpdate: (log: WorkflowLog) => void
): Promise<WorkflowRun> {
  return runner.run(
    orderNumber,
    productId,
    customerName,
    birthDate,
    birthTime,
    birthTimeKnown,
    birthPlace,
    onLogUpdate
  );
}


