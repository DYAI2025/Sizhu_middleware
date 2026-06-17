/**
 * Bazzi Middleware Console
 * TypeScript Interfaces & Types
 */

export type AppRoleName = 'Owner' | 'Admin' | 'Observer' | 'Custom';

export interface AppRole {
  role: AppRoleName;
  description: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
}

export interface RolePermissions {
  role: AppRoleName;
  permissions: string[]; // List of permission IDs
}

export interface ShopProduct {
  id: string;
  shopProvider: 'Etsy' | 'Eatsy';
  externalProductId: string;
  externalVariantId: string;
  title: string;
  productType: string;
  isActive: boolean;
  activeTemplateId?: string; // Binds to a prompt template
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string; // Markdown prompt template
  version: number; // e.g. 1, 2, 3
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  createdBy: string;
}

export interface ProductTemplateBinding {
  id: string;
  productId: string;
  templateId: string;
  boundAt: string;
}

export interface GenerationConfig {
  productId: string;
  numInitiallyGenerated: number;
  imageFormat: 'png' | 'jpeg';
  imageQuality: 'standard' | 'hd';
  // 'OpenRouter' is the default model gateway (REQ-A-002). Legacy direct
  // providers stay selectable for back-compat with pre-gateway configs.
  primaryProvider: 'OpenRouter' | 'Gemini' | 'OpenAI' | 'Midjourney' | 'Stability';
  primaryModel: string;
  primarySecretRef: string; // e.g. SECRET_REF_OPENROUTER_API_KEY
  fallbackProvider: 'OpenRouter' | 'Gemini' | 'OpenAI' | 'Stability';
  fallbackModel: string;
  fallbackLLM: string;
  fallbackSecretRef: string;
  // Hard cost cap for a live run (REQ-LGQ-004). Optional: when absent the run
  // path derives a safe default from the config worst-case (deriveDefaultCap).
  maxImagesPerRun?: number; // max real image calls a single run may issue
  maxUsdPerRun?: number;    // per-run real $ spend ceiling
}

export interface QualityGate1Config {
  productId: string;
  // 'OpenRouter' is the default model gateway (REQ-A-002).
  llmProvider: 'OpenRouter' | 'Gemini' | 'OpenAI' | 'Claude';
  model: string;
  secretRef: string; // e.g. SECRET_REF_OPENROUTER_API_KEY
  fallbackProvider: 'OpenRouter' | 'Gemini' | 'OpenAI';
  fallbackModel: string;
  fallbackSecretRef: string;
  qaPrompt: string;
  referenceImages: string[]; // Storage keys or base64 images
  faultTolerance: 'low' | 'medium' | 'high';
  minAcceptanceScore: number; // e.g. 80 out of 100
  maxRejectedBeforeEscalation: number; // e.g. 3
  escalationEmailTemplate: string;
}

export interface PersonalizationConfig {
  name: string; // Default: FuFire API
  baseUrl: string;
  apiKeySecretRef: string; // e.g. SECRET_REF_FUFIRE
  enabled: boolean;
  endpointPaths: {
    chronometryResolve: string;
    bazi: string;
    baziTrace: string;
    wuxing: string;
  };
  defaultStandard: string; // 'CIVIL'
  defaultBoundary: string; // 'midnight'
  ambiguousTimePolicy: 'earlier' | 'later' | 'require_manual_resolution';
  nonexistentTimePolicy: 'error' | 'shift_forward';
  timeoutMs: number;
  retryCount: number;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

export interface PodProviderConfig {
  id: string;
  name: string; // Default: Gelato
  baseUrl: string;
  secretRef: string; // e.g. SECRET_REF_GELATO
  dispatchMode: 'disabled' | 'draft' | 'order';
  productUidMappings: Record<string, string>; // Maps productId -> External POD UID
}

export interface WorkflowRun {
  id: string;
  orderNumber: string;
  productId: string;
  customerName: string;
  birthDate: string;
  birthTime: string;
  birthTimeKnown: boolean;
  birthPlace: string;
  status: 'running' | 'pod_ready' | 'completed' | 'escalated' | 'failed';
  startedAt: string;
  completedAt?: string;
  personalizationData?: any;
  acceptedArtifactId?: string;
  currentIteration: number;
  // Distinct escalation reason persisted on the run (OQ-2): COST_CAP_REACHED for a
  // cost-cap bite, else unset (status 'escalated' alone = quality exhaustion).
  escalationReason?: string;
}

export interface ImageArtifact {
  id: string;
  workflowRunId: string;
  orderNumber: string;
  productId: string;
  templateId: string;
  iteration: number;
  candidateIndex: number;
  storagePath: string; // URL or Mock Base64 Path
  status: 'accepted' | 'rejected' | 'not_selected' | 'failed_generation';
  qaScore: number;
  rejectionReason?: string;
  qaResultJson: string; // Detail string serialization
  generatedAt: string;
  // Provenance (REQ-LGQ-006, OQ-3): which model produced the artifact + a
  // PII-SAFE provenance string (derived non-PII vars only — never the raw prompt).
  modelUsed?: string;
  promptVarsProvenance?: string;
}

export interface WorkflowLog {
  id: string;
  runId: string;
  orderNumber: string;
  timestamp: string;
  step: string;
  message: string;
  providerUsed?: string;
  modelUsed?: string;
  iteration?: number;
  status: 'info' | 'success' | 'warning' | 'error';
}

// ==========================================
// Visual Workflow & RBAC Database Interfaces
// ==========================================

export interface WorkflowNode {
  id: string;
  type: 'template' | 'generation' | 'quality_gate' | 'personalization' | 'pod';
  title: string;
  description: string;
  x: number;
  y: number;
  config: any; // Saves corresponding sub-config
}

export interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
}

export interface VisualWorkflow {
  productId: string;
  nodes: WorkflowNode[];
  edges: WorkflowConnection[];
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: AppRoleName;
  createdAt: string;
}

// dispatch_approvals (REQ-002 — sizhu-agent-safe-ops)
// A persisted, single-use approval record on the ApprovalRepository seam. It is the
// SERVER-SIDE decider for a real-money POD dispatch: server-side keyed on
// (workflowRunId, artifactId), carries an expiry + a nonce, and a status that flips
// exactly once unused→used on a successful consume (no sequential or concurrent replay).
// T1 (this slice) defines the record SHAPE only; the atomic single-use consume
// BEHAVIOUR lives in T2 (LocalApprovalRepository).
export interface DispatchApproval {
  /** Stable record identifier (the nonce). Lookups + consume are keyed on this. */
  id: string;
  /** The run this approval was minted for. consume() must match this exactly. */
  workflowRunId: string;
  /** The approved artifact. A dispatched artifactId MUST equal this one (no swap). */
  artifactId: string;
  /** Issuer/approver identity (e.g. an admin email). */
  approverId: string;
  /** Single-use lifecycle: minted `unused`, flipped to `used` on first consume. */
  status: 'unused' | 'used';
  /** ISO timestamp after which the record is expired and no longer consumable. */
  expiresAt: string;
  /** ISO timestamp the record was minted. */
  createdAt: string;
  /** ISO timestamp the record was consumed (set when status flips to `used`). */
  usedAt?: string;
}
