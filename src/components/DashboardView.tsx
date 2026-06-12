import { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
import { WorkflowRun, ImageArtifact } from '../types';
import { LayoutDashboard, Target, AlertTriangle, Image as ImageIcon, CheckCircle, TrendingUp, Clock, ShieldCheck } from 'lucide-react';

export default function DashboardView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [artifacts, setArtifacts] = useState<ImageArtifact[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('Owner');

  useEffect(() => {
    const load = async () => {
      try {
        const [runsData, artifactsData, roleData] = await Promise.all([
          appServices.workflows.getWorkflowRuns(),
          appServices.artifacts.getImageArtifacts(),
          appServices.roles.getActiveRole()
        ]);
        setRuns(runsData);
        setArtifacts(artifactsData);
        setCurrentRole(roleData);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const totalRuns = runs.length;
  const completedRuns = runs.filter(r => r.status === 'completed').length;
  const escalatedRuns = runs.filter(r => r.status === 'escalated').length;
  const activeRuns = runs.filter(r => r.status === 'running').length;

  const acceptedCount = artifacts.filter(a => a.status === 'accepted').length;
  const rejectedCount = artifacts.filter(a => a.status === 'rejected').length;

  const totalEvaluations = artifacts.length;
  const averageQA = totalEvaluations > 0 
    ? Math.round(artifacts.reduce((sum, a) => sum + a.qaScore, 0) / totalEvaluations)
    : 0;

  const passRate = totalRuns > 0 
    ? Math.round((completedRuns / totalRuns) * 100) 
    : 100;

  return (
    <div className="space-y-6 animate-fade-in" id="dashboard-view-container">
      {/* Top Welcome Panel */}
      <div className="bg-[#1a1a1a] border border-[#141414] text-white p-6 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-xl font-sans font-bold tracking-tight text-white flex items-center gap-2">
            Sizhu API Console <span className="text-[10px] bg-blue-500/10 text-blue-400 font-mono py-0.5 px-2.5 rounded-sm border border-blue-500/30 font-bold uppercase">Stable Sandbox v1.0</span>
          </h1>
          <p className="text-xs text-[#a0a0a0] mt-1.5 max-w-2xl">
            You are logged in as <strong className="text-white underline font-mono">{currentRole}</strong>. Automating personalized designs from Etsy and Eatsy webhooks into print-on-demand deliverables via LLM-powered Quality Gates.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button 
            id="simulate-order-cta"
            onClick={() => onNavigate('Workflow Runs')}
            className="bg-blue-500 hover:bg-blue-600 text-white font-mono font-bold px-4 py-2 rounded-sm text-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
          >
            <Clock className="w-3.5 h-3.5" />
            Launch Test Simulator
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-metrics-grid">
        <div className="bg-white p-5 rounded-sm border border-[#d1d1cf] flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider font-mono">Workflow Pipelines</span>
            <div className="text-xl font-bold font-mono text-[#141414] mt-1">{totalRuns} Runs</div>
            <div className="text-[10px] text-[#555] mt-1.5 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {activeRuns} live streaming
            </div>
          </div>
          <div className="p-2 bg-slate-100 rounded-sm text-[#141414]">
            <LayoutDashboard className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-sm border border-[#d1d1cf] flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider font-mono">QA Pass Rate</span>
            <div className="text-xl font-bold font-mono text-[#141414] mt-1">{passRate}%</div>
            <div className="text-[10px] text-[#555] mt-1.5 flex items-center gap-1 font-mono">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              {completedRuns} orders submitted
            </div>
          </div>
          <div className="p-2 bg-emerald-50 rounded-sm text-emerald-600">
            <Target className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-sm border border-[#d1d1cf] flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider font-mono">Escalations</span>
            <div className="text-xl font-bold font-mono text-amber-700 mt-1">{escalatedRuns} Held</div>
            <div className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1 font-mono">
              <AlertTriangle className="w-3 h-3" /> Requires attention
            </div>
          </div>
          <div className="p-2 bg-amber-50 rounded-sm text-amber-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-sm border border-[#d1d1cf] flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider font-mono">Avg Score</span>
            <div className="text-xl font-bold font-mono text-blue-700 mt-1">{averageQA}/100</div>
            <div className="text-[10px] text-blue-600 mt-1.5 flex items-center gap-1 font-mono">
              <TrendingUp className="w-3 h-3 text-blue-500" />
              {totalEvaluations} images evaluated
            </div>
          </div>
          <div className="p-2 bg-blue-50 rounded-sm text-blue-600">
            <ImageIcon className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Dynamic Pipeline Monitor */}
        <div className="lg:col-span-2 bg-white rounded-sm border border-[#d1d1cf] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#555] font-mono">Active Queue Monitor</h2>
              <p className="text-xs text-slate-500 font-sans mt-0.5">Live timeline tracker for custom print generations</p>
            </div>
            <span className="text-[10px] font-mono bg-slate-150 text-[#141414] py-0.5 px-2 rounded-sm border border-slate-205">
              Polled: Local Sync
            </span>
          </div>

          {runs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Clock className="w-6 h-6 mx-auto text-slate-300 stroke-[1.5] mb-2" />
              No active workflow runs registered.
              <button 
                onClick={() => onNavigate('Workflow Runs')}
                className="block mx-auto mt-2 text-blue-600 font-bold hover:underline text-xs uppercase tracking-wider font-mono"
              >
                Go to Simulator &rarr;
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
              {runs.map((run) => (
                <div key={run.id} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      run.status === 'completed' ? 'bg-emerald-500' :
                      run.status === 'escalated' ? 'bg-rose-500' :
                      run.status === 'running' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                    }`} />
                    <div>
                      <div className="font-semibold text-[#141414] flex items-center gap-2">
                        Order #{run.orderNumber}
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-mono py-0.2 px-1 rounded border border-slate-200">
                          {run.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Client: {run.customerName} &bull; Place: {run.birthPlace}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm border ${
                      run.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      run.status === 'escalated' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      run.status === 'running' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      {run.status.toUpperCase()}
                    </span>
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      {new Date(run.startedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Quick Specs / Provider Health */}
        <div className="bg-white rounded-sm border border-[#d1d1cf] p-5 space-y-4 shadow-xs">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#555] font-mono">API Provider Health</h2>
            <p className="text-xs text-slate-500 mt-0.5">Current status of configured service adapter endpoints</p>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <div>
                  <div className="font-bold text-[#141414] font-mono text-xs">FuFire Personalization API</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">PROXY: SECRET_REF_FUFIRE</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-600">CONNECTED</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <div>
                  <div className="font-bold text-[#141414] font-mono text-xs">Gemini AI / Imagen 3</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">PROXY: SECRET_REF_GEMINI_MAIN</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-600">ONLINE</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <div>
                  <div className="font-bold text-[#141414] font-mono text-xs">OpenAI DALL-E 3</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">PROXY: SECRET_REF_OPENAI_MAIN</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-600">ONLINE</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <div>
                  <div className="font-bold text-[#141414] font-mono text-xs">Gelato Print Services</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">PROXY: SECRET_REF_GELATO</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-600">DRAFT-MODE</span>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-sm text-blue-805 text-xs">
            <h4 className="font-bold flex items-center gap-1 font-mono uppercase text-[10px]">
              <ShieldCheck className="w-4 h-4 text-blue-600" /> Row Level Security Active
            </h4>
            <p className="mt-1 opacity-90 leading-relaxed text-[11px]">
              All dashboard telemetry has credentials filtered. Plaintext secret values are strictly restricted to the cloud secure vault.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
