import { useState, useEffect } from 'react';
import { LocalDb } from '../mockStorage';
import { ImageArtifact, ShopProduct } from '../types';
import { CheckCircle2, AlertTriangle, HelpCircle, Eye, SlidersHorizontal, Layers, X, Calendar, Download } from 'lucide-react';

export default function ArtifactsView() {
  const [artifacts, setArtifacts] = useState<ImageArtifact[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'accepted' | 'rejected' | 'not_selected'>('all');
  const [activeArtifact, setActiveArtifact] = useState<ImageArtifact | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setArtifacts(LocalDb.getImageArtifacts());
    setProducts(LocalDb.getProducts());
  };

  const exportArtifactsAsJSON = () => {
    const blob = new Blob([JSON.stringify(filteredArtifacts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sizhu_staged_artifacts_${activeTab}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const exportArtifactsAsCSV = () => {
    const headers = [
      'ID',
      'WorkflowRunID',
      'OrderNumber',
      'ProductID',
      'TemplateID',
      'Iteration',
      'CandidateIndex',
      'StoragePath',
      'Status',
      'QaScore',
      'RejectionReason',
      'QaResultJson',
      'GeneratedAt'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredArtifacts.map(art => {
      return [
        escapeCsv(art.id),
        escapeCsv(art.workflowRunId),
        escapeCsv(art.orderNumber),
        escapeCsv(art.productId),
        escapeCsv(art.templateId),
        escapeCsv(art.iteration),
        escapeCsv(art.candidateIndex),
        escapeCsv(art.storagePath),
        escapeCsv(art.status),
        escapeCsv(art.qaScore),
        escapeCsv(art.rejectionReason || ''),
        escapeCsv(art.qaResultJson),
        escapeCsv(art.generatedAt)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sizhu_staged_artifacts_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const filteredArtifacts = artifacts.filter((a) => {
    if (activeTab === 'all') return true;
    return a.status === activeTab;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-rose-50 border border-rose-300 text-rose-800 text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> Rejected
          </span>
        );
      case 'not_selected':
        return (
          <span className="bg-slate-100 border border-slate-300 text-slate-500 text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Unselected
          </span>
        );
      default:
        return (
          <span className="bg-slate-50 border border-[#d1d1cf] text-[#141414] text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm font-mono">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#141414]" id="artifacts-gallery-container animate-fade-in">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d1d1cf] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#141414] tracking-tight font-sans">Supabase Staged Artifacts</h1>
          <p className="text-xs text-slate-500 mt-1">Explore full-resolution vector canvases with vision evaluation scores</p>
        </div>
        <div className="text-[10px] text-slate-505 font-mono bg-white border border-[#d1d1cf] px-2 py-1 rounded-sm">
          Durable Cloud Storage: <code className="text-xs text-rose-700 font-bold">bucket://bazzi-renderings</code>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#d1d1cf] pb-3">
        <div className="flex flex-wrap gap-1.5">
          {['all', 'accepted', 'rejected', 'not_selected'].map((tab) => (
            <button
              key={tab}
              id={`tab-artifacts-${tab}`}
              onClick={() => setActiveTab(tab as any)}
              className={`py-1.5 px-3.5 text-[10px] font-bold uppercase font-mono border transition cursor-pointer rounded-sm ${
                activeTab === tab
                  ? 'bg-[#141414] text-white border-black shadow-sm'
                  : 'bg-white border-[#d1d1cf] text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.replace('_', ' ')} swarms
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {filteredArtifacts.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] bg-slate-50 border border-[#d1d1cf] rounded-sm p-0.5">
              <span className="font-bold text-slate-400 px-1 font-mono uppercase text-[8px] flex items-center gap-0.5">
                <Download className="w-2.5 h-2.5" /> Export:
              </span>
              <button 
                onClick={exportArtifactsAsJSON}
                className="hover:bg-slate-200 text-slate-700 font-mono font-bold px-1.5 py-0.5 rounded-xs transition text-[9px] cursor-pointer"
                title={`Export current ${activeTab} artifacts as JSON`}
              >
                JSON
              </button>
              <span className="text-[#d1d1cf]">&bull;</span>
              <button 
                onClick={exportArtifactsAsCSV}
                className="hover:bg-slate-200 text-slate-750 font-mono font-bold px-1.5 py-0.5 rounded-xs transition text-[9px] cursor-pointer"
                title={`Export current ${activeTab} artifacts as CSV`}
              >
                CSV
              </button>
            </div>
          )}
          <span className="text-[10px] font-mono text-slate-500 font-bold bg-slate-50 border border-[#d1d1cf] px-2.5 py-1 rounded-sm">
            ledger: {filteredArtifacts.length} images of {artifacts.length} total
          </span>
        </div>
      </div>

      {artifacts.length === 0 ? (
        <div className="bg-white rounded-sm border border-[#d1d1cf] p-24 text-center text-slate-400 text-xs font-mono">
          <Eye className="w-8 h-8 text-slate-300 stroke-[1.2] mx-auto mb-2" />
          No images staged inside local storage bucket memory.
          <p className="mt-1 text-[11px] opacity-85">Trigger simulated test orders to yield and QA test multiple artifact candidates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredArtifacts.map((art) => {
            const product = products.find(p => p.id === art.productId);
            return (
              <div
                key={art.id}
                onClick={() => setActiveArtifact(art)}
                className="group border border-[#d1d1cf] bg-white p-2 rounded-sm transition flex flex-col justify-between cursor-pointer hover:border-slate-800"
              >
                <div className="relative aspect-[4/5] bg-[#141414] rounded-sm overflow-hidden border border-[#d1d1cf] flex items-center justify-center">
                  <img
                    src={art.storagePath}
                    alt={product?.title || 'Personalized Art'}
                    className="w-full h-full object-cover group-hover:scale-[1.02] duration-200 transition"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-[#141414] text-white border border-[#d1d1cf] text-[9px] font-mono px-2 py-0.5 rounded-sm font-bold">
                      {art.qaScore}/100
                    </span>
                  </div>
                </div>

                <div className="p-1 mt-2 text-xs space-y-1">
                  <div className="font-bold text-slate-900 line-clamp-1 font-mono text-[11px]">{product?.title || 'Unknown Post'}</div>
                  <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between">
                    <span>Order #{art.orderNumber}</span>
                    <span>IT:{art.iteration} INDX:{art.candidateIndex}</span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                    {getStatusBadge(art.status)}
                    <span className="text-[9px] text-slate-400 font-mono">
                      {new Date(art.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAILED LIGHTBOX INSPECTOR MODAL */}
      {activeArtifact && (
        <div className="fixed inset-0 bg-[#141414]/90 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-slate-850">
          <div className="bg-white rounded-sm overflow-hidden max-w-4xl w-full border border-[#d1d1cf] grid grid-cols-1 md:grid-cols-2 relative">
            <button
              onClick={() => setActiveArtifact(null)}
              className="absolute top-4 right-4 bg-black hover:opacity-80 text-white rounded-sm p-1.5 transition z-10 cursor-pointer border border-[#d1d1cf] font-mono text-[10px]"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Left Box: Scaled Image */}
            <div className="bg-[#141414] p-6 flex flex-col items-center justify-center border-r border-[#d1d1cf]">
              <img
                src={activeArtifact.storagePath}
                alt="Enlarged Vector"
                className="w-full max-h-[500px] object-contain rounded-sm shadow-md bg-[#141414]"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Right Box: LLM Screening Metadata */}
            <div className="p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-mono text-blue-700 bg-blue-50 border border-blue-200 py-0.5 px-2 rounded-sm uppercase font-bold tracking-widest">
                    SWARM_CANDIDATE
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">ID: {activeArtifact.id}</span>
                </div>

                <h3 className="text-xs font-bold text-slate-400 font-mono uppercase tracking-widest border-b border-[#d1d1cf] pb-2">
                  QA COMPOSITION VECTOR
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-400">Order Reference</span>
                    <p className="font-bold text-slate-800">#{activeArtifact.orderNumber}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans">Product Layer Code</span>
                    <p className="font-bold text-slate-800">{activeArtifact.productId}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Iteration Swarm</span>
                    <p className="font-bold text-slate-800">Swarm {activeArtifact.iteration}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Candidate Grid Position</span>
                    <p className="font-bold text-slate-800">Index {activeArtifact.candidateIndex}</p>
                  </div>
                </div>

                <div className="border-t border-[#d1d1cf] pt-3 flex items-center justify-between">
                  <div className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">LLM Vision Evaluation score</div>
                  <span className="bg-emerald-500 border border-emerald-600 text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded-sm">
                    {activeArtifact.qaScore} / 100
                  </span>
                </div>

                {/* Score badge & explanations */}
                <div className="p-3 bg-slate-50 border border-[#d1d1cf] rounded-sm text-xs space-y-1">
                  <strong className="text-[10px] font-mono text-slate-400 uppercase block tracking-wider">Analysis Decision</strong>
                  <p className="text-slate-650 font-mono text-[11px] leading-relaxed">
                    "{activeArtifact.rejectionReason || 'No detailed reason parsed'}"
                  </p>
                </div>
              </div>

              {/* JSON Payload viewer */}
              <div className="space-y-1.5 flex-1 flex flex-col min-h-[140px] max-h-[180px] overflow-hidden">
                <span className="text-[9px] font-mono uppercase text-slate-400 font-bold flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-slate-500" /> RAW VISION SCREENING PAYLOAD
                </span>
                <pre className="w-full flex-1 bg-[#141414] text-emerald-400 p-2.5 rounded-sm text-[9px] font-mono overflow-y-auto border border-[#d1d1cf]">
                  {activeArtifact.qaResultJson}
                </pre>
              </div>

              <div className="text-[10px] text-slate-400 flex items-center gap-1 justify-between pt-2 border-t border-[#d1d1cf] font-mono">
                <span className="flex items-center gap-1 font-bold">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> {new Date(activeArtifact.generatedAt).toLocaleString()}
                </span>
                {getStatusBadge(activeArtifact.status)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
