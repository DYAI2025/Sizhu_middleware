import { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
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

  const loadData = async () => {
    try {
      const [artList, prodList] = await Promise.all([
        appServices.artifacts.getImageArtifacts(),
        appServices.products.getProducts()
      ]);
      setArtifacts(artList);
      setProducts(prodList);
    } catch (e) {
      console.error(e);
    }
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
          <span className="bg-b1 border border-nt text-ac text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-ac"></span> Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-ac border border-ac text-ac text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-ac animate-pulse"></span> Rejected
          </span>
        );
      case 'not_selected':
        return (
          <span className="bg-b2 border border-nt text-nt text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-b2"></span> Unselected
          </span>
        );
      default:
        return (
          <span className="bg-b1 border border-nt text-da text-[9px] font-bold uppercase py-0.5 px-2 rounded-sm font-mono">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-da" id="artifacts-gallery-container animate-fade-in">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-nt pb-4">
        <div>
          <h1 className="text-xl font-bold text-da tracking-tight font-sans">Supabase Staged Artifacts</h1>
          <p className="text-xs text-nt mt-1">Explore full-resolution vector canvases with vision evaluation scores</p>
        </div>
        <div className="text-[10px] text-nt font-mono bg-b1 border border-nt px-2 py-1 rounded-sm">
          Durable Cloud Storage: <code className="text-xs text-ac font-bold">bucket://bazzi-renderings</code>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-nt pb-3">
        <div className="flex flex-wrap gap-1.5">
          {['all', 'accepted', 'rejected', 'not_selected'].map((tab) => (
            <button
              key={tab}
              id={`tab-artifacts-${tab}`}
              onClick={() => setActiveTab(tab as any)}
              className={`py-1.5 px-3.5 text-[10px] font-bold uppercase font-mono border transition cursor-pointer rounded-sm ${
                activeTab === tab
                  ? 'bg-b2 text-da border-da shadow-sm'
                  : 'bg-b1 border-nt text-nt hover:text-da hover:bg-b1'
              }`}
            >
              {tab.replace('_', ' ')} swarms
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {filteredArtifacts.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] bg-b1 border border-nt rounded-sm p-0.5">
              <span className="font-bold text-nt px-1 font-mono uppercase text-[8px] flex items-center gap-0.5">
                <Download className="w-2.5 h-2.5" /> Export:
              </span>
              <button 
                onClick={exportArtifactsAsJSON}
                className="hover:bg-b2 text-da font-mono font-bold px-1.5 py-0.5 rounded-xs transition text-[9px] cursor-pointer"
                title={`Export current ${activeTab} artifacts as JSON`}
              >
                JSON
              </button>
              <span className="text-nt">&bull;</span>
              <button 
                onClick={exportArtifactsAsCSV}
                className="hover:bg-b2 text-nt font-mono font-bold px-1.5 py-0.5 rounded-xs transition text-[9px] cursor-pointer"
                title={`Export current ${activeTab} artifacts as CSV`}
              >
                CSV
              </button>
            </div>
          )}
          <span className="text-[10px] font-mono text-nt font-bold bg-b1 border border-nt px-2.5 py-1 rounded-sm">
            ledger: {filteredArtifacts.length} images of {artifacts.length} total
          </span>
        </div>
      </div>

      {artifacts.length === 0 ? (
        <div className="bg-b1 rounded-sm border border-nt p-24 text-center text-nt text-xs font-mono">
          <Eye className="w-8 h-8 text-nt stroke-[1.2] mx-auto mb-2" />
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
                className="group border border-nt bg-b1 p-2 rounded-sm transition flex flex-col justify-between cursor-pointer hover:border-nt"
              >
                <div className="relative aspect-[4/5] bg-b2 rounded-sm overflow-hidden border border-nt flex items-center justify-center">
                  <img
                    src={art.storagePath}
                    alt={product?.title || 'Personalized Art'}
                    className="w-full h-full object-cover group-hover:scale-[1.02] duration-200 transition"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-b2 text-da border border-nt text-[9px] font-mono px-2 py-0.5 rounded-sm font-bold">
                      {art.qaScore}/100
                    </span>
                  </div>
                </div>

                <div className="p-1 mt-2 text-xs space-y-1">
                  <div className="font-bold text-da line-clamp-1 font-mono text-[11px]">{product?.title || 'Unknown Post'}</div>
                  <div className="text-[10px] font-mono text-nt flex items-center justify-between">
                    <span>Order #{art.orderNumber}</span>
                    <span>IT:{art.iteration} INDX:{art.candidateIndex}</span>
                  </div>
                  <div className="pt-1.5 border-t border-nt flex items-center justify-between">
                    {getStatusBadge(art.status)}
                    <span className="text-[9px] text-nt font-mono">
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
        <div className="fixed inset-0 bg-b2/90 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-nt">
          <div className="bg-b1 rounded-sm overflow-hidden max-w-4xl w-full border border-nt grid grid-cols-1 md:grid-cols-2 relative">
            <button
              onClick={() => setActiveArtifact(null)}
              className="absolute top-4 right-4 bg-da hover:opacity-80 text-da rounded-sm p-1.5 transition z-10 cursor-pointer border border-nt font-mono text-[10px]"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Left Box: Scaled Image */}
            <div className="bg-b2 p-6 flex flex-col items-center justify-center border-r border-nt">
              <img
                src={activeArtifact.storagePath}
                alt="Enlarged Vector"
                className="w-full max-h-[500px] object-contain rounded-sm shadow-md bg-b2"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Right Box: LLM Screening Metadata */}
            <div className="p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-mono text-ac bg-b1 border border-ac py-0.5 px-2 rounded-sm uppercase font-bold tracking-widest">
                    SWARM_CANDIDATE
                  </span>
                  <span className="text-[9px] text-nt font-mono uppercase font-bold">ID: {activeArtifact.id}</span>
                </div>

                <h3 className="text-xs font-bold text-nt font-mono uppercase tracking-widest border-b border-nt pb-2">
                  QA COMPOSITION VECTOR
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-nt">Order Reference</span>
                    <p className="font-bold text-da">#{activeArtifact.orderNumber}</p>
                  </div>
                  <div>
                    <span className="text-nt font-sans">Product Layer Code</span>
                    <p className="font-bold text-da">{activeArtifact.productId}</p>
                  </div>
                  <div>
                    <span className="text-nt">Iteration Swarm</span>
                    <p className="font-bold text-da">Swarm {activeArtifact.iteration}</p>
                  </div>
                  <div>
                    <span className="text-nt">Candidate Grid Position</span>
                    <p className="font-bold text-da">Index {activeArtifact.candidateIndex}</p>
                  </div>
                </div>

                <div className="border-t border-nt pt-3 flex items-center justify-between">
                  <div className="text-[10px] font-bold text-nt uppercase font-mono tracking-wider">LLM Vision Evaluation score</div>
                  <span className="bg-ac border border-da text-da font-mono font-bold text-xs px-2.5 py-0.5 rounded-sm">
                    {activeArtifact.qaScore} / 100
                  </span>
                </div>

                {/* Score badge & explanations */}
                <div className="p-3 bg-b1 border border-nt rounded-sm text-xs space-y-1">
                  <strong className="text-[10px] font-mono text-nt uppercase block tracking-wider">Analysis Decision</strong>
                  <p className="text-nt font-mono text-[11px] leading-relaxed">
                    "{activeArtifact.rejectionReason || 'No detailed reason parsed'}"
                  </p>
                </div>
              </div>

              {/* JSON Payload viewer */}
              <div className="space-y-1.5 flex-1 flex flex-col min-h-[140px] max-h-[180px] overflow-hidden">
                <span className="text-[9px] font-mono uppercase text-nt font-bold flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-nt" /> RAW VISION SCREENING PAYLOAD
                </span>
                <pre className="w-full flex-1 bg-b2 text-ac p-2.5 rounded-sm text-[9px] font-mono overflow-y-auto border border-nt">
                  {activeArtifact.qaResultJson}
                </pre>
              </div>

              <div className="text-[10px] text-nt flex items-center gap-1 justify-between pt-2 border-t border-nt font-mono">
                <span className="flex items-center gap-1 font-bold">
                  <Calendar className="w-3.5 h-3.5 text-nt" /> {new Date(activeArtifact.generatedAt).toLocaleString()}
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
