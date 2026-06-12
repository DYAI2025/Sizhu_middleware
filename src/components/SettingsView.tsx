import { useState } from 'react';
import { Database, AlertCircle, RefreshCw, Layers, Terminal, Copy, Check } from 'lucide-react';

export default function SettingsView() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const TABLES = [
    { name: 'app_roles', columns: 'role (PK, text), description (text)' },
    { name: 'app_users', columns: 'id (PK, uuid), email (text), role (FK text)' },
    { name: 'permissions', columns: 'id (PK, text), name (text), description (text)' },
    { name: 'role_permissions', columns: 'id (PK, serial), role (FK text), permission_id (FK text)' },
    { name: 'shop_products', columns: 'id (PK, text), shop_provider (text), external_product_id (text), external_variant_id (text), title (text), product_type (text), is_active (bool), active_template_id (FK text)' },
    { name: 'prompt_templates', columns: 'id (PK, text), name (text), content (markdown text), version (integer), status (text), created_at (timestamp), created_by (text)' },
    { name: 'product_template_bindings', columns: 'id (PK, text), product_id (FK text), template_id (FK text), bound_at (timestamp)' },
    { name: 'api_providers', columns: 'id (PK, text), provider_name (text), default_endpoint (text), api_key_secret_ref (text)' },
    { name: 'generation_configs', columns: 'id (PK, serial), product_id (FK text), num_initially_generated (int), image_format (text), image_quality (text), primary_provider (text), primary_model (text), primary_secret_ref (text), fallback_provider (text), fallback_model (text), fallback_llm (text), fallback_secret_ref (text)' },
    { name: 'quality_gate_configs', columns: 'id (PK, serial), product_id (FK text), llm_provider (text), model (text), secret_ref (text), qa_prompt (text), min_acceptance_score (int), max_rejected_before_escalation (int), escalation_email_template (text), fault_tolerance (text)' },
    { name: 'reference_images', columns: 'id (PK, serial), product_id (FK text), storage_path (text), uploaded_at (timestamp)' },
    { name: 'personalization_api_configs', columns: 'id (PK, serial), name (text), api_url (text), secret_ref (text), fallback_birth_time (text), fallback_birth_known (bool), fallback_birth_source (text)' },
    { name: 'pod_provider_configs', columns: 'id (PK, serial), name (text), base_url (text), secret_ref (text), dispatch_mode (text), product_uid_mappings (jsonb)' },
    { name: 'workflow_runs', columns: 'id (PK, text), order_number (text), product_id (FK text), customer_name (text), birth_date (date), birth_time (time), birth_time_known (bool), birth_place (text), status (text), started_at (timestamp), completed_at (timestamp), current_iteration (integer)' },
    { name: 'image_artifacts', columns: 'id (PK, text), workflow_run_id (FK text), order_number (text), product_id (FK text), template_id (FK text), iteration (int), candidate_index (int), storage_path (text), status (text), qa_score (int), rejection_reason (text), qa_result_json (jsonb), generated_at (timestamp)' },
    { name: 'workflow_logs', columns: 'id (PK, text), run_id (FK text), order_number (text), timestamp (timestamp), step (text), message (text), status (text), provider_used (text), model_used (text), iteration (int)' }
  ];

  const RAW_SQL_CODE = `-- Bazzi Middleware PostgreSQL DB Model
-- Supports Supabase / Drizzle Client integrations

CREATE TABLE app_roles (
  role VARCHAR(50) PRIMARY KEY,
  description TEXT
);

CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) REFERENCES app_roles(role) DEFAULT 'Observer'
);

CREATE TABLE prompt_templates (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  version INT DEFAULT 1,
  status VARCHAR(30) CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE TABLE shop_products (
  id VARCHAR(100) PRIMARY KEY,
  shop_provider VARCHAR(50) CHECK (shop_provider IN ('Etsy', 'Eatsy')),
  external_product_id VARCHAR(100) NOT NULL,
  external_variant_id VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  product_type VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  active_template_id VARCHAR(100) REFERENCES prompt_templates(id)
);

-- Row Level Security (RLS) activation rules
ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can rewrite catalog" 
  ON shop_products FOR ALL 
  USING (auth.jwt() ->> 'role' IN ('Owner', 'Admin'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('Owner', 'Admin'));

CREATE POLICY "Observers can read catalog"
  ON shop_products FOR SELECT
  USING (TRUE);
`;

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleReset = () => {
    if (window.confirm('Wipe Bazzi console states completely? This restores default templates, products, and configurations.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#141414]" id="settings-architect-hud">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d1d1cf] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#141414] tracking-tight font-sans">Settings & DB Modeler</h1>
          <p className="text-xs text-slate-500 mt-1">Study Postgres schema registers, extract SQL builds, and handle local store seeds</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* PostgreSQL diagram schemas */}
        <div className="lg:col-span-7 bg-white border border-[#d1d1cf] p-5 rounded-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#d1d1cf] pb-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" /> PostgreSQL Table Registry Mapped
            </h3>
            <span className="text-[9px] font-mono bg-blue-50 border border-blue-250 text-blue-800 font-bold px-2 py-0.5 rounded-sm tracking-wide">
              TABLES: 16
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs max-h-[360px] overflow-y-auto pr-1">
            {TABLES.map((t, idx) => (
              <div key={idx} className="p-3 bg-slate-50 border border-[#d1d1cf] rounded-sm flex flex-col justify-between hover:border-slate-400 transition">
                <div>
                  <strong className="text-[#141414] font-mono font-bold text-[12px]">{t.name}</strong>
                  <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed font-mono">{t.columns}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-sm text-blue-800 text-[11px] font-mono leading-normal">
            <strong>Relational Integrity Principle:</strong> Database constructs enforce CASCADE triggers on bindings, active/suspended product indices, and secure row restrictions matching our backend models.
          </div>
        </div>

        {/* Action center side */}
        <div className="lg:col-span-5 bg-white border border-[#d1d1cf] p-5 rounded-sm space-y-4 flex flex-col justify-between">
          
          {/* Download segment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#d1d1cf] pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-slate-400" /> SQL Schema Exporter
              </h3>
              <button
                onClick={() => copyToClipboard(RAW_SQL_CODE, 1)}
                className="bg-[#141414] border border-black hover:opacity-90 text-white font-mono rounded-sm py-1 px-2.5 transition text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedIndex === 1 ? <Check className="w-3.5 h-3.5 text-emerald-450" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIndex === 1 ? 'COPIED' : 'COPY'}
              </button>
            </div>

            <pre className="bg-[#141414] border border-[#d1d1cf] text-emerald-400 p-3 rounded-sm text-[9px] font-mono leading-relaxed h-[200px] overflow-y-auto shadow-inner">
              {RAW_SQL_CODE}
            </pre>
          </div>

          {/* Hard Reset Segment */}
          <div className="border-t border-[#d1d1cf] pt-4 space-y-2">
            <h4 className="text-xs font-bold text-red-600 uppercase font-mono tracking-widest flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" /> Operation Security Limit
            </h4>
            <p className="text-slate-400 text-[11px] font-mono leading-normal">
              Need a clear canvas to test Owner/Observer simulation profiles? Trigger a database hard reset to restore default products and maps seeds status.
            </p>
            <button
              onClick={handleReset}
              className="w-full bg-red-650 hover:bg-red-700 text-white font-bold border border-red-700 font-mono p-2.5 rounded-sm text-xs cursor-pointer tracking-wider uppercase transition text-center"
            >
              Hard Reset Database Seeds
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
