-- =========================================================================
-- BAZZI MIDDLEWARE CONSOLE - POSTGRESQL & SUPABASE AUTH RBAC SCHEMA
-- =========================================================================
-- This script provisions the backend security structures, defining app roles,
-- system permissions, and Row-Level Security (RLS) policies that are enforced
-- by the database client when a user attaches an auth jwt.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. APP ROLES TABLE
CREATE TABLE IF NOT EXISTS app_roles (
    role VARCHAR(32) PRIMARY KEY,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial seed roles
INSERT INTO app_roles (role, description) VALUES
('Owner', 'Full account ownership. Can modify billing, configuration bindings, credentials, and security permissions.'),
('Admin', 'Full operational access. Can configure templates, products, and triggers, and bypass quality gates.'),
('Observer', 'Read-only access. Can inspect dashboards, logs, and artifacts, but is blocked from writing configurations/orders.'),
('Custom', 'Restricted set of permissions dynamically configured by team Administrators.')
ON CONFLICT (role) DO UPDATE SET description = EXCLUDED.description;


-- 2. SYSTEM PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed system fine-grained permission definitions
INSERT INTO permissions (id, name, description) VALUES
('view_dashboard', 'View Dashboard', 'Access dashboard metrics and active timeline streams'),
('manage_products', 'Manage Products', 'Create, edit, and bind prompt templates to shop product catalog'),
('manage_templates', 'Manage Templates', 'Upload, modify, version, and edit Markdown prompt blueprints'),
('manage_credentials', 'Manage Credentials', 'View, add, and override secure API tokens & credentials'),
('run_simulation', 'Run Simulator', 'Initiate simulation order workflows and webhook pipelines'),
('manage_roles', 'Modify Roles & Permissions', 'Adjust granular permission matrix assignments for roles/team members')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;


-- 3. ROLE PERMISSIONS LINK TABLE
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(32) REFERENCES app_roles(role) ON DELETE CASCADE,
    permission_id VARCHAR(64) REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_id)
);

-- Seed defaults permissions matrix
INSERT INTO role_permissions (role, permission_id) VALUES
('Owner', 'view_dashboard'),
('Owner', 'manage_products'),
('Owner', 'manage_templates'),
('Owner', 'manage_credentials'),
('Owner', 'run_simulation'),
('Owner', 'manage_roles'),

('Admin', 'view_dashboard'),
('Admin', 'manage_products'),
('Admin', 'manage_templates'),
('Admin', 'manage_credentials'),
('Admin', 'run_simulation'),

('Observer', 'view_dashboard'),

('Custom', 'view_dashboard'),
('Custom', 'run_simulation')
ON CONFLICT DO NOTHING;


-- 4. PROFILE / USER TABLE LINKED TO SUPABASE AUTH.USERS
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL DEFAULT 'Observer' REFERENCES app_roles(role),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 4b. APP SETTINGS (key-value) — single-row homes for console-level settings.
-- The RBAC "active role" mirrors the Local store's single `active_role` value
-- (there is no per-table column for it); SupabaseRoleRepository upserts it here
-- under key 'active_role' (default 'Owner').
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- 5. PRODUCTS TABLE (PRE-REQUISITE)
CREATE TABLE IF NOT EXISTS shop_products (
    id VARCHAR(64) PRIMARY KEY,
    shop_provider VARCHAR(32) NOT NULL,
    external_product_id VARCHAR(64) NOT NULL,
    external_variant_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    product_type VARCHAR(128),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    active_template_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PROMPT TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS prompt_templates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_by VARCHAR(32) DEFAULT 'Owner',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add active_template_id constraint to shop_products after both exist
ALTER TABLE shop_products DROP CONSTRAINT IF EXISTS fk_active_template;
ALTER TABLE shop_products ADD CONSTRAINT fk_active_template FOREIGN KEY (active_template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL;

-- 7. API PROVIDERS TABLE
CREATE TABLE IF NOT EXISTS api_providers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'MOCK',
    base_url VARCHAR(255),
    secret_ref VARCHAR(128),
    last_checked TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. WORKFLOW RUNS TABLE
CREATE TABLE IF NOT EXISTS workflow_runs (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) REFERENCES shop_products(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    current_iteration INTEGER DEFAULT 1,
    accepted_artifact_id VARCHAR(64),
    personalization_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. IMAGE ARTIFACTS TABLE
CREATE TABLE IF NOT EXISTS image_artifacts (
    id VARCHAR(64) PRIMARY KEY,
    workflow_run_id VARCHAR(64) REFERENCES workflow_runs(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) REFERENCES shop_products(id) ON DELETE CASCADE,
    template_id VARCHAR(64) REFERENCES prompt_templates(id) ON DELETE SET NULL,
    iteration INTEGER NOT NULL DEFAULT 1,
    candidate_index INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'not_selected',
    qa_score INTEGER,
    rejection_reason TEXT,
    qa_result_json TEXT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. WORKFLOW LOGS TABLE
CREATE TABLE IF NOT EXISTS workflow_logs (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) REFERENCES workflow_runs(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    step VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'info',
    provider_used VARCHAR(128),
    model_used VARCHAR(128),
    iteration INTEGER
);


-- =========================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Trigger to automatically insert newly signed up Supabase Auth users into app_users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.app_users (id, email, role)
  VALUES (new.id, new.email, 'Observer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Map trigger to auth.users schema
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- A. Enable RLS on core configuration tables
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;


-- B. HELPER SECURITY FUNCTION: check if user has standard permission
CREATE OR REPLACE FUNCTION public.has_permission(p_id VARCHAR(64))
RETURNS BOOLEAN AS $$
DECLARE
    v_role VARCHAR(32);
    v_has_perm BOOLEAN;
BEGIN
    -- Resolve current user auth ID role
    SELECT role INTO v_role FROM public.app_users WHERE id = auth.uid();
    
    IF v_role IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check permissions table linkages
    SELECT EXISTS (
        SELECT 1 FROM public.role_permissions 
        WHERE role = v_role AND permission_id = p_id
    ) INTO v_has_perm;
    
    RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- C. DEFINE POLICIES ON USER PROFILES table
CREATE POLICY user_read_own_profile ON app_users
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY owner_view_all_profiles ON app_users
    FOR SELECT TO authenticated
    USING (public.has_permission('manage_roles'));

CREATE POLICY owner_modify_all_profiles ON app_users
    FOR ALL TO authenticated
    USING (public.has_permission('manage_roles'));


-- D. DEFINE POLICIES ON ROLE PERMISSIONS MATRIX table
CREATE POLICY select_matrix ON role_permissions
    FOR SELECT TO authenticated
    USING (TRUE); -- accessible by everyone logged in for client-side capability assertions

CREATE POLICY modify_matrix ON role_permissions
    FOR ALL TO authenticated
    USING (public.has_permission('manage_roles'));


-- E. DEFINE POLICIES ON SHOP PRODUCTS table
CREATE POLICY select_products ON shop_products
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_products ON shop_products
    FOR ALL TO authenticated
    USING (public.has_permission('manage_products'));


-- F. DEFINE POLICIES ON PROMPT TEMPLATES table
CREATE POLICY select_templates ON prompt_templates
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_templates ON prompt_templates
    FOR ALL TO authenticated
    USING (public.has_permission('manage_templates'));


-- G. DEFINE POLICIES ON API PROVIDERS table
CREATE POLICY select_providers ON api_providers
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_providers ON api_providers
    FOR ALL TO authenticated
    USING (public.has_permission('manage_credentials'));


-- H. DEFINE POLICIES ON WORKFLOW RUNS table
CREATE POLICY select_runs ON workflow_runs
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_runs ON workflow_runs
    FOR ALL TO authenticated
    USING (public.has_permission('run_simulation'));


-- I. DEFINE POLICIES ON IMAGE ARTIFACTS table
CREATE POLICY select_artifacts ON image_artifacts
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_artifacts ON image_artifacts
    FOR ALL TO authenticated
    USING (public.has_permission('run_simulation'));


-- J. DEFINE POLICIES ON WORKFLOW LOGS table
CREATE POLICY select_logs ON workflow_logs
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_logs ON workflow_logs
    FOR ALL TO authenticated
    USING (public.has_permission('run_simulation'));


-- =========================================================================
-- ADDITIONAL SUBSYSTEM SCHEMA & METRICS TABLES (26 TOTAL ENTITIES)
-- =========================================================================

-- 11. PRODUCT TEMPLATE BINDINGS TABLE
CREATE TABLE IF NOT EXISTS product_template_bindings (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) REFERENCES shop_products(id) ON DELETE CASCADE,
    template_id VARCHAR(64) REFERENCES prompt_templates(id) ON DELETE CASCADE,
    bound_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. GENERATION CONFIGS TABLE
CREATE TABLE IF NOT EXISTS generation_configs (
    product_id VARCHAR(64) PRIMARY KEY REFERENCES shop_products(id) ON DELETE CASCADE,
    num_initially_generated INTEGER NOT NULL DEFAULT 3,
    image_format VARCHAR(16) NOT NULL DEFAULT 'png',
    image_quality VARCHAR(16) NOT NULL DEFAULT 'hd',
    primary_provider VARCHAR(64) NOT NULL DEFAULT 'OpenAI',
    primary_model VARCHAR(64) NOT NULL,
    primary_secret_ref VARCHAR(128) NOT NULL,
    fallback_provider VARCHAR(64) NOT NULL DEFAULT 'Gemini',
    fallback_model VARCHAR(64) NOT NULL,
    fallback_llm VARCHAR(64) NOT NULL,
    fallback_secret_ref VARCHAR(128) NOT NULL
);

-- 13. QUALITY GATE CONFIGS TABLE
CREATE TABLE IF NOT EXISTS quality_gate_configs (
    product_id VARCHAR(64) PRIMARY KEY REFERENCES shop_products(id) ON DELETE CASCADE,
    llm_provider VARCHAR(64) NOT NULL DEFAULT 'Gemini',
    model VARCHAR(64) NOT NULL,
    secret_ref VARCHAR(128) NOT NULL,
    fallback_provider VARCHAR(64) NOT NULL DEFAULT 'OpenAI',
    fallback_model VARCHAR(64) NOT NULL,
    fallback_secret_ref VARCHAR(128) NOT NULL,
    qa_prompt TEXT NOT NULL,
    fault_tolerance VARCHAR(16) NOT NULL DEFAULT 'low',
    min_acceptance_score INTEGER NOT NULL DEFAULT 80,
    max_rejected_before_escalation INTEGER NOT NULL DEFAULT 3,
    escalation_email_template TEXT NOT NULL
);

-- 14. PERSONALIZATION API CONFIGS TABLE
CREATE TABLE IF NOT EXISTS personalization_api_configs (
    name VARCHAR(128) PRIMARY KEY,
    api_url VARCHAR(255) NOT NULL,
    secret_ref VARCHAR(128) NOT NULL,
    birth_time_fallback JSONB NOT NULL DEFAULT '{"birth_time":"12:00","birth_time_known":false,"birth_time_source":"default_noon"}'::jsonb
);

-- 15. POD PROVIDER CONFIGS TABLE
CREATE TABLE IF NOT EXISTS pod_provider_configs (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL DEFAULT 'Gelato',
    base_url VARCHAR(255) NOT NULL,
    secret_ref VARCHAR(128) NOT NULL,
    dispatch_mode VARCHAR(16) NOT NULL DEFAULT 'draft',
    product_uid_mappings JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 16. REFERENCE IMAGES TABLE
CREATE TABLE IF NOT EXISTS reference_images (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) REFERENCES shop_products(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. ESCALATION EVENTS TABLE
CREATE TABLE IF NOT EXISTS escalation_events (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) REFERENCES workflow_runs(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) REFERENCES shop_products(id) ON DELETE CASCADE,
    iteration_reached INTEGER NOT NULL,
    template_id VARCHAR(64) REFERENCES prompt_templates(id) ON DELETE SET NULL,
    min_score INTEGER NOT NULL,
    rejection_reasons TEXT NOT NULL,
    failed_images TEXT NOT NULL,
    email_dispatched_to VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. PROVIDER HEALTH CHECKS TABLE
CREATE TABLE IF NOT EXISTS provider_health_checks (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) REFERENCES api_providers(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    latency_ms INTEGER,
    message TEXT
);

-- 19. QUALITY CRITERIA TABLE
CREATE TABLE IF NOT EXISTS quality_criteria (
    id VARCHAR(64) PRIMARY KEY,
    gate_config_id VARCHAR(64) REFERENCES quality_gate_configs(product_id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    weight NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 20. QUALITY CRITERION RESULTS TABLE
CREATE TABLE IF NOT EXISTS quality_criterion_results (
    id VARCHAR(64) PRIMARY KEY,
    artifact_id VARCHAR(64) REFERENCES image_artifacts(id) ON DELETE CASCADE,
    criteria_id VARCHAR(64) REFERENCES quality_criteria(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    notes TEXT,
    passed BOOLEAN NOT NULL DEFAULT TRUE
);

-- 21. QUALITY ISSUES TABLE
CREATE TABLE IF NOT EXISTS quality_issues (
    id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'medium',
    message TEXT NOT NULL,
    artifact_id VARCHAR(64) REFERENCES image_artifacts(id) ON DELETE CASCADE,
    resolved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 22. GATEWAY ISSUES TABLE
CREATE TABLE IF NOT EXISTS gateway_issues (
    id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    provider_id VARCHAR(64) REFERENCES api_providers(id) ON DELETE CASCADE,
    error_message TEXT NOT NULL,
    retry_attempt INTEGER NOT NULL DEFAULT 0,
    resolved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 23. PROMPT PERFORMANCE SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS prompt_performance_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    template_id VARCHAR(64) REFERENCES prompt_templates(id) ON DELETE CASCADE,
    evaluation_interval VARCHAR(16) NOT NULL DEFAULT '7d',
    total_generations INTEGER NOT NULL DEFAULT 0,
    average_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    rejection_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 24. MANUAL REVIEW TASKS TABLE
CREATE TABLE IF NOT EXISTS manual_review_tasks (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) REFERENCES workflow_runs(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) REFERENCES shop_products(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    assigned_to UUID REFERENCES app_users(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 25. QA CALIBRATION RUNS TABLE
CREATE TABLE IF NOT EXISTS qa_calibration_runs (
    id VARCHAR(64) PRIMARY KEY,
    model_evaluated VARCHAR(128) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    accuracy_score NUMERIC(5,2) DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'running'
);

-- 26. QA CALIBRATION CASES TABLE
CREATE TABLE IF NOT EXISTS qa_calibration_cases (
    id VARCHAR(64) PRIMARY KEY,
    calibration_run_id VARCHAR(64) REFERENCES qa_calibration_runs(id) ON DELETE CASCADE,
    artifact_id VARCHAR(64) REFERENCES image_artifacts(id) ON DELETE CASCADE,
    ground_truth_score INTEGER NOT NULL,
    model_evaluated_score INTEGER NOT NULL,
    divergence NUMERIC(5,2) NOT NULL DEFAULT 0.00
);

-- 27. DISPATCH APPROVALS TABLE (REQ-002 — sizhu-agent-safe-ops)
-- The SOLE load-bearing money gate: a persisted, single-use approval record that gates
-- a real POD dispatch. Mirrors the DispatchApproval domain shape (src/types.ts). This is
-- the production persistence CONTRACT only — no runtime persistence is wired yet (the
-- SupabaseApprovalRepository throws SUPABASE_NOT_CONFIGURED). Notes for the eventual
-- implementation, encoded as constraints so the contract is unambiguous:
--   * `nonce` is the secret consume token, DISTINCT from `id` (UNIQUE so it is a lookup key).
--   * `status` is the single-use lifecycle: minted 'unused', flipped to 'used' exactly once.
--   * (workflow_run_id, artifact_id) bind the approval to a specific run + artifact.
--   * `used_at` is set when, and only when, status flips to 'used'.
CREATE TABLE IF NOT EXISTS dispatch_approvals (
    id VARCHAR(64) PRIMARY KEY,
    workflow_run_id VARCHAR(64) NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    artifact_id VARCHAR(64) NOT NULL REFERENCES image_artifacts(id) ON DELETE CASCADE,
    approver_id VARCHAR(255) NOT NULL,
    nonce VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITH TIME ZONE
);


-- =========================================================================
-- ADDITIONAL ROW-LEVEL SECURITY POLICIES
-- =========================================================================

-- K. Enable RLS on additional configuration/operational tables
ALTER TABLE product_template_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_gate_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE personalization_api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_criterion_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_calibration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_calibration_cases ENABLE ROW LEVEL SECURITY;

-- L. Define security policies for new tables
CREATE POLICY select_bindings ON product_template_bindings FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_bindings ON product_template_bindings FOR ALL TO authenticated USING (public.has_permission('manage_products'));

CREATE POLICY select_gencfgs ON generation_configs FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_gencfgs ON generation_configs FOR ALL TO authenticated USING (public.has_permission('manage_products'));

CREATE POLICY select_qualcfgs ON quality_gate_configs FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_qualcfgs ON quality_gate_configs FOR ALL TO authenticated USING (public.has_permission('manage_products'));

CREATE POLICY select_perscfgs ON personalization_api_configs FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_perscfgs ON personalization_api_configs FOR ALL TO authenticated USING (public.has_permission('manage_products'));

CREATE POLICY select_podcfgs ON pod_provider_configs FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_podcfgs ON pod_provider_configs FOR ALL TO authenticated USING (public.has_permission('manage_products'));

CREATE POLICY select_refimages ON reference_images FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_refimages ON reference_images FOR ALL TO authenticated USING (public.has_permission('manage_products'));

-- Operational logs & events
CREATE POLICY select_escalations ON escalation_events FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_escalations ON escalation_events FOR ALL TO authenticated USING (public.has_permission('run_simulation'));

CREATE POLICY select_healthchecks ON provider_health_checks FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_healthchecks ON provider_health_checks FOR ALL TO authenticated USING (public.has_permission('manage_credentials'));

CREATE POLICY select_criteria ON quality_criteria FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_criteria ON quality_criteria FOR ALL TO authenticated USING (public.has_permission('manage_products'));

CREATE POLICY select_critresults ON quality_criterion_results FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_critresults ON quality_criterion_results FOR ALL TO authenticated USING (public.has_permission('run_simulation'));

CREATE POLICY select_qualissues ON quality_issues FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_qualissues ON quality_issues FOR ALL TO authenticated USING (public.has_permission('run_simulation'));

CREATE POLICY select_gateissues ON gateway_issues FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_gateissues ON gateway_issues FOR ALL TO authenticated USING (public.has_permission('run_simulation'));

CREATE POLICY select_snapshots ON prompt_performance_snapshots FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_snapshots ON prompt_performance_snapshots FOR ALL TO authenticated USING (public.has_permission('manage_templates'));

CREATE POLICY select_tasks ON manual_review_tasks FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_tasks ON manual_review_tasks FOR ALL TO authenticated USING (public.has_permission('run_simulation'));

CREATE POLICY select_calruns ON qa_calibration_runs FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_calruns ON qa_calibration_runs FOR ALL TO authenticated USING (public.has_permission('manage_templates'));

CREATE POLICY select_calcases ON qa_calibration_cases FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_calcases ON qa_calibration_cases FOR ALL TO authenticated USING (public.has_permission('manage_templates'));

-- M. DISPATCH APPROVALS (REQ-002 — the load-bearing money gate)
-- RLS mirrors the existing operational tables. READ is the standard dashboard read.
-- WRITE (mint/consume an approval) is gated to the highest-privilege operational
-- permission ('manage_credentials' → Owner/Admin only; never Observer/Custom), matching
-- the real-money sensitivity of the gate within the existing permission vocabulary.
-- NOTE: RLS is a defence-in-depth layer; it is NOT the single-use atomicity guard. The
-- unused→used flip / no-replay invariant is enforced by the ApprovalRepository consume
-- logic, and the actual server-side authorization remains the apiGuard/MFA boundary.
ALTER TABLE dispatch_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_approvals ON dispatch_approvals FOR SELECT TO authenticated USING (public.has_permission('view_dashboard'));
CREATE POLICY write_approvals ON dispatch_approvals FOR ALL TO authenticated USING (public.has_permission('manage_credentials'));



-- ============================================================================
-- VISUAL WORKFLOWS (feat/supabase-data-layer) — per-product node/edge graph (jsonb),
-- keyed by product_id. The data API is server-side (service-role); RLS is defense-in-depth.
-- ============================================================================
CREATE TABLE IF NOT EXISTS visual_workflows (
    product_id VARCHAR(64) PRIMARY KEY REFERENCES shop_products(id) ON DELETE CASCADE,
    graph JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE visual_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY select_visual_workflows ON visual_workflows FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY write_visual_workflows ON visual_workflows FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
