import { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
import { ShopProduct, WorkflowRun, WorkflowLog, ImageArtifact } from '../types';
import { Play, Clipboard, Filter, Trash, User, Calendar, MapPin, Clock, Loader2, AlertCircle, RefreshCw, Layers, CheckCircle2, AlertTriangle, Eye, Download } from 'lucide-react';

export default function WorkflowRunsView() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [artifacts, setArtifacts] = useState<ImageArtifact[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Simulator Inputs state
  const [orderNumber, setOrderNumber] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [birthDate, setBirthDate] = useState('1998-05-18');
  const [birthTimeKnown, setBirthTimeKnown] = useState(true);
  const [birthTime, setBirthTime] = useState('17:42');
  const [birthPlace, setBirthPlace] = useState('London, UK');

  // Filter States
  const [filterOrder, setFilterOrder] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterStep, setFilterStep] = useState('ALL');

  const [isSimulating, setIsSimulating] = useState(false);
  const [simLogStream, setSimLogStream] = useState<WorkflowLog[]>([]);
  const [escalationTemplateOutput, setEscalationTemplateOutput] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // Generate prefilled order templates
    generateRandomOrderNo();
  }, []);

  const loadData = async () => {
    try {
      const prodsAll = await appServices.products.getProducts();
      const prods = prodsAll.filter(p => p.isActive);
      setProducts(prods);
      if (prods.length > 0 && !selectedProductId) {
        setSelectedProductId(prods[0].id);
      }
      
      const [runsData, logsData, artifactsData] = await Promise.all([
        appServices.workflows.getWorkflowRuns(),
        appServices.workflows.getWorkflowLogs(),
        appServices.artifacts.getImageArtifacts()
      ]);
      setRuns(runsData);
      setLogs(logsData);
      setArtifacts(artifactsData);
    } catch (e) {
      console.error(e);
    }
  };

  const generateRandomOrderNo = () => {
    setOrderNumber(`ETSY-${Math.floor(200000 + Math.random() * 799999)}`);
    // Choose random name
    const names = ['Alice Cooper', 'David Bowie', 'Diana Ross', 'Freddie Mercury', 'Alan Turing', 'Ada Lovelace'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomPlace = ['Tokyo, JP', 'Los Angeles, USA', 'Berlin, DE', 'Cairo, EG', 'London, UK'][Math.floor(Math.random() * 5)];
    setCustomerName(randomName);
    setBirthPlace(randomPlace);
  };

  const executeSimulation = async () => {
    if (!orderNumber || !customerName || !selectedProductId) {
      alert('Please fill in order inputs before testing.');
      return;
    }

    setIsSimulating(true);
    setSimLogStream([]);
    setEscalationTemplateOutput(null);

    try {
      const activeProduct = products.find(p => p.id === selectedProductId);
      if (!activeProduct?.activeTemplateId) {
        alert('This product does not have any Active Prompt Template assigned in the Catalog. Map a template first before running simulated orders.');
        setIsSimulating(false);
        return;
      }

      await appServices.workflowRunner.run(
        orderNumber,
        selectedProductId,
        customerName,
        birthDate,
        birthTime,
        birthTimeKnown,
        birthPlace,
        (newLog) => {
          setSimLogStream(prev => [newLog, ...prev]);
        }
      );

      await loadData();
      setIsSimulating(false);
      generateRandomOrderNo();
    } catch (e: any) {
      alert(`Simulation failed: ${e.message}`);
      setIsSimulating(false);
    }
  };

  const clearRunsMemory = async () => {
    if (window.confirm('Wipe simulated logs/artifacts/runs memory? Settings databases are preserved.')) {
      try {
        await appServices.workflows.saveWorkflowRuns([]);
        await appServices.workflows.saveWorkflowLogs([]);
        await appServices.artifacts.saveImageArtifacts([]);
        await loadData();
        setSimLogStream([]);
        setActiveRunId(null);
        setEscalationTemplateOutput(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSelectRun = (runId: string) => {
    setActiveRunId(runId === activeRunId ? null : runId);
    const email = localStorage.getItem(`bazzi_escalated_email_${runId}`);
    setEscalationTemplateOutput(email);
  };

  const exportRunsAsJSON = () => {
    const blob = new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sizhu_workflow_runs_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const exportRunsAsCSV = () => {
    const headers = [
      'ID',
      'OrderNumber',
      'ProductID',
      'CustomerName',
      'BirthDate',
      'BirthTime',
      'BirthTimeKnown',
      'BirthPlace',
      'Status',
      'StartedAt',
      'CompletedAt',
      'CurrentIteration',
      'PersonalizationElement',
      'PersonalizationAnimal',
      'DominantElement'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = runs.map(run => {
      return [
        escapeCsv(run.id),
        escapeCsv(run.orderNumber),
        escapeCsv(run.productId),
        escapeCsv(run.customerName),
        escapeCsv(run.birthDate),
        escapeCsv(run.birthTime),
        escapeCsv(String(run.birthTimeKnown)),
        escapeCsv(run.birthPlace),
        escapeCsv(run.status),
        escapeCsv(run.startedAt),
        escapeCsv(run.completedAt || ''),
        escapeCsv(run.currentIteration),
        escapeCsv(run.personalizationData?.element || ''),
        escapeCsv(run.personalizationData?.animal || ''),
        escapeCsv(run.personalizationData?.dominant_element || '')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sizhu_workflow_runs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const getLogStatusClass = (status: string) => {
    switch (status) {
      case 'success': return 'text-emerald-700 bg-emerald-50 border-emerald-300';
      case 'warning': return 'text-amber-700 bg-amber-50 border-amber-300';
      case 'error': return 'text-red-700 bg-red-50 border-red-300';
      default: return 'text-slate-600 bg-slate-50 border-[#d1d1cf]';
    }
  };

  const activeRunArtifacts = artifacts.filter(a => a.workflowRunId === activeRunId);

  return (
    <div className="space-y-6 animate-fade-in text-[#141414]" id="simulation-runs-container">
      
      {/* Visual Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d1d1cf] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#141414]">Order Webhooks & Run Pipeline</h1>
          <p className="text-xs text-slate-500 mt-1">Simulate incoming order webhooks, track AI swarm generations, and evaluate LLM Quality Gate 1 scores</p>
        </div>
        <div className="flex gap-1.5 self-start sm:self-auto">
          {runs.length > 0 && (
            <button
              onClick={clearRunsMemory}
              className="bg-white border border-red-300 text-red-700 hover:bg-red-50 text-[10px] font-mono font-bold uppercase py-1.5 px-3 rounded-sm flex items-center gap-1 cursor-pointer transition"
            >
              <Trash className="w-3 h-3" /> WIPE PIPELINE DATA
            </button>
          )}
          <button
            onClick={generateRandomOrderNo}
            className="bg-white border border-[#d1d1cf] text-slate-700 hover:bg-slate-100 text-[10px] font-mono font-bold uppercase py-1.5 px-3 rounded-sm flex items-center gap-1 cursor-pointer transition"
          >
            <RefreshCw className="w-3 h-3" /> Scramble Inputs
          </button>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="runs-summary-stats">
        {/* Total Runs Card */}
        <div className="bg-white border border-[#d1d1cf] rounded-sm p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono block">Total Runs</span>
            <div className="text-xl font-bold tracking-tight text-[#141414] mt-1 font-mono">{runs.length}</div>
          </div>
          <div className="p-2 ml-4 bg-slate-50 border border-[#e5e5e3] rounded-sm text-slate-655">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        {/* Successful Runs Card */}
        <div className="bg-white border border-emerald-250 rounded-sm p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#15803d] font-mono block">Successful Runs</span>
            <div className="text-xl font-bold tracking-tight text-emerald-800 mt-1 font-mono">
              {runs.filter(r => r.status === 'completed').length}
            </div>
          </div>
          <div className="p-2 ml-4 bg-emerald-50 border border-emerald-100 rounded-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Failed Runs Card */}
        <div className="bg-white border border-red-250 rounded-sm p-4 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#b91c1c] font-mono block">Failed & Escalated</span>
            <div className="text-xl font-bold tracking-tight text-red-800 mt-1 font-mono">
              {runs.filter(r => r.status === 'failed' || r.status === 'escalated').length}
            </div>
          </div>
          <div className="p-2 ml-4 bg-red-50 border border-red-100 rounded-sm text-red-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* INPUT SIMULATOR PANEL */}
        <div className="lg:col-span-5 bg-white border border-[#d1d1cf] rounded-sm p-4 space-y-5">
          <div className="border-b border-[#d1d1cf] pb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#141414]"></span>
              Webhook simulated parameters
            </h2>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 font-mono">Simulated Order Ref</label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="ETSY-4819102"
                  className="mt-1 w-full border border-[#d1d1cf] rounded-sm p-2 outline-none font-mono font-bold text-[12px] bg-slate-50 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 font-mono">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                  className="mt-1 w-full border border-[#d1d1cf] rounded-sm p-2 outline-none font-sans text-[12px] bg-slate-50 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 font-mono">Assign Target Shop Product Line</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none text-xs font-mono font-bold"
              >
                {products.length === 0 ? (
                  <option value="">-- No Active Products Configured in Catalog --</option>
                ) : (
                  products.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.shopProvider})</option>
                  ))
                )}
              </select>
            </div>

            <div className="bg-slate-50 p-4 border border-[#d1d1cf] rounded-sm space-y-3">
              <div className="border-b border-dashed border-[#d1d1cf] pb-1.5">
                <span className="text-[9px] uppercase font-mono tracking-widest font-bold text-slate-400">Personalization Data Fields (FuFire Source)</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold font-mono text-slate-555">BIRTH DATE</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-1.5 font-mono text-xs focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold font-mono text-slate-555">BIRTH PLACE</label>
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="e.g. Phoenix, AZ"
                    className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-1.5 text-xs focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/55 flex items-center justify-between">
                <span className="font-bold text-[10px] font-mono text-slate-500 uppercase">Birth Time Accuracy</span>
                <button
                  type="button"
                  id="toggle-birthtime-known"
                  onClick={() => setBirthTimeKnown(!birthTimeKnown)}
                  className={`px-2.5 py-1 rounded-sm font-mono text-[9px] font-bold transition uppercase tracking-wider flex items-center gap-1 cursor-pointer ${
                    birthTimeKnown ? 'bg-indigo-650 text-white border border-indigo-705' : 'bg-amber-400 text-slate-950 border border-amber-500'
                  }`}
                >
                  <Clock className="w-3 h-3" /> {birthTimeKnown ? 'KNOWN RECORD' : 'UNKNOWN TIME'}
                </button>
              </div>

              {birthTimeKnown ? (
                <div className="animate-fade-in text-left">
                  <label className="block text-[9px] font-bold font-mono text-slate-500">EXACT TO THE MINUTE</label>
                  <input
                    type="time"
                    value={birthTime}
                    onChange={(e) => setBirthTime(e.target.value)}
                    className="mt-1 w-[110px] border border-[#d1d1cf] bg-white rounded-sm p-1.5 font-mono text-xs"
                  />
                </div>
              ) : (
                <div className="bg-amber-50 rounded-sm border border-amber-250 p-3 text-[10px] text-amber-800 leading-relaxed font-mono">
                  <strong>SYSTEM POLICY ACTION:</strong> Missing birth minutes will automatically mock <code>12:00</code> (Noon UTC). This sets the <code>birth_time_known = false</code> trigger for alternative middleware layout scripts.
                </div>
              )}
            </div>

            <button
              id="btn-simulate-order"
              disabled={isSimulating || products.length === 0}
              onClick={executeSimulation}
              className="w-full bg-[#141414] hover:opacity-90 border border-black disabled:bg-slate-200 disabled:text-slate-400 disabled:border-[#d1d1cf] disabled:cursor-not-allowed text-white font-mono font-bold p-3 rounded-sm text-xs flex items-center justify-center gap-2 cursor-pointer tracking-wider uppercase transition shadow-sm"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> RUNNING STAGE GENERATIONS...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white text-white" /> ENGAGE WEBHOOK SIMULATION Run
                </>
              )}
            </button>
          </div>

          {/* ACTIVE LIVE TERMINAL STREAM */}
          {isSimulating && (
            <div className="bg-[#141414] text-white rounded-sm p-3.5 border border-black font-mono text-[10px] leading-relaxed space-y-1.5 max-h-[160px] overflow-y-auto shadow-inner animate-fade-in">
              <div className="text-amber-400 font-bold border-b border-zinc-800 pb-1 mb-1.5 flex items-center gap-1.5 uppercase tracking-wider text-[9px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                ACTIVE LOG TRACKER
              </div>
              {simLogStream.map((s, i) => (
                <div key={s.id} className="flex gap-2.5">
                  <span className="text-zinc-500 font-sans">[{new Date(s.timestamp).toLocaleTimeString()}]</span>
                  <span className={`${s.status === 'success' ? 'text-emerald-450' : s.status === 'error' ? 'text-red-400' : s.status === 'warning' ? 'text-amber-400' : 'text-zinc-300'}`}>
                    &gt;&gt; {s.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* WORKFLOW PIPELINE HISTORIES LIST */}
        <div className="lg:col-span-7 bg-white border border-[#d1d1cf] rounded-sm p-4 space-y-4">
          <div className="border-b border-[#d1d1cf] pb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-450" />
              Workflow Runs & Telemetry History
            </h2>
            <div className="flex items-center gap-2">
              {runs.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] bg-slate-50 border border-[#d1d1cf] rounded-sm p-0.5">
                  <span className="font-bold text-slate-400 px-1 font-mono uppercase text-[8px] flex items-center gap-0.5">
                    <Download className="w-2.5 h-2.5" /> Export:
                  </span>
                  <button 
                    onClick={exportRunsAsJSON}
                    className="hover:bg-slate-200 text-slate-700 font-mono font-bold px-1.5 py-0.5 rounded-xs transition text-[9px] cursor-pointer"
                    title="Export all runs as JSON"
                  >
                    JSON
                  </button>
                  <span className="text-[#d1d1cf]">&bull;</span>
                  <button 
                    onClick={exportRunsAsCSV}
                    className="hover:bg-slate-200 text-slate-705 font-mono font-bold px-1.5 py-0.5 rounded-xs transition text-[9px] cursor-pointer"
                    title="Export all runs as CSV"
                  >
                    CSV
                  </button>
                </div>
              )}
              <span className="text-[9px] bg-slate-100 border border-[#d1d1cf] font-mono font-bold py-0.5 px-2 rounded-sm text-slate-655 tracking-wide uppercase">
                Runs: {runs.length}
              </span>
            </div>
          </div>

          {runs.length === 0 ? (
            <div className="py-24 text-center text-slate-400 text-xs font-mono border border-[#d1d1cf] border-dashed rounded-sm bg-slate-50/50">
              Pipeline register is vacant. Fire a webhook test trigger on the left parameters sidebar to initialize workflow histories!
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {runs.map((run) => {
                const isExpanded = activeRunId === run.id;
                
                return (
                  <div 
                    key={run.id} 
                    className={`border rounded-sm overflow-hidden transition ${
                      isExpanded ? 'border-indigo-400 bg-indigo-50/15' : 'border-[#d1d1cf] hover:border-slate-450 bg-white'
                    }`}
                  >
                    {/* Collapsible header */}
                    <div 
                      onClick={() => handleSelectRun(run.id)}
                      className="p-3.5 flex items-center justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`p-1.5 rounded-sm border ${
                          run.status === 'completed' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                          run.status === 'failed' ? 'bg-red-50 border-red-300 text-red-700' :
                          run.status === 'escalated' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                          'bg-indigo-50 border-indigo-300 text-indigo-700'
                        }`} title={`State: ${run.status}`}>
                          {run.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
                           run.status === 'failed' ? <AlertCircle className="w-4 h-4" /> :
                           run.status === 'escalated' ? <AlertTriangle className="w-4 h-4" /> :
                           <Loader2 className="w-4 h-4 animate-spin" />}
                        </span>
                        <div>
                          <div className="font-bold text-[#141414] text-[13px] flex items-center gap-2">
                            Ref #{run.orderNumber}
                            <span className="text-[10px] font-mono text-slate-400 font-normal">
                              UUID: {run.id.substring(0, 8)}...
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-505 mt-0.5 font-mono leading-none">
                            Client: {run.customerName} &bull; Place: {run.birthPlace} ({run.birthTimeKnown ? run.birthTime : 'noon'})
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <span 
                          className={`text-[9px] font-bold font-mono py-0.5 px-2 border uppercase rounded-sm ${
                            run.status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                            run.status === 'failed' ? 'bg-red-100 text-red-800 border-red-300' :
                            run.status === 'escalated' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                            'bg-indigo-100 text-indigo-800 border-indigo-300'
                          }`}
                          title={
                            run.status === 'completed' ? 'Workflow successfully executed the complete generation pipeline and accepted an artifact' :
                            run.status === 'failed' ? 'Workflow encountered a hard system failure or crash before completion' :
                            run.status === 'escalated' ? 'Workflow exceeded maximum rejected iterations and triggered a human escalation sequence' :
                            'Workflow is currently processing and iterating through the pipeline'
                          }
                        >
                          {run.status}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">{isExpanded ? 'CLOSE' : 'OPEN'}</span>
                      </div>
                    </div>

                    {/* Collapsible body */}
                    {isExpanded && (
                      <div className="p-4 border-t border-[#d1d1cf] bg-slate-50/50 space-y-4 divide-y divide-[#d1d1cf] animate-slide-down">
                        
                        {/* Dynamic Metadata details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] pt-1 font-mono">
                          <div>
                            <span className="text-slate-400 block uppercase text-[9px] font-bold">DISPATCHED AT</span>
                            <div className="font-bold text-slate-700 mt-0.5">{new Date(run.startedAt).toLocaleTimeString()}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 block uppercase text-[9px] font-bold">TOTAL CYCLES</span>
                            <div className="font-bold text-slate-700 mt-0.5">{run.currentIteration} iterations</div>
                          </div>
                          <div>
                            <span className="text-slate-400 block uppercase text-[9px] font-bold">ZODIAC ANIMAL</span>
                            <div className="text-indigo-800 font-bold mt-0.5">{run.personalizationData?.element || 'Pending'} {run.personalizationData?.animal}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 block uppercase text-[9px] font-bold">DOMINANT AURA</span>
                            <div className="text-emerald-800 font-bold mt-0.5">{run.personalizationData?.dominant_element || 'Pending'}</div>
                          </div>
                        </div>

                        {/* Staged candidates preview for this specific pipeline */}
                        <div className="pt-3">
                          <h4 className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider mb-2.5">Staged Image Swarm Candidates</h4>
                          {activeRunArtifacts.length === 0 ? (
                            <span className="text-xs text-slate-400 font-mono">No generated candidates cataloged for this runs configuration.</span>
                          ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                              {activeRunArtifacts.map((art) => (
                                <div key={art.id} className="group relative border border-[#d1d1cf] bg-white p-1 rounded-sm flex flex-col justify-between hover:border-slate-400 transition">
                                  <img 
                                    src={art.storagePath} 
                                    className="w-full aspect-[4/5] object-cover rounded-sm bg-neutral-950" 
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="p-1 mt-1 font-mono text-[9px]">
                                    <div className="flex justify-between font-bold text-[#141414]">
                                      <span>Sc: {art.qaScore}</span>
                                      <span className={`${
                                        art.status === 'accepted' ? 'text-emerald-600' :
                                        art.status === 'rejected' ? 'text-red-650' : 'text-slate-505'
                                      }`}>
                                        {art.status.substring(0, 4).toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="text-[8px] text-slate-400 mt-0.5">IT:{art.iteration} CAND:{art.candidateIndex + 1}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Interactive Escalation display */}
                        {run.status === 'escalated' && escalationTemplateOutput && (
                          <div className="pt-4 space-y-2">
                            <h4 className="text-[10px] font-bold text-red-700 font-mono tracking-wider flex items-center gap-1.5 uppercase">
                              <AlertCircle className="w-3.5 h-3.5 text-red-600" /> QUALITY GATES FAILURE MANIFEST (EMAILED)
                            </h4>
                            <pre className="bg-[#141414] text-slate-200 p-3.5 rounded-sm text-[9.5px] font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto border border-red-400 max-h-[180px] shadow-inner">
                              {escalationTemplateOutput}
                            </pre>
                            <span className="block text-[10px] text-slate-400 leading-normal font-mono">
                              An automation alert has been dispatched to Gelato POD queues. Operation is suspended until an operator approves an override candidate index.
                            </span>
                          </div>
                        )}

                        {/* Log timeline display for matching run */}
                        <div className="pt-3">
                          <h4 className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wide mb-2">Step Automation Tracker Logs</h4>
                          <div className="bg-white border border-[#d1d1cf] rounded-sm overflow-hidden divide-y divide-[#d1d1cf] max-h-[220px] overflow-y-auto">
                            {logs.filter(l => l.runId === run.id).map((lLog) => (
                              <div key={lLog.id} className="p-2.5 text-xs flex items-start gap-2.5 hover:bg-slate-50 hover:bg-opacity-50 transition">
                                <span className={`text-[9px] font-bold py-0.5 px-2 rounded-sm border uppercase font-mono shrink-0 ${getLogStatusClass(lLog.status)}`}>
                                  {lLog.status}
                                </span>
                                <div>
                                  <div className="font-bold text-[#141414] leading-snug">{lLog.message}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                    Step: <strong className="text-slate-550 font-semibold">{lLog.step}</strong> &bull; Tracker Timestamp: {new Date(lLog.timestamp).toLocaleTimeString()}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
