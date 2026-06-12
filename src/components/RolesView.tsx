import React, { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
import { AppRole, RolePermissions, AppRoleName, AppUser } from '../types';
import {
  Shield,
  Check,
  User,
  Settings,
  ShieldCheck,
  Plus,
  Trash2,
  Database,
  Terminal,
  Copy,
  Info,
  Users,
  AlertTriangle,
  Lock,
  RefreshCw
} from 'lucide-react';

export default function RolesView() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'sql'>('matrix');
  const [activeRoleName, setActiveRoleName] = useState<AppRoleName>('Owner');
  const [roleBindings, setRoleBindings] = useState<RolePermissions[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<{ id: string; name: string; description: string }[]>([]);
  
  // Real Persistent Mock Users State
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRoleName>('Observer');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [roleName, bindings, rolesList, permsList, usersList] = await Promise.all([
        appServices.roles.getActiveRole(),
        appServices.roles.getRolePermissions(),
        appServices.roles.getRoles(),
        appServices.roles.getPermissions(),
        appServices.roles.getUsers()
      ]);
      setActiveRoleName(roleName);
      setRoleBindings(bindings);
      setRoles(rolesList as AppRole[]);
      setPermissions(permsList);
      setUsers(usersList);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRoleSwitch = async (role: AppRoleName) => {
    try {
      await appServices.roles.setActiveRole(role);
      setActiveRoleName(role);
      // Broadcast active role update
      window.dispatchEvent(new Event('bazzi_role_changed'));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleTogglePermission = async (role: AppRoleName, permId: string) => {
    // Safety check: Owner and Admin cannot be degraded in this console.
    if (role === 'Owner' || role === 'Admin') return;
    
    const list = [...roleBindings];
    const bindingIndex = list.findIndex(r => r.role === role);
    if (bindingIndex !== -1) {
      const perms = [...list[bindingIndex].permissions];
      const permIndex = perms.indexOf(permId);
      
      if (permIndex !== -1) {
        perms.splice(permIndex, 1);
      } else {
        perms.push(permId);
      }
      
      list[bindingIndex].permissions = perms;
      try {
        await appServices.roles.saveRolePermissions(list);
        setRoleBindings(list);
      } catch (e) {
        alert((e as Error).message);
      }
    }
  };

  // ADD simulated TEAM MEMBER (Enforces Supabase auth metadata simulation)
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserEmail.includes('@')) {
      alert('Provide a valid email address.');
      return;
    }

    const newUser: AppUser = {
      id: `usr-${Date.now()}`,
      email: newUserEmail,
      role: newUserRole,
      createdAt: new Date().toISOString()
    };

    const updated = [...users, newUser];
    try {
      await appServices.roles.saveUsers(updated);
      setUsers(updated);
      setNewUserEmail('');
      
      // Broadcast updates to alert surrounding layouts
      window.dispatchEvent(new Event('bazzi_role_changed'));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // REMOVE simulated user
  const handleDeleteUser = async (id: string) => {
    const backup = users.find(u => u.id === id);
    if (backup && backup.email === 'Ben.Poersch@gmail.com') {
      alert('The primary system owner account cannot be deleted.');
      return;
    }

    if (window.confirm(`Delete user ${backup?.email}?`)) {
      const filtered = users.filter(u => u.id !== id);
      try {
        await appServices.roles.saveUsers(filtered);
        setUsers(filtered);
      } catch (e) {
        alert((e as Error).message);
      }
    }
  };

  // UPDATE role assigned to existing simulated user
  const handleUpdateUserRole = async (id: string, newRole: AppRoleName) => {
    const updated = users.map(u => {
      if (u.id === id) {
        return { ...u, role: newRole };
      }
      return u;
    });
    try {
      await appServices.roles.saveUsers(updated);
      setUsers(updated);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleCopySQL = () => {
    const sqlText = `
-- Bazzi Console PostgreSQL schema:
CREATE TABLE IF NOT EXISTS app_roles (
    role VARCHAR(32) PRIMARY KEY,
    description TEXT
);
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL DEFAULT 'Observer' REFERENCES app_roles(role)
);
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own_profile ON app_users FOR SELECT USING (id = auth.uid());
    `.trim();
    navigator.clipboard.writeText(sqlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#141414]" id="roles-permissions-hud">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d1d1cf] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#141414] tracking-tight font-sans">Security & Account RBAC</h1>
          <p className="text-xs text-slate-500 mt-1">Configure user roles simulation, manage database team roles, and view Postgres Row Level Security (RLS) scopes</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 font-mono text-xs font-bold rounded-sm border uppercase ${
              activeTab === 'matrix' 
                ? 'bg-[#141414] text-white border-black' 
                : 'bg-white text-slate-600 border-[#d1d1cf] hover:bg-slate-50'
            }`}
          >
            Permissions Matrix
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 font-mono text-xs font-bold rounded-sm border uppercase flex items-center gap-1.5 ${
              activeTab === 'sql' 
                ? 'bg-[#141414] text-white border-black' 
                : 'bg-white text-slate-600 border-[#d1d1cf] hover:bg-slate-50'
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Postgres & RLS Policies
          </button>
        </div>
      </div>

      {/* Role Switcher banner (Simulation engine overrides JWT permissions instantly) */}
      <div className="bg-[#141414] text-white p-5 rounded-sm border border-black flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm">
        <div className="space-y-1">
          <span className="text-[9px] bg-amber-400 text-slate-950 font-mono px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">Simulation Profile Selector</span>
          <h2 className="text-base font-bold font-mono uppercase tracking-wide mt-1">Override Current User Profile Context</h2>
          <p className="text-xs text-slate-400">Switching profiles overrides middleware token authentication permissions on the fly.</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <button
              key={r.role}
              id={`switch-role-${r.role}`}
              onClick={() => handleRoleSwitch(r.role)}
              className={`text-[10px] font-bold uppercase font-mono py-2 px-3.5 rounded-sm border transition cursor-pointer ${
                activeRoleName === r.role 
                  ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm' 
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Simulate: {r.role}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'matrix' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Col: Descriptors side */}
            <div className="lg:col-span-4 bg-white border border-[#d1d1cf] rounded-sm p-4 space-y-4">
              <div className="border-b border-[#d1d1cf] pb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414] font-mono flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-450" />
                  Role profiles definitions
                </h3>
              </div>

              <div className="space-y-3">
                {roles.map((r) => {
                  const worksAsActive = activeRoleName === r.role;
                  return (
                    <div 
                      key={r.role} 
                      className={`p-3 rounded-sm border text-xs leading-relaxed space-y-1 transition ${
                        worksAsActive ? 'bg-blue-50/50 border-blue-400 border-l-2 border-l-blue-500' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono">
                        <strong className="text-[#141414] font-bold text-[11px]">{r.role} profile</strong>
                        {worksAsActive ? (
                          <span className="text-[9px] bg-blue-105 text-blue-800 border border-blue-250 font-mono font-bold px-1.5 py-0.2 rounded-sm uppercase tracking-wide">
                            ACTIVE
                          </span>
                        ) : null}
                      </div>
                      <p className="text-slate-500 text-[11px] leading-snug">{r.description}</p>
                    </div>
                  );
                })}
              </div>

              <div className="bg-amber-50 border border-amber-250 rounded-sm p-4 text-[11px] text-amber-800 font-mono leading-normal">
                <strong>Observer Restriction Rule:</strong> Observer queries are validated by Postgres database client profiles. No schema writing, simulation runs, or mutation dispatch permitted.
              </div>
            </div>

            {/* Right Col: Permissions check table */}
            <div className="lg:col-span-8 bg-white border border-[#d1d1cf] rounded-sm p-4 space-y-4 overflow-hidden">
              <div className="border-b border-[#d1d1cf] pb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-slate-455" />
                  Permissions authentication Matrix
                </h3>
              </div>

              <div className="overflow-x-auto border border-[#d1d1cf] rounded-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#d1d1cf] text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest">
                      <th className="py-2.5 px-3">System Permissions Code</th>
                      {roles.map(r => (
                        <th key={r.role} className="py-2.5 px-3 text-center border-l border-[#d1d1cf]">{r.role}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {permissions.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#141414] font-mono text-[11px] uppercase tracking-wide">{p.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{p.description}</div>
                        </td>

                        {roles.map((r) => {
                          const permissionsObj = roleBindings.find(b => b.role === r.role);
                          const hasPerm = permissionsObj?.permissions.includes(p.id) || false;
                          const isImmutable = r.role === 'Owner' || r.role === 'Admin';
                          
                          return (
                            <td key={r.role} className="py-3 px-3 text-center border-l border-[#d1d1cf]">
                              <button
                                disabled={isImmutable}
                                onClick={() => handleTogglePermission(r.role, p.id)}
                                className={`p-1 transition rounded-sm ${
                                  isImmutable ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-150'
                                }`}
                              >
                                {hasPerm ? (
                                  <Check className={`w-4 h-4 mx-auto ${
                                    isImmutable ? 'text-blue-600 font-black' : 'text-slate-800'
                                  }`} />
                                ) : (
                                  <span className="text-slate-300 font-bold font-mono">&ndash;</span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* SIMULATED USER DATABASE MANAGER BOARD (Linked to local replica) */}
          <div className="bg-white border border-[#d1d1cf] rounded-sm p-4 space-y-4">
            <div className="border-b border-[#d1d1cf] pb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414] font-mono flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-455" />
                Team credentials directory (Supabase Replica)
              </h3>
              <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded border border-[#d1d1cf] font-bold text-slate-600">
                ACTIVE ACCOUNTS: {users.length}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Add simulated user form */}
              <div className="lg:col-span-4 bg-slate-50 border border-[#d1d1cf] rounded-sm p-4 h-fit space-y-4">
                <div className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400">Add Team credentials</div>
                <form onSubmit={handleAddUser} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[9px] font-black uppercase font-mono text-slate-500">Email Address (Supabase UID Link)</label>
                    <input
                      type="email"
                      required
                      placeholder="alex.designer@company.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase font-mono text-slate-500">Authorization role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as any)}
                      className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none font-mono"
                    >
                      <option value="Owner">Owner (root privilege)</option>
                      <option value="Admin">Admin (full operational)</option>
                      <option value="Observer">Observer (inspect only)</option>
                      <option value="Custom">Custom (granular permissions)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#141414] hover:opacity-90 border border-black text-white p-2 font-mono font-bold text-xs rounded-sm uppercase flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" /> Catalog User
                  </button>
                </form>

                <div className="bg-blue-50/10 p-3 rounded-sm border border-blue-200/50 text-[9px] text-blue-805 leading-relaxed font-mono">
                  All newly-instantiated accounts leverage Postgres triggers linked directly to their matching authenticated <code>auth.users(id)</code> entries. 
                </div>
              </div>

              {/* Simulated user rows */}
              <div className="lg:col-span-8 overflow-hidden rounded-sm border border-[#d1d1cf]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#d1d1cf] text-[9.5px] font-bold font-mono text-slate-500 uppercase tracking-widest">
                      <th className="py-2.5 px-3.5">User Email (OAuth Node)</th>
                      <th className="py-2.5 px-3 border-l border-[#d1d1cf]">Authentication Role</th>
                      <th className="py-2.5 px-3 border-l border-[#d1d1cf]">Created AT</th>
                      <th className="py-2.5 px-3 text-center border-l border-[#d1d1cf]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {users.map((usr) => (
                      <tr key={usr.id} className="hover:bg-slate-55/10 transition leading-normal">
                        <td className="py-3 px-3.5 font-sans font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {usr.email}
                          </div>
                        </td>
                        <td className="py-2 px-3 border-l border-[#d1d1cf]">
                          <select
                            value={usr.role}
                            onChange={(e) => handleUpdateUserRole(usr.id, e.target.value as any)}
                            className="bg-white border border-[#d1d1cf] p-1 rounded-sm font-mono text-[10.5px] text-slate-705"
                          >
                            <option value="Owner">Owner</option>
                            <option value="Admin">Admin</option>
                            <option value="Observer">Observer</option>
                            <option value="Custom">Custom</option>
                          </select>
                        </td>
                        <td className="py-3 px-3 border-l border-[#d1d1cf] text-slate-400 font-mono text-[10.5px]">
                          {new Date(usr.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 border-l border-[#d1d1cf] text-center">
                          <button
                            onClick={() => handleDeleteUser(usr.id)}
                            className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-slate-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      ) : (
        /* SQL TRANSCRIPT DRAWER */
        <div className="space-y-4 animate-fade-in font-mono text-xs">
          <div className="bg-[#141414] text-slate-200 p-4 border border-black rounded-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-indigo-400 animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold text-white leading-none">DATABASE RLS SCHEMATICS</h3>
                  <p className="text-[10px] text-slate-400 mt-1">Execute these tables creation and triggers inside your Supabase SQL editor directly</p>
                </div>
              </div>

              <button
                onClick={handleCopySQL}
                className="bg-zinc-805 hover:bg-zinc-702 text-white text-[10px] font-bold border border-zinc-700 py-1.5 px-3 rounded flex items-center gap-1 transition-all cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                {copied ? 'COPIED!' : 'COPY DDL'}
              </button>
            </div>

            <div className="relative">
              <pre className="text-[10px] text-[#A6E22E] leading-relaxed overflow-x-auto p-4 bg-[#1b1b1b] border border-zinc-800/80 rounded max-h-[460px] custom-scrollbar selection:bg-slate-700">
{`-- =========================================================================
-- BAZZI MIDDLEWARE CONSOLE - POSTGRESQL & SUPABASE AUTH RBAC SCHEMA
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. APP ROLES TABLE
CREATE TABLE IF NOT EXISTS app_roles (
    role VARCHAR(32) PRIMARY KEY,
    description TEXT NOT NULL
);

-- Seed initial system authorization definitions
INSERT INTO app_roles (role, description) VALUES
('Owner', 'Full account ownership. Can modify team privileges & all settings.'),
('Admin', 'Full operational access. Can configure templates, products and run simulations.'),
('Observer', 'Read-only access. Can inspect dashboards, logs, but cannot edit configs.'),
('Custom', 'Granular sets of user privilege maps');


-- 2. PROFILE LINKED TO auth.users
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(32) REFERENCES app_roles(role) DEFAULT 'Observer'
);


-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Select policy: User reads own profile. Owner/Admin reads all
CREATE POLICY read_own ON app_users FOR SELECT USING (id = auth.uid());

CREATE POLICY owner_view_all_profiles ON app_users
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM app_users 
        WHERE id = auth.uid() AND role IN ('Owner', 'Admin')
      )
    );

-- Insert trigger for automatized profiles linkages
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.app_users (id, email, role)
  VALUES (new.id, new.email, 'Observer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`}
              </pre>
            </div>
          </div>
          
          <div className="p-3.5 bg-sky-50 border border-sky-200 text-sky-850 rounded-sm font-sans flex items-start gap-2.5">
            <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[11px] uppercase font-mono">Row Level Security Verification:</span>
              <p className="text-xs text-indigo-705 leading-relaxed mt-0.5">
                The mock client inside the simulator mimics this design by fetching user profiles from local store and verifying <code>app_users.role</code> values before letting any write queries or simulator dispatches register.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
