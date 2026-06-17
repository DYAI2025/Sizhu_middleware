/**
 * Bazzi Middleware Platform - Core Domain Types
 * Exhaustive reference for all 26 database-mapped & domain-managed entities.
 */

import { AppRoleName, VisualWorkflow } from '../../types';
import { QualityIssue, GatewayIssue } from './issueTaxonomy';

// Explicit exports for compatibility and cleaner imports
export type { QualityIssue, GatewayIssue };
export type { AppRoleName, VisualWorkflow } from '../../types';
export type Product = ShopProduct;
export type Role = AppRole;

// 1. app_roles
export interface AppRole {
  role: AppRoleName;
  description: string;
}

// 2. app_users
export interface AppUser {
  id: string;
  email: string;
  role: AppRoleName;
  createdAt: string;
}

// 3. permissions
export interface Permission {
  id: string;
  name: string;
  description: string;
}

// 4. role_permissions
export interface RolePermissions {
  role: AppRoleName;
  permissions: string[];
}

// 5. shop_products
export interface ShopProduct {
  id: string;
  shopProvider: 'Etsy' | 'Eatsy';
  externalProductId: string;
  externalVariantId: string;
  title: string;
  productType: string;
  isActive: boolean;
  activeTemplateId?: string;
  createdAt: string;
}

// 6. prompt_templates
export interface PromptTemplate {
  id: string;
  name: string;
  content: string; // Markdown model guide
  version: number;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  createdBy: string;
}

// 7. product_template_bindings
export interface ProductTemplateBinding {
  id: string;
  productId: string;
  templateId: string;
  boundAt: string;
}

// 8. api_providers
export interface ApiProvider {
  id: string;
  name: string;
  type: 'image_generation' | 'quality_gate' | 'personalization' | 'pod' | 'mail';
  status: 'MOCK' | 'CONFIGURED' | 'LIVE_DISABLED' | 'ERROR' | 'LIVE';
  baseUrl: string;
  secretRef: string;
  lastChecked?: string;
  errorMessage?: string;
}

// 9. generation_configs
export interface GenerationConfig {
  productId: string;
  numInitiallyGenerated: number;
  imageFormat: 'png' | 'jpeg';
  imageQuality: 'standard' | 'hd';
  // 'OpenRouter' is the default model gateway (REQ-A-002); legacy providers kept for back-compat.
  primaryProvider: 'OpenRouter' | 'Gemini' | 'OpenAI' | 'Midjourney' | 'Stability';
  primaryModel: string;
  primarySecretRef: string;
  fallbackProvider: 'OpenRouter' | 'Gemini' | 'OpenAI' | 'Stability';
  fallbackModel: string;
  fallbackLLM: string;
  fallbackSecretRef: string;
  // Hard cost cap per run (REQ-LGQ-004 / OQ-4). Optional; when absent the server
  // runner applies deriveDefaultCap() (default 12 images / $1.00). See costCap.ts.
  maxImagesPerRun?: number;
  maxUsdPerRun?: number;
}

// 10. quality_gate_configs
export interface QualityGateConfig {
  productId: string;
  // 'OpenRouter' is the default model gateway (REQ-A-002).
  llmProvider: 'OpenRouter' | 'Gemini' | 'OpenAI' | 'Claude';
  model: string;
  secretRef: string;
  fallbackProvider: 'OpenRouter' | 'Gemini' | 'OpenAI';
  fallbackModel: string;
  fallbackSecretRef: string;
  qaPrompt: string;
  referenceImages: string[];
  faultTolerance: 'low' | 'medium' | 'high';
  minAcceptanceScore: number;
  maxRejectedBeforeEscalation: number;
  escalationEmailTemplate: string;
}

// 11. personalization_api_configs
export interface PersonalizationApiConfig {
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

// 12. pod_provider_configs
export interface PodProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  secretRef: string;
  dispatchMode: 'disabled' | 'draft' | 'order';
  productUidMappings: Record<string, string>;
}

// 13. reference_images
export interface ReferenceImage {
  id: string;
  productId: string;
  storagePath: string;
  label: string;
  createdAt: string;
}

// 14. workflow_runs
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
}

// 15. image_artifacts
export interface ImageArtifact {
  id: string;
  workflowRunId: string;
  orderNumber: string;
  productId: string;
  templateId: string;
  iteration: number;
  candidateIndex: number;
  storagePath: string;
  status: 'accepted' | 'rejected' | 'not_selected' | 'failed_generation';
  qaScore: number;
  rejectionReason?: string;
  qaResultJson: string;
  generatedAt: string;
  // Per-candidate provenance (REQ-LGQ-006a). `modelUsed` = the real model id.
  // `promptVarsProvenance` carries ONLY the non-PII derived variables — NEVER
  // raw name/birth_date/birth_place (OQ-3, NFR-3). Optional until the real
  // providers populate them (threaded in T7); tightened to required then.
  modelUsed?: string;
  promptVarsProvenance?: string;
}

// 16. workflow_logs
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

// 17. escalation_events
export interface EscalationEvent {
  id: string;
  runId: string;
  orderNumber: string;
  productId: string;
  iterationReached: number;
  templateId: string;
  minScore: number;
  rejectionReasons: string;
  failedImages: string;
  emailDispatchedTo: string;
  createdAt: string;
}

// 18. provider_health_checks
export interface ProviderHealthCheck {
  id: string;
  providerId: string;
  status: 'MOCK' | 'CONFIGURED' | 'LIVE_DISABLED' | 'ERROR' | 'LIVE';
  checkedAt: string;
  latencyMs?: number;
  message?: string;
}

// 19. quality_criteria
export interface QualityCriteria {
  id: string;
  gateConfigId: string;
  name: string;
  weight: number; // e.g. 0.3
  description: string;
  createdAt: string;
}

// 20. quality_criterion_results
export interface QualityCriterionResult {
  id: string;
  artifactId: string;
  criteriaId: string;
  score: number;
  notes?: string;
  passed: boolean;
}

// 21. quality_issues (defined in taxonomy)

// 22. gateway_issues (defined in taxonomy)

// 23. prompt_performance_snapshots
export interface PromptPerformanceSnapshot {
  id: string;
  templateId: string;
  evaluationInterval: string; // e.g. "7d", "30d"
  totalGenerations: number;
  averageScore: number;
  rejectionRate: number;
  recordedAt: string;
}

// 24. manual_review_tasks
export interface ManualReviewTask {
  id: string;
  runId: string;
  orderNumber: string;
  productId: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  assignedTo?: string;
  completedAt?: string;
}

// 25. qa_calibration_runs
export interface QaCalibrationRun {
  id: string;
  modelEvaluated: string;
  startedAt: string;
  completedAt?: string;
  accuracyScore: number; // calculated divergence index
  status: 'running' | 'completed';
}

// 26. qa_calibration_cases
export interface QaCalibrationCase {
  id: string;
  calibrationRunId: string;
  artifactId: string;
  groundTruthScore: number;
  modelEvaluatedScore: number;
  divergence: number;
}
