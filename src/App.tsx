import { useState, useEffect } from 'react';
import { AppRoleName } from './types';
import { appServices } from './lib/app/appServices';
import { getSystemStatus } from './lib/app/systemStatus';
// @ts-ignore
import SizhuLogo from './assets/images/sizhu_logo_1781277019051.jpg';

// Import our modular sub-views
import DashboardView from './components/DashboardView';
import ProductsView from './components/ProductsView';
import TemplatesView from './components/TemplatesView';
import WorkflowBuilderView from './components/WorkflowBuilderView';
import ConfigurationViews from './components/ConfigurationViews';
import WorkflowRunsView from './components/WorkflowRunsView';
import ArtifactsView from './components/ArtifactsView';
import RolesView from './components/RolesView';
import SettingsView from './components/SettingsView';

// Import Icons
import {
  LayoutDashboard,
  Package,
  FileText,
  Layers,
  Cpu,
  ShieldCheck,
  Zap,
  Printer,
  PlayCircle,
  Image as ImageIcon,
  Users,
  Settings as SettingsIcon,
  ShieldAlert,
  Menu,
  X,
  Database,
  GitBranch
} from 'lucide-react';

export default function App() {
  const [activeMenu, setActiveMenu] = useState<string>('Dashboard');
  const [currentRole, setCurrentRole] = useState<AppRoleName>('Owner');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [hasRunningWorkflows, setHasRunningWorkflows] = useState<boolean>(false);
  const [workflowHealth, setWorkflowHealth] = useState<'green' | 'amber' | 'red'>('green');
  const [domainStatus, setDomainStatus] = useState<'UNVERIFIED' | 'CONFIGURED' | 'LIVE' | 'ERROR'>('UNVERIFIED');

  const baseStatus = getSystemStatus();
  const status = { ...baseStatus, domainStatus };

  useEffect(() => {
    const checkDomain = async () => {
      try {
        const targetUrl = `https://${baseStatus.domainTarget}/api/health`;
        const res = await fetch(targetUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok') {
            setDomainStatus('LIVE');
          } else {
            setDomainStatus('ERROR');
          }
        } else {
          setDomainStatus('ERROR');
        }
      } catch (err) {
        setDomainStatus('ERROR');
      }
    };
    checkDomain();
  }, [baseStatus.domainTarget]);

  useEffect(() => {
    // Initial load
    const loadRole = async () => {
      try {
        const role = await appServices.roles.getActiveRole();
        setCurrentRole(role);
      } catch (e) {
        console.error(e);
      }
    };
    loadRole();

    // Event listener to synchronize active simulated role instantly
    const handleRoleChange = async () => {
      try {
        const role = await appServices.roles.getActiveRole();
        setCurrentRole(role);
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('bazzi_role_changed', handleRoleChange);
    return () => {
      window.removeEventListener('bazzi_role_changed', handleRoleChange);
    };
  }, []);

  useEffect(() => {
    // Poll for running workflows to animate nav link
    const checkRunningWorkflows = async () => {
      try {
        const runs = await appServices.workflows.getWorkflowRuns();
        setHasRunningWorkflows(runs.some(r => r.status === 'running'));
        
        if (runs.some(r => r.status === 'failed')) {
          setWorkflowHealth('red');
        } else if (runs.some(r => r.status === 'escalated')) {
          setWorkflowHealth('amber');
        } else {
          setWorkflowHealth('green');
        }
      } catch (e) {
        // silently ignore
      }
    };
    
    checkRunningWorkflows();
    const interval = setInterval(checkRunningWorkflows, 2500); // Check every 2.5s
    return () => clearInterval(interval);
  }, []);

  const managementMenus = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Products', icon: Package },
    { name: 'Prompt Templates', icon: FileText },
    { name: 'Visual Workflow Builder', icon: GitBranch },
    { name: 'Product Template Mapping', icon: Layers }
  ];

  const configMenus = [
    { name: 'Generation Providers', icon: Cpu },
    { name: 'Quality Gate 1', icon: ShieldCheck },
    { name: 'Personalization API', icon: Zap },
    { name: 'Fulfillment / Shipping APIs', icon: Printer }
  ];

  const opsMenus = [
    { name: 'Workflow Runs', icon: PlayCircle },
    { name: 'Image Artifacts', icon: ImageIcon },
    { name: 'Roles & Permissions', icon: Users },
    { name: 'Settings', icon: SettingsIcon }
  ];

  const handleNavigate = (menuName: string) => {
    setActiveMenu(menuName);
    setIsMobileMenuOpen(false);
  };

  const renderActiveView = () => {
    switch (activeMenu) {
      case 'Dashboard':
        return <DashboardView onNavigate={handleNavigate} />;
      case 'Products':
        return <ProductsView />;
      case 'Prompt Templates':
        return <TemplatesView />;
      case 'Visual Workflow Builder':
        return <WorkflowBuilderView />;
      case 'Product Template Mapping':
        return <ConfigurationViews activeSection="Product Template Mapping" />;
      case 'Generation Providers':
        return <ConfigurationViews activeSection="Generation Providers" />;
      case 'Quality Gate 1':
        return <ConfigurationViews activeSection="Quality Gate 1" />;
      case 'Personalization API':
        return <ConfigurationViews activeSection="Personalization API" />;
      case 'Fulfillment / Shipping APIs':
        return <ConfigurationViews activeSection="Fulfillment / Shipping APIs" />;
      case 'Workflow Runs':
        return <WorkflowRunsView />;
      case 'Image Artifacts':
        return <ArtifactsView />;
      case 'Roles & Permissions':
        return <RolesView />;
      case 'Settings':
        return <SettingsView />;
      default:
        return <DashboardView onNavigate={handleNavigate} />;
    }
  };

  const renderNavLink = (m: { name: string; icon: any }) => {
    const Icon = m.icon;
    const isActive = activeMenu === m.name;
    const isWorkflowRuns = m.name === 'Workflow Runs';
    const showPulse = isWorkflowRuns && hasRunningWorkflows;

    return (
      <button
        key={m.name}
        id={`nav-link-${m.name.replace(/\s+/g, '-').toLowerCase()}`}
        onClick={() => handleNavigate(m.name)}
        className={`w-full flex items-center justify-between py-2 px-6 text-xs transition-colors text-left cursor-pointer ${
          isActive 
            ? 'bg-b2 text-da border-r-2 border-ac font-bold' 
            : 'text-nt hover:bg-b2 hover:text-da font-medium'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${showPulse && !isActive ? 'text-ac' : ''}`} />
          <span className={`${showPulse && !isActive ? 'text-ac' : ''}`}>{m.name}</span>
        </div>
        
        {isWorkflowRuns ? (
          <div className="flex items-center gap-2">
            {showPulse && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ac opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-ac"></span>
              </span>
            )}
            <span 
              className={`w-2 h-2 rounded-full shrink-0 ${
                workflowHealth === 'red' ? 'bg-ac shadow-[0_0_4px_var(--color-ac)]' :
                workflowHealth === 'amber' ? 'bg-nt shadow-[0_0_4px_var(--color-nt)]' :
                'bg-da shadow-[0_0_4px_var(--color-da)]'
              }`} 
              title={
                workflowHealth === 'red' ? 'Health: Critical (Failed Runs)' :
                workflowHealth === 'amber' ? 'Health: Attention (Escalated Runs)' :
                'Health: Nominal (All passed/running)'
              }
            ></span>
          </div>
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-b1 text-da flex flex-col md:flex-row antialiased select-none font-sans" id="bazzi-console-application-root">
      
      {/* Mobile Top Header */}
      <div className="md:hidden bg-b2 text-da p-4 flex items-center justify-between border-b border-da">
        <span className="font-sans font-extrabold tracking-wider text-xs flex items-center gap-2 uppercase">
          <img src={SizhuLogo} alt="Sizhu API Logo" className="w-5 h-5 rounded-sm object-cover shrink-0" referrerPolicy="no-referrer" /> Sizhu API
        </span>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="text-nt hover:text-da p-1"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar navigation panel */}
      <aside
        className={`${
          isMobileMenuOpen ? 'block fixed inset-0 z-40' : 'hidden'
        } md:block md:relative md:w-56 bg-b2 text-nt flex flex-col border-r border-da min-h-screen h-full shrink-0`}
      >
        <div className="flex flex-col h-full justify-between">
          <div className="flex flex-col">
            {/* Brand header */}
            <div className="p-6 flex items-center gap-3 border-b border-da">
              <img src={SizhuLogo} alt="Sizhu API Logo" className="w-8 h-8 rounded-sm object-cover" referrerPolicy="no-referrer" />
              <span className="text-xs font-bold tracking-wider text-da uppercase font-mono">Sizhu API</span>
            </div>

            {/* Active Sim state */}
            <div className="mx-4 my-3 p-3 bg-b2 rounded-sm border border-da flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-ac" />
                <div className="truncate">
                  <div className="font-bold text-da text-[10px] uppercase tracking-wider font-mono">Simulating</div>
                  <div className="text-[10px] text-nt font-semibold italic">{currentRole}</div>
                </div>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-ac shrink-0"></span>
            </div>

            {/* Menu groups matching all 12 requested navigations */}
            <nav className="custom-scrollbar overflow-y-auto space-y-0.5 mt-2" id="bazzi-console-navigation-sidebar">
              <div className="px-6 py-1.5 text-[9px] uppercase tracking-widest text-nt/60 font-mono font-bold">Management</div>
              {managementMenus.map(renderNavLink)}

              <div className="px-6 py-2 text-[9px] uppercase tracking-widest text-nt/60 font-mono font-bold border-t border-da mt-2 pt-2">Configuration</div>
              {configMenus.map(renderNavLink)}

              <div className="px-6 py-2 text-[9px] uppercase tracking-widest text-nt/60 font-mono font-bold border-t border-da mt-2 pt-2">Operations</div>
              {opsMenus.map(renderNavLink)}
            </nav>
          </div>

          {/* Console credit footer */}
          <div className="p-4 border-t border-da flex items-center gap-3 mt-auto">
            <div className="w-8 h-8 rounded-full bg-ac flex items-center justify-center text-[10px] text-da font-bold font-mono">OA</div>
            <div className="flex flex-col">
              <span className="text-[11px] text-da font-medium">{currentRole} Admin</span>
              <span className="text-[9px] text-nt/50 font-mono">Production Env</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main workspace container */}
      <main className="flex-1 flex flex-col min-w-0 bg-b1 overflow-y-auto" id="bazzi-console-workspace">
        {/* Top Header metrics bar */}
        <header className="h-14 bg-b1 border-b border-nt px-8 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3 text-xs font-mono font-bold">
            <span className="text-nt">{activeMenu}</span>
            <span className="text-nt">/</span>
            <span className="text-da uppercase">RUN-{activeMenu.substring(0, 4).toUpperCase()}</span>
            <span className="px-2 py-0.5 rounded-sm bg-b2 text-ac text-[9px] font-bold border border-ac uppercase font-mono">
              {currentRole} ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-[10px] uppercase font-mono font-semibold text-nt">
              <span className={`w-1.5 h-1.5 rounded-full ${status.domainStatus === 'LIVE' ? 'bg-ac' : status.domainStatus === 'ERROR' ? 'bg-red-500' : 'bg-nt'}`}></span>
              DOMAIN: {status.domainTarget} [{status.domainStatus}]
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase font-mono font-semibold text-nt">
              <span className={`w-1.5 h-1.5 rounded-full ${status.fufire === 'MOCK' || status.fufire === 'LIVE' || status.fufire === 'CONFIGURED' ? 'bg-ac' : 'bg-ac'}`}></span>
              FuFire: {status.fufire}
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase font-mono font-semibold text-nt">
              <span className={`w-1.5 h-1.5 rounded-full ${status.gelato === 'MOCK' || status.gelato === 'LIVE' || status.gelato === 'CONFIGURED' ? 'bg-ac' : 'bg-ac'}`}></span>
              Gelato: {status.gelato}
            </div>
            <span className="text-[10px] uppercase font-mono font-bold bg-b2 px-2 py-0.5 rounded border border-nt" title="Current Mode">
              MODE: {status.appMode}
            </span>
            <button
              onClick={() => {
                window.dispatchEvent(new Event('bazzi_role_changed'));
              }}
              className="px-3 py-1.5 bg-b2 text-da text-xs font-bold rounded-sm hover:opacity-90 transition cursor-pointer font-semibold uppercase tracking-wider font-mono text-[10px]"
            >
              Sync System
            </button>
          </div>
        </header>

        {/* Dynamic Inner Panel View with generous padding */}
        <div className="flex-1 p-6 max-w-[1440px] w-full mx-auto flex flex-col justify-between">
          <div className="w-full">
            {renderActiveView()}
          </div>

          {/* Bottom Status Bar */}
          <footer className="h-8 bg-b2 text-[9px] text-nt flex items-center justify-between px-6 border-t border-da select-none mt-12 mb-0 rounded-sm">
            <div className="flex items-center gap-6">
              <span className={`${status.systemOperational ? 'text-ac' : 'text-ac'} flex items-center gap-1 font-bold font-mono`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.systemOperational ? 'bg-ac' : 'bg-nt'}`}></span>
                {status.appMode === 'DEMO_LOCAL' ? 'DEMO_LOCAL' : status.systemOperational ? 'LIVE_VERIFIED' : 'CONFIG_REQUIRED / NOT_READY'}
              </span>
              <span className="font-mono text-[9px]">DB: {status.database}</span>
              <span className="font-mono text-[9px]">SECURE: {status.security}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono">v1.1.0-STABLE</span>
            </div>
          </footer>
        </div>
      </main>

    </div>
  );
}
