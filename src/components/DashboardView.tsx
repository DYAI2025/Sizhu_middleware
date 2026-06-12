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
      <div className="bg-b2 border border-da text-da p-6 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-xl font-sans font-bold tracking-tight text-da flex items-center gap-2">
            Sizhu API Console <span className="text-[10px] bg-ac/10 text-ac font-mono py-0.5 px-2.5 rounded-sm border border-ac/30 font-bold uppercase">Stable Sandbox v1.0</span>
          </h1>
          <p className="text-xs text-nt mt-1.5 max-w-2xl">
            You are logged in as <strong className="text-da underline font-mono">{currentRole}</strong>. Automating personalized designs from Etsy and Eatsy webhooks into print-on-demand deliverables via LLM-powered Quality Gates.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button 
            id="simulate-order-cta"
            onClick={() => onNavigate('Workflow Runs')}
            className="bg-ac hover:bg-ac text-da font-mono font-bold px-4 py-2 rounded-sm text-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
          >
            <Clock className="w-3.5 h-3.5" />
            Launch Test Simulator
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-metrics-grid">
        <div className="bg-b1 p-5 rounded-sm border border-nt flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-nt uppercase tracking-wider font-mono">Workflow Pipelines</span>
            <div className="text-xl font-bold font-mono text-da mt-1">{totalRuns} Runs</div>
            <div className="text-[10px] text-nt mt-1.5 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-ac animate-pulse"></span>
              {activeRuns} live streaming
            </div>
          </div>
          <div className="p-2 bg-b2 rounded-sm text-da">
            <LayoutDashboard className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-b1 p-5 rounded-sm border border-nt flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-nt uppercase tracking-wider font-mono">QA Pass Rate</span>
            <div className="text-xl font-bold font-mono text-da mt-1">{passRate}%</div>
            <div className="text-[10px] text-nt mt-1.5 flex items-center gap-1 font-mono">
              <CheckCircle className="w-3 h-3 text-ac" />
              {completedRuns} orders submitted
            </div>
          </div>
          <div className="p-2 bg-b1 rounded-sm text-ac">
            <Target className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-b1 p-5 rounded-sm border border-nt flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-nt uppercase tracking-wider font-mono">Escalations</span>
            <div className="text-xl font-bold font-mono text-ac mt-1">{escalatedRuns} Held</div>
            <div className="text-[10px] text-ac mt-1.5 flex items-center gap-1 font-mono">
              <AlertTriangle className="w-3 h-3" /> Requires attention
            </div>
          </div>
          <div className="p-2 bg-b1 rounded-sm text-ac">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-b1 p-5 rounded-sm border border-nt flex items-start justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-nt uppercase tracking-wider font-mono">Avg Score</span>
            <div className="text-xl font-bold font-mono text-ac mt-1">{averageQA}/100</div>
            <div className="text-[10px] text-ac mt-1.5 flex items-center gap-1 font-mono">
              <TrendingUp className="w-3 h-3 text-ac" />
              {totalEvaluations} images evaluated
            </div>
          </div>
          <div className="p-2 bg-b1 rounded-sm text-ac">
            <ImageIcon className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Dynamic Pipeline Monitor */}
        <div className="lg:col-span-2 bg-b1 rounded-sm border border-nt p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-nt pb-3">
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-nt font-mono">Active Queue Monitor</h2>
              <p className="text-xs text-nt font-sans mt-0.5">Live timeline tracker for custom print generations</p>
            </div>
            <span className="text-[10px] font-mono bg-b2 text-da py-0.5 px-2 rounded-sm border border-nt">
              Polled: Local Sync
            </span>
          </div>

          {runs.length === 0 ? (
            <div className="py-12 text-center text-nt text-xs">
              <Clock className="w-6 h-6 mx-auto text-nt stroke-[1.5] mb-2" />
              No active workflow runs registered.
              <button 
                onClick={() => onNavigate('Workflow Runs')}
                className="block mx-auto mt-2 text-ac font-bold hover:underline text-xs uppercase tracking-wider font-mono"
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
                      run.status === 'completed' ? 'bg-ac' :
                      run.status === 'escalated' ? 'bg-ac' :
                      run.status === 'running' ? 'bg-ac animate-pulse' : 'bg-b2'
                    }`} />
                    <div>
                      <div className="font-semibold text-da flex items-center gap-2">
                        Order #{run.orderNumber}
                        <span className="text-[10px] bg-b2 text-nt font-mono py-0.2 px-1 rounded border border-nt">
                          {run.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-nt mt-0.5">
                        Client: {run.customerName} &bull; Place: {run.birthPlace}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm border ${
                      run.status === 'completed' ? 'bg-b1 text-ac border-ac' :
                      run.status === 'escalated' ? 'bg-ac text-ac border-ac' :
                      run.status === 'running' ? 'bg-b1 text-ac border-ac' : 'bg-b1 text-nt border-nt'
                    }`}>
                      {run.status.toUpperCase()}
                    </span>
                    <div className="text-[10px] text-nt font-mono mt-1">
                      {new Date(run.startedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Quick Specs / Provider Health */}
        <div className="bg-b1 rounded-sm border border-nt p-5 space-y-4 shadow-xs">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-nt font-mono">API Provider Health</h2>
            <p className="text-xs text-nt mt-0.5">Current status of configured service adapter endpoints</p>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between p-3 bg-b1 border border-nt/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ac"></span>
                <div>
                  <div className="font-bold text-da font-mono text-xs">FuFire Personalization API</div>
                  <div className="text-[10px] text-nt mt-0.5">PROXY: SECRET_REF_FUFIRE</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-ac">CONNECTED</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-b1 border border-nt/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ac"></span>
                <div>
                  <div className="font-bold text-da font-mono text-xs">Gemini AI / Imagen 3</div>
                  <div className="text-[10px] text-nt mt-0.5 font-mono">PROXY: SECRET_REF_GEMINI_MAIN</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-ac">ONLINE</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-b1 border border-nt/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ac"></span>
                <div>
                  <div className="font-bold text-da font-mono text-xs">OpenAI DALL-E 3</div>
                  <div className="text-[10px] text-nt mt-0.5 font-mono">PROXY: SECRET_REF_OPENAI_MAIN</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-ac">ONLINE</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-b1 border border-nt/80 rounded-sm text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ac"></span>
                <div>
                  <div className="font-bold text-da font-mono text-xs">Gelato Print Services</div>
                  <div className="text-[10px] text-nt mt-0.5 font-mono">PROXY: SECRET_REF_GELATO</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-ac">DRAFT-MODE</span>
            </div>
          </div>

          <div className="p-3.5 bg-b1 border border-ac rounded-sm text-ac text-xs">
            <h4 className="font-bold flex items-center gap-1 font-mono uppercase text-[10px]">
              <ShieldCheck className="w-4 h-4 text-ac" /> Row Level Security Active
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
