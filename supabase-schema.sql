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


-- E. SAMPLE APPLICATION TABLE - PRODUCTS SECURITY
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_products ON shop_products
    FOR SELECT TO authenticated
    USING (public.has_permission('view_dashboard'));

CREATE POLICY write_products ON shop_products
    FOR ALL TO authenticated
    USING (public.has_permission('manage_products'));
