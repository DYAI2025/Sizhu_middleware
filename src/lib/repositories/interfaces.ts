import {
  Product,
  ApiProvider,
  ReferenceImage,
  Role,
  QualityGateConfig,
  PersonalizationApiConfig,
  DispatchApproval
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
  // ── Granular template ops (REQ-001, Slice-1) ──────────────────────────────
  // Slice-1 is soft-delete / versioning only: NO method physically removes a
  // template or loses a revision.
  /**
   * UPSERT a template by id (create or update). On an UPDATE the prior snapshot
   * is pushed into the template's revision history (see `listVersions`). Idempotent
   * by id. Returns the saved template.
   */
  saveTemplate(template: PromptTemplate): Promise<PromptTemplate>;
  /**
   * Soft activate/deactivate a template: flips its status to `active`/`archived`.
   * Archived ≠ deleted — the template stays in the list and keeps its versions.
   */
  setActive(id: string, active: boolean): Promise<void>;
  /** Prior revisions of a template, newest first (never physically lost). */
  listVersions(id: string): Promise<PromptTemplate[]>;
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

// ── ApprovalRepository (REQ-002 — sizhu-agent-safe-ops) ─────────────────────────
// The seam for the SOLE load-bearing money gate: a persisted, single-use approval
// record that gates a real POD dispatch. T1 (this slice) defines the contract only;
// the atomic single-use consume BEHAVIOUR (no sequential/concurrent replay, expiry,
// nonce-tamper, and artifactId/run binding) is T2's LocalApprovalRepository.

/** Machine-readable verdict codes for a rejected consume (fail-closed). */
export type ApprovalConsumeErrorCode = 'APPROVAL_TOKEN_INVALID' | 'DISPATCH_NOT_ALLOWED';

/** Input to mint a fresh, unused approval record. */
export interface CreateApprovalInput {
  workflowRunId: string;
  artifactId: string;
  /** Issuer/approver identity (stored on the record as `approverId`). */
  approver: string;
  /** ISO timestamp after which the record is expired. */
  expiresAt: string;
}

/** Input to consume (single-use) an approval record at dispatch time. */
export interface ConsumeApprovalInput {
  recordId: string;
  workflowRunId: string;
  artifactId: string;
  /** The nonce minted with the record; a tampered/forged nonce must be rejected (T2). */
  nonce?: string;
}

/**
 * Result of a consume attempt. The RECORD — not a caller-controlled body field — is
 * the decider: a valid, matching, unused, unexpired record yields `{ ok: true }`;
 * any other case yields `{ ok: false }` with a fail-closed verdict code.
 */
export type ConsumeApprovalResult =
  | { ok: true; record: DispatchApproval }
  | { ok: false; error_code: ApprovalConsumeErrorCode };

export interface ApprovalRepository {
  /** Mint a new `unused` approval record bound to (workflowRunId, artifactId). */
  createApproval(input: CreateApprovalInput): Promise<DispatchApproval>;
  /** Look up a record by its id (the nonce). */
  getApproval(recordId: string): Promise<DispatchApproval | null>;
  /**
   * Atomically consume a single-use record (T2 behaviour): returns the record ONLY
   * if it exists, is unexpired, is still `unused`, and its (workflowRunId, artifactId)
   * match the call — flipping it to `used` in one critical section so no sequential
   * or concurrent replay can succeed. Otherwise a fail-closed `{ ok: false }` verdict.
   */
  consumeApproval(input: ConsumeApprovalInput): Promise<ConsumeApprovalResult>;
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
