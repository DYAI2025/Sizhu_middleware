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
// 3. Automated Personalization Pipeline Adapters
// ==========================================

export async function calculatePersonalization(
  name: string,
  birthDate: string,
  birthTime: string,
  birthTimeKnown: boolean,
  birthPlace: string,
  config: PersonalizationConfig
): Promise<{
  animal: string;
  element: string;
  birth_year: number;
  dominant_element: string;
  resolvedTime: string;
  resolvedTimeSource: string;
}> {
  // Real endpoint skeleton simulation (simulate latency & parameters)
  await new Promise((resolve) => setTimeout(resolve, 600));

  let resolvedTime = birthTime;
  let resolvedTimeSource = 'user_input';

  if (!birthTimeKnown) {
    resolvedTime = config.birthTimeFallback.birth_time; // "12:00"
    resolvedTimeSource = config.birthTimeFallback.birth_time_source || 'default_noon';
  }

  // Algorithmic mapping of zodiac element based on birth year
  const year = birthDate ? new Date(birthDate).getUTCFullYear() : 2026;
  const elements = ['Metal', 'Water', 'Wood', 'Fire', 'Earth'];
  const animals = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

  const elementIndex = Math.abs((year - 4) % 10 / 2) % 5;
  const animalIndex = Math.abs((year - 4) % 12);

  const element = elements[Math.floor(elementIndex)];
  const animal = animals[animalIndex];

  // Derive dominant elements from name sound or birthplace letter hashes
  const hashSum = (name + birthPlace).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const dominantElements = ['Cosmic-Iron', 'Lunar-Water', 'Forest-Wood', 'Solar-Flare', 'Volcanic-Earth'];
  const dominant_element = dominantElements[hashSum % dominantElements.length];

  return {
    animal,
    element,
    birth_year: year,
    dominant_element,
    resolvedTime,
    resolvedTimeSource
  };
}

/**
 * Builds beautiful, high-contrast dynamic vector graphics to represent customized customer artifacts.
 * This guarantees pristine visual presentation in the testing browser sandbox without broker links.
 */
function generateSVGArtwork(
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
  const bgTheme = isAccepted ? '#0f172a' : '#1e1b4b'; // Slate vs Dark Indigo
  const strokeTheme = isAccepted ? 'gold' : '#f43f5e'; // Gold accents vs rose warning
  const gradientId = `grad-${orderNumber}-${candidateIndex}-${iteration}`;

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
    <rect width="600" height="750" fill="${bgTheme}" />
    
    <!-- Outer starry environment -->
    <g opacity="0.3">
      <circle cx="80" cy="90" r="1.5" fill="white" />
      <circle cx="520" cy="140" r="1.2" fill="white" />
      <circle cx="210" cy="50" r="2" fill="white" />
      <circle cx="480" cy="620" r="1" fill="white" />
      <circle cx="110" cy="550" r="1.3" fill="white" />
      <circle cx="300" cy="710" r="1.5" fill="white" />
    </g>

    <!-- Celestial orbits -->
    <circle cx="300" cy="320" r="190" stroke="${strokeTheme}" stroke-width="1.5" fill="none" opacity="0.4" stroke-dasharray="8,4" />
    <circle cx="300" cy="320" r="140" stroke="${strokeTheme}" stroke-width="0.8" fill="none" opacity="0.6" />
    
    <!-- Central decorative geometric mandala -->
    <path d="M300,100 L300,540 M80,320 L520,320 M144,164 L456,476 M144,476 L456,164" stroke="${strokeTheme}" stroke-opacity="0.15" stroke-width="1" />

    <!-- Personalization features -->
    <circle cx="300" cy="320" r="85" fill="black" opacity="0.9" stroke="${strokeTheme}" stroke-width="2" />
    
    <text x="300" y="295" font-family="'JetBrains Mono', Courier, monospace" font-size="24" fill="${strokeTheme}" font-weight="bold" text-anchor="middle" letter-spacing="4">
      ${animal.toUpperCase()}
    </text>
    <text x="300" y="325" font-family="'Inter', sans-serif" font-size="12" fill="white" font-weight="semibold" opacity="0.8" text-anchor="middle">
      ELEMENT: ${element.toUpperCase()}
    </text>
    <text x="300" y="345" font-family="'Inter', sans-serif" font-size="10" fill="${strokeTheme}" opacity="0.9" text-anchor="middle">
      ${dominantElement.toUpperCase()}
    </text>

    <!-- Compass rose and ticks -->
    <g stroke="${strokeTheme}" stroke-opacity="0.5" stroke-width="1.5">
      <path d="M300,215 L300,230 M300,410 L300,425 M195,320 L210,320 M390,320 L405,320" />
    </g>

    <text x="300" y="210" font-family="monospace" font-size="12" fill="${strokeTheme}" text-anchor="middle">N</text>
    <text x="300" y="440" font-family="monospace" font-size="12" fill="${strokeTheme}" text-anchor="middle">S</text>

    <!-- Bottom border typography for POD print validation -->
    <rect x="50" y="580" width="500" height="110" rx="4" fill="black" fill-opacity="0.5" stroke="${strokeTheme}" stroke-opacity="0.2" />
    
    <text x="300" y="605" font-family="'Inter', sans-serif" font-size="14" fill="white" font-weight="bold" text-anchor="middle">
      ${title}
    </text>
    <text x="300" y="628" font-family="'JetBrains Mono', Courier, monospace" font-size="11" fill="white" fill-opacity="0.6" text-anchor="middle">
      Order Hub Ref: ${orderNumber} | Iteration: ${iteration} | Candidate: ${candidateIndex + 1}
    </text>
    <text x="300" y="650" font-family="'JetBrains Mono', Courier, monospace" font-size="10" fill="${strokeTheme}" font-weight="semibold" text-anchor="middle">
      QA Evaluated Score: ${score}/100 [${quality.toUpperCase()} QUALITY]
    </text>
    <text x="300" y="672" font-family="'Inter', sans-serif" font-size="9" fill="white" fill-opacity="0.4" text-anchor="middle">
      BAZZI MIDDLEWARE ENGINE - DIGITAL CRYP-SIGN
    </text>
  </svg>`;
}

export async function generateImages(
  orderNumber: string,
  variables: any,
  config: GenerationConfig,
  iteration: number,
  title: string
): Promise<{
  candidateIndex: number;
  storagePath: string;
  metadata: {
    promptUsed: string;
    model: string;
    provider: string;
    quality: string;
    resolution: string;
  };
}[]> {
  // Simulate image generation latency (e.g. DALL-E-3 takes time)
  await new Promise((resolve) => setTimeout(resolve, 800));

  const results = [];
  const provider = iteration > 1 ? config.fallbackProvider : config.primaryProvider;
  const model = iteration > 1 ? config.fallbackModel : config.primaryModel;

  for (let i = 0; i < config.numInitiallyGenerated; i++) {
    // Generate simulated scores inside this helper
    // Let's vary the scores so iteration behaves realistically
    let mockScore = 70 + Math.floor(Math.random() * 26); // 70 to 95
    if (iteration === 1 && i === 0) {
      // Intentionally supply lower score on first items sometimes to test Quality Gate reject iteration
      mockScore = Math.floor(Math.random() * 20) + 60; // 60 to 79 (will likely trigger rejection depending on gate)
    }

    const path = generateSVGArtwork(
      title,
      orderNumber,
      variables.animal,
      variables.element,
      variables.dominant_element,
      i,
      iteration,
      mockScore,
      config.imageQuality,
      false // updated on validation
    );

    results.push({
      candidateIndex: i,
      storagePath: path,
      metadata: {
        promptUsed: `Generative instruction for animal ${variables.animal} themed in ${variables.element}`,
        model,
        provider,
        quality: config.imageQuality,
        resolution: config.imageQuality === 'hd' ? '1792x2304' : '1024x1024'
      }
    });
  }

  return results;
}

export async function evaluateCandidates(
  candidates: { candidateIndex: number; storagePath: string; metadata: any }[],
  gateConfig: QualityGate1Config,
  resolvedVariables: any,
  iteration: number
): Promise<{
  acceptedIndex: number | null; // index of accepted artifact or null if none pass
  evaluations: {
    candidateIndex: number;
    score: number;
    status: 'accepted' | 'rejected' | 'not_selected';
    reason: string;
    detailedJson: string;
  }[];
}> {
  // Simulate LLM vision inspection evaluation delay
  await new Promise((resolve) => setTimeout(resolve, 700));

  const minScore = gateConfig.minAcceptanceScore;
  const evaluations: any[] = [];
  let acceptedIndex: number | null = null;
  let highestScore = -1;

  // Evaluate candidate scores based on mock score embedded or simulated
  const scores = candidates.map((c, index) => {
    // Determine quality based on index and iteration
    // To ensure a full realistic flow, make round 1 candidates occasionally score below threshold,
    // and round 2 or 3 score significantly higher (to guarantee eventual success or orderly escalation)
    if (iteration === 1) {
      if (index === 0) return minScore - 8; // fails gate
      if (index === 1) return minScore - 3; // fails gate
      return minScore + 2; // threshold boundary
    } else {
      // In subsequent iterations, Gemini/OpenAI refines outputs; scores rise!
      return minScore + Math.floor(Math.random() * 10) + 5; 
    }
  });

  // Decide winner
  scores.forEach((score, index) => {
    if (score >= minScore) {
      if (score > highestScore) {
        highestScore = score;
        acceptedIndex = index;
      }
    }
  });

  candidates.forEach((c, index) => {
    const score = scores[index];
    let status: 'accepted' | 'rejected' | 'not_selected' = 'rejected';

    let reason = '';
    if (score < minScore) {
      status = 'rejected';
      reason = `LLM evaluator reported: Compositional scores (${score}/100) are below active threshold of ${minScore}. Detected slight misalignment in ${resolvedVariables.element}-element background glow particle ratios, and star map ring border contained slight vector blurring.`;
    } else if (index === acceptedIndex) {
      status = 'accepted';
      reason = 'Passed. Outstanding alignment with prompt specifications. Celestial coordinates perfectly mapped, no geometric warping detected, animal spirit outline is immaculate, background contrast holds full density.';
    } else {
      status = 'not_selected';
      reason = `Excellent score (${score}/100) and passed minimum threshold, but is not selected as it was outranked by candidate ${acceptedIndex! + 1} (${highestScore}/100). Recorded to artifact pool as not selected candidate.`;
    }

    evaluations.push({
      candidateIndex: index,
      score,
      status,
      reason,
      detailedJson: JSON.stringify({
        llm_analyzer: gateConfig.llmProvider,
        vision_model: gateConfig.model,
        evaluation_timestamp: new Date().toISOString(),
        score_breakdown: {
          style_adherence: Math.min(100, score + 4),
          element_presence: Math.min(100, score + 2),
          sharpness: Math.min(100, score + 1),
          typography_check: 'PASS_NO_TEXT_FOUND'
        },
        compositional_notes: reason
      }, null, 2)
    });
  });

  return {
    acceptedIndex,
    evaluations
  };
}

export async function submitPrintOrder(
  workflowRunId: string,
  orderNumber: string,
  productId: string,
  artifact: ImageArtifact,
  config: PodProviderConfig
): Promise<{
  success: boolean;
  podOrderId: string;
  dispatchMode: 'draft' | 'order';
  estimatedDelivery: string;
}> {
  // Simulate Gelato / other POD submission latency
  await new Promise((resolve) => setTimeout(resolve, 500));

  const targetUid = config.productUidMappings[productId] || 'gelato-standard-poster';
  const podOrderId = `GELATO-ORD-${orderNumber}-${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    success: true,
    podOrderId,
    dispatchMode: config.dispatchMode,
    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString() // 5 days out
  };
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
  // Load current configs from LocalDb
  const products = LocalDb.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product) {
    throw new Error(`Product ${productId} not found in database.`);
  }

  const templates = LocalDb.getTemplates();
  const activeTemplate = templates.find(t => t.id === product.activeTemplateId && t.status === 'active') || templates[0];

  const genConfigs = LocalDb.getGenConfigs();
  const genConfig = genConfigs.find(c => c.productId === productId) || genConfigs[0];

  const qualityConfigs = LocalDb.getQualityConfigs();
  const qualityConfig = qualityConfigs.find(q => q.productId === productId) || qualityConfigs[0];

  const personalizationConfig = LocalDb.getPersonalizationConfig();
  const podConfig = LocalDb.getPodConfig();

  // Create the Workflow Run object
  const runId = `wf-run-${Math.floor(1000 + Math.random() * 9000)}`;
  const runs = LocalDb.getWorkflowRuns();
  
  const newRun: WorkflowRun = {
    id: runId,
    orderNumber,
    productId,
    customerName,
    birthDate,
    birthTime,
    birthTimeKnown,
    birthPlace,
    status: 'running',
    startedAt: new Date().toISOString(),
    currentIteration: 1
  };

  runs.unshift(newRun);
  LocalDb.saveWorkflowRuns(runs);

  const logs: WorkflowLog[] = [];
  const logCounter = { count: 0 };

  const pushLog = (message: string, step: string, status: 'info' | 'success' | 'warning' | 'error' = 'info', providerUsed?: string, modelUsed?: string, iteration?: number) => {
    logCounter.count++;
    const log: WorkflowLog = {
      id: `log-${runId}-${logCounter.count}`,
      runId,
      orderNumber,
      timestamp: new Date().toISOString(),
      step,
      message,
      status,
      providerUsed,
      modelUsed,
      iteration
    };
    logs.push(log);
    const existingLogs = LocalDb.getWorkflowLogs();
    existingLogs.unshift(log);
    LocalDb.saveWorkflowLogs(existingLogs);
    onLogUpdate(log);
  };

  // Step 1: Boot pipeline
  pushLog(`Starting automated workflow pipeline run for order Ref #${orderNumber}`, 'PIPELINE_INIT', 'info');
  pushLog(`Validating metadata parameters. Product Selected: "${product.title}" (${product.productType})`, 'PIPELINE_INIT', 'info');

  // Step 2: Personalization API lookup (FuFire)
  pushLog(`Invoking Personalization Engine adapter on ${personalizationConfig.name} at: ${personalizationConfig.apiUrl}`, 'PERSONALIZATION_LOOKUP', 'info');
  const details = await calculatePersonalization(
    customerName,
    birthDate,
    birthTime,
    birthTimeKnown,
    birthPlace,
    personalizationConfig
  );

  pushLog(`Resolved FuFire Personalization parameters: Year=${details.birth_year}, Animal="${details.animal}", Element="${details.element}", Dominant="${details.dominant_element}". Resolved Birth Time: ${details.resolvedTime} (Source: ${details.resolvedTimeSource})`, 'PERSONALIZATION_LOOKUP', 'success');
  
  // Update Run object with variables
  newRun.personalizationData = details;
  const currentRuns = LocalDb.getWorkflowRuns();
  const runIndex = currentRuns.findIndex(r => r.id === runId);
  if (runIndex !== -1) {
    currentRuns[runIndex].personalizationData = details;
    LocalDb.saveWorkflowRuns(currentRuns);
  }

  // Step 3: Run Generative Swarm Loop
  let matchedArtifact: ImageArtifact | null = null;
  const allArtifacts: ImageArtifact[] = [];
  let currentIteration = 1;

  while (currentIteration <= qualityConfig.maxRejectedBeforeEscalation) {
    newRun.currentIteration = currentIteration;
    const allLatestRuns = LocalDb.getWorkflowRuns();
    const latestRunIndex = allLatestRuns.findIndex(r => r.id === runId);
    if (latestRunIndex !== -1) {
      allLatestRuns[latestRunIndex].currentIteration = currentIteration;
      LocalDb.saveWorkflowRuns(allLatestRuns);
    }

    pushLog(`Beginning image generation swarm. Iteration count is ${currentIteration}/${qualityConfig.maxRejectedBeforeEscalation}. Requested candidate swarm size: ${genConfig.numInitiallyGenerated}`, 'GENERATE_CANDIDATES', 'info', currentIteration > 1 ? genConfig.fallbackProvider : genConfig.primaryProvider, currentIteration > 1 ? genConfig.fallbackModel : genConfig.primaryModel, currentIteration);
    
    // Compile values into template prompt matching
    const resolvedPrompt = activeTemplate.content
      .replace(/{{order\.order_number}}/g, orderNumber)
      .replace(/{{personalization\.name}}/g, customerName)
      .replace(/{{personalization\.birth_date}}/g, birthDate)
      .replace(/{{personalization\.birth_time}}/g, details.resolvedTime)
      .replace(/{{personalization\.birth_time_source}}/g, details.resolvedTimeSource)
      .replace(/{{personalization\.birth_place}}/g, birthPlace)
      .replace(/{{fufire\.animal}}/g, details.animal)
      .replace(/{{fufire\.element}}/g, details.element)
      .replace(/{{fufire\.birth_year}}/g, details.birth_year.toString())
      .replace(/{{fufire\.dominant_element}}/g, details.dominant_element);

    pushLog(`Prompt compiled successfully from version v${activeTemplate.version}. Characters size: ${resolvedPrompt.length}`, 'GENERATE_CANDIDATES', 'info');

    // Run Generator
    const rawCandidates = await generateImages(orderNumber, details, genConfig, currentIteration, product.title);
    pushLog(`Provider generated ${rawCandidates.length} candidate artifacts cleanly to staging bucket. Launching Quality Gate 1 LLM Vision screening...`, 'GENERATE_CANDIDATES', 'success', currentIteration > 1 ? genConfig.fallbackProvider : genConfig.primaryProvider, currentIteration > 1 ? genConfig.fallbackModel : genConfig.primaryModel, currentIteration);

    // Call Quality Evaluation
    const evalResults = await evaluateCandidates(rawCandidates, qualityConfig, details, currentIteration);
    
    // Log individual evaluation results and save artifacts
    const generatedArtifacts: ImageArtifact[] = evalResults.evaluations.map((evalItem, idx) => {
      const candidateObj = rawCandidates[idx];
      
      // Update actual candidate image to match the visual outcome
      const imageWithFinalScore = candidateObj.storagePath.replace('false', evalItem.status === 'accepted' ? 'true' : 'false');

      const artifact: ImageArtifact = {
        id: `art-${runId}-it${currentIteration}-idx${evalItem.candidateIndex}`,
        workflowRunId: runId,
        orderNumber,
        productId,
        templateId: activeTemplate.id,
        iteration: currentIteration,
        candidateIndex: evalItem.candidateIndex,
        storagePath: imageWithFinalScore,
        status: evalItem.status,
        qaScore: evalItem.score,
        rejectionReason: evalItem.reason,
        qaResultJson: evalItem.detailedJson,
        generatedAt: new Date().toISOString()
      };

      allArtifacts.push(artifact);
      return artifact;
    });

    // Save artifacts to Db
    const globalArtifacts = LocalDb.getImageArtifacts();
    LocalDb.saveImageArtifacts([...generatedArtifacts, ...globalArtifacts]);

    // Push log entries for evaluations
    generatedArtifacts.forEach((art) => {
      if (art.status === 'accepted') {
        pushLog(`Candidate ${art.candidateIndex + 1} PASSED QA scoring! Score: ${art.qaScore}/100. Target minimum: ${qualityConfig.minAcceptanceScore}/100. Reason: "${art.rejectionReason?.substring(0, 75)}..."`, 'QA_SCREENING', 'success', qualityConfig.llmProvider, qualityConfig.model, currentIteration);
      } else if (art.status === 'rejected') {
        pushLog(`Candidate ${art.candidateIndex + 1} REJECTED by QA screening. Score: ${art.qaScore}/100. Target minimum: ${qualityConfig.minAcceptanceScore}/100. Reason: "${art.rejectionReason?.substring(0, 75)}..."`, 'QA_SCREENING', 'warning', qualityConfig.llmProvider, qualityConfig.model, currentIteration);
      } else {
        pushLog(`Candidate ${art.candidateIndex + 1} rank-outranked but passed threshold. Score: ${art.qaScore}/100. Status: Not selected.`, 'QA_SCREENING', 'info', qualityConfig.llmProvider, qualityConfig.model, currentIteration);
      }
    });

    if (evalResults.acceptedIndex !== null) {
      matchedArtifact = generatedArtifacts[evalResults.acceptedIndex];
      break;
    }

    pushLog(`Iteration ${currentIteration} did not yield any passing candidates. Composition criteria unfulfilled.`, 'QA_SCREENING', 'error');
    currentIteration++;
  }

  // Handle outputs
  const allLatestRuns = LocalDb.getWorkflowRuns();
  const latestRunIndex = allLatestRuns.findIndex(r => r.id === runId);

  if (matchedArtifact) {
    // Submit order to Gelato
    pushLog(`Connecting to POD fulfillment Provider: ${podConfig.name}. BaseUrl: ${podConfig.baseUrl}`, 'POD_SUBMISSION', 'info');
    
    // Simulate order dispatch 
    const isMockGelatoSuccess = true;
    if (isMockGelatoSuccess) {
      const dispatchResponse = await submitPrintOrder(runId, orderNumber, productId, matchedArtifact, podConfig);
      pushLog(`POD fulfillment submission successful! Created POD Order Ref: ${dispatchResponse.podOrderId}. Dispatch Mode: ${dispatchResponse.dispatchMode.toUpperCase()}`, 'POD_SUBMISSION', 'success', 'Gelato', 'v2-orders');
      
      if (latestRunIndex !== -1) {
        allLatestRuns[latestRunIndex].status = 'completed';
        allLatestRuns[latestRunIndex].acceptedArtifactId = matchedArtifact.id;
        allLatestRuns[latestRunIndex].completedAt = new Date().toISOString();
        LocalDb.saveWorkflowRuns(allLatestRuns);
      }
      pushLog(`Personalized print-on-demand pipeline fully executed and completed.`, 'PIPELINE_COMPLETE', 'success');
    }
  } else {
    // If we reach here, we exceeded maximum iterations. Log and Escalate
    const rejectionSummaries = allArtifacts
      .filter(a => a.status === 'rejected')
      .map(a => `Iteration ${a.iteration} Candidate ${a.candidateIndex + 1}: Score ${a.qaScore}/100 - Reason: ${a.rejectionReason}`)
      .join('\n');

    pushLog(`ESCALATION LIMIT TRIGGERED! Exceeded maximum of ${qualityConfig.maxRejectedBeforeEscalation} rejected iterations. Personalization QA score unachievable.`, 'ESCALATION_TRIGGER', 'error');
    
    // Formulate variables matching escalation template
    const signedImageLinks = allArtifacts.map(a => `[Signed Link Iteration ${a.iteration} Swarm Candidate ${a.candidateIndex + 1}]: bazzi-staging://${a.id}.svg`).join('\n');
    let emailContent = qualityConfig.escalationEmailTemplate
      .replace(/{{order_number}}/g, orderNumber)
      .replace(/{{product_id}}/g, productId)
      .replace(/{{product_title}}/g, product.title)
      .replace(/{{template_name}}/g, activeTemplate.name)
      .replace(/{{iteration_count}}/g, qualityConfig.maxRejectedBeforeEscalation.toString())
      .replace(/{{min_score}}/g, qualityConfig.minAcceptanceScore.toString())
      .replace(/{{rejection_reasons}}/g, rejectionSummaries)
      .replace(/{{failed_candidate_images}}/g, signedImageLinks)
      .replace(/{{workflow_run_url}}/g, `https://ais-pre-qdekpcbza6gzl5ntzblhcv-501750026591.europe-west2.run.app/workflow/${runId}`);

    pushLog(`Compiling escalation ticket. Generating automated notification log...`, 'ESCALATION_TRIGGER', 'info');
    
    // Print compiled template email in workflows log
    localStorage.setItem(`bazzi_escalated_email_${runId}`, emailContent);

    pushLog(`Escalation Email generated and dispatched to Shop Owner queue:\n\n${emailContent.substring(0, 300)}...`, 'ESCALATION_TRIGGER', 'warning');

    if (latestRunIndex !== -1) {
      allLatestRuns[latestRunIndex].status = 'escalated';
      allLatestRuns[latestRunIndex].completedAt = new Date().toISOString();
      LocalDb.saveWorkflowRuns(allLatestRuns);
    }
  }

  return LocalDb.getWorkflowRuns().find(r => r.id === runId)!;
}
