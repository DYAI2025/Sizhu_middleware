import { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
import { PromptTemplate, ShopProduct, GenerationConfig, QualityGate1Config, PersonalizationConfig, PodProviderConfig } from '../types';
import { Save, AlertTriangle, HelpCircle, Key, RefreshCw, Layers, CheckCircle, Info, Mail, Target } from 'lucide-react';
import { FuFireTestConsole } from './FuFireTestConsole';

interface ConfigControllerProps {
  activeSection: string;
}

export default function ConfigurationViews({ activeSection }: ConfigControllerProps) {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [genConfigs, setGenConfigs] = useState<GenerationConfig[]>([]);
  const [qualityConfigs, setQualityConfigs] = useState<QualityGate1Config[]>([]);
  const [personalization, setPersonalization] = useState<PersonalizationConfig | null>(null);
  const [podConfig, setPodConfig] = useState<PodProviderConfig | null>(null);
  const [role, setRole] = useState<string>('Owner');
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const activeRole = await appServices.roles.getActiveRole();
      setRole(activeRole);
      await loadAllConfigs();
    };
    init();
  }, [activeSection]);

  const loadAllConfigs = async () => {
    try {
      const [
        allProducts,
        allTemplates,
        allConfigs,
        allQualityConfigs,
        allPersonalization,
        allPodConfig
      ] = await Promise.all([
        appServices.products.getProducts(),
        appServices.templates.getTemplates(),
        appServices.settings.getGenConfigs(),
        appServices.settings.getQualityConfigs(),
        appServices.settings.getPersonalizationConfig(),
        appServices.settings.getPodConfig()
      ]);
      setProducts(allProducts);
      setTemplates(allTemplates);
      setGenConfigs(allConfigs);
      setQualityConfigs(allQualityConfigs as QualityGate1Config[]);
      setPersonalization(allPersonalization);
      setPodConfig(allPodConfig);
    } catch (e) {
      console.error(e);
    }
  };

  const isObserver = role === 'Observer';

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // ==========================================
  // Section A: Product-Template Mappings Binding
  // ==========================================
  const handleBindTemplate = async (productId: string, templateId: string) => {
    if (isObserver) return;
    const list = [...products];
    const index = list.findIndex(p => p.id === productId);
    if (index !== -1) {
      list[index].activeTemplateId = templateId || undefined;
      try {
        await appServices.products.saveProducts(list);
        setProducts(list);
        triggerNotification('Product-template binder successfully updated.');
      } catch (e) {
        alert((e as Error).message);
      }
    }
  };

  // ==========================================
  // Section B: Quality Gate 1 Settings States
  // ==========================================
  const [selectedGateProdId, setSelectedGateProdId] = useState('prod-001');
  const activeGateConfig = qualityConfigs.find(q => q.productId === selectedGateProdId) || {
    productId: selectedGateProdId,
    llmProvider: 'Gemini' as const,
    model: 'gemini-2.5-pro',
    secretRef: 'SECRET_REF_GEMINI_QA',
    fallbackProvider: 'OpenAI' as const,
    fallbackModel: 'gpt-4o',
    fallbackSecretRef: 'SECRET_REF_GPT_QA_FALLBACK',
    qaPrompt: '',
    referenceImages: [],
    faultTolerance: 'medium' as const,
    minAcceptanceScore: 80,
    maxRejectedBeforeEscalation: 3,
    escalationEmailTemplate: ''
  };

  const saveGateConfig = async (updated: QualityGate1Config) => {
    if (isObserver) return;
    let list = [...qualityConfigs];
    const index = list.findIndex(q => q.productId === updated.productId);
    if (index !== -1) {
      list[index] = updated;
    } else {
      list.push(updated);
    }
    try {
      await appServices.settings.saveQualityConfigs(list);
      setQualityConfigs(list);
      triggerNotification('LLM Quality Gate parameters saved.');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // ==========================================
  // Section C: Personalization (FuFire) Save
  // ==========================================
  const handleSavePersonalization = async () => {
    if (isObserver || !personalization) return;
    try {
      await appServices.settings.savePersonalizationConfig(personalization);
      triggerNotification('FuFire core endpoint config stored.');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // ==========================================
  // Section D: POD Provider Configuration (Gelato)
  // ==========================================
  const handleSavePod = async () => {
    if (isObserver || !podConfig) return;
    try {
      await appServices.settings.savePodConfig(podConfig);
      triggerNotification('POD Fulfillment dispatch mode written.');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleUpdateProductUid = (productId: string, newUid: string) => {
    if (isObserver || !podConfig) return;
    const updated = {
      ...podConfig,
      productUidMappings: {
        ...podConfig.productUidMappings,
        [productId]: newUid
      }
    };
    setPodConfig(updated);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="configuration-control-hud">
      {notification && (
        <div className="fixed bottom-4 right-4 bg-b2 border border-nt text-da px-4 py-3 rounded-sm shadow-sm flex items-center gap-2.5 z-50">
          <span className="w-1.5 h-1.5 rounded-full bg-ac animate-pulse"></span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{notification}</span>
        </div>
      )}

      {/* Header bar mapping */}
      <div className="border-b border-nt pb-4">
        <h1 className="text-xl font-bold text-da tracking-tight font-sans capitalize">{activeSection} Control</h1>
        <p className="text-xs text-nt mt-1">Configure systemic constraints, custom gate bounds, and webhook payloads</p>
      </div>

      {/* 1. PRODUCT TEMPLATE MAPPING VIEW */}
      {activeSection === 'Product Template Mapping' && (
        <div className="bg-b1 border border-nt p-6 rounded-sm space-y-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest font-mono text-nt">Scope Bindings Register</h2>
            <p className="text-xs text-nt mt-0.5">Binds shop variants to exactly one checked operational Liquid astroglyph prompt.</p>
          </div>

          <div className="divide-y divide-slate-150 border border-nt rounded-sm overflow-hidden">
            {products.map((p) => (
              <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs hover:bg-b1/50 transition">
                <div>
                  <h3 className="font-bold text-da font-mono text-[13px]">{p.title}</h3>
                  <div className="text-[10px] text-nt flex items-center gap-1.5 mt-0.5 font-mono">
                    <span>Provider: {p.shopProvider}</span>
                    <span>&bull;</span>
                    <span>ID: {p.externalProductId}</span>
                    <span>&bull;</span>
                    <span>Variant: {p.externalVariantId}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold font-mono text-nt uppercase">BIND TEMPLATE</span>
                  <select
                    disabled={isObserver}
                    value={p.activeTemplateId || ''}
                    onChange={(e) => handleBindTemplate(p.id, e.target.value)}
                    className="border border-nt bg-b1 rounded-sm p-1.5 text-xs text-da outline-none max-w-[240px] font-mono"
                  >
                    <option value="">-- NO ACTIVE BIND (SUSPEND STATE) --</option>
                    {templates.filter(t => t.status === 'active').map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} (v{t.version})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. GENERATION PROVIDERS VIEW */}
      {activeSection === 'Generation Providers' && (
        <div className="bg-b1 border border-nt p-6 rounded-sm space-y-4">
          <div className="flex items-center justify-between border-b border-nt pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest font-mono text-nt">System Generation Pools</h2>
              <p className="text-xs text-nt mt-0.5">Master ledger of generative rendering layers configured for catalog listings.</p>
            </div>
            <span className="bg-b1 border border-ac text-ac text-[9px] font-bold py-1 px-3 rounded-sm font-mono uppercase tracking-widest">
              LOCKED_KEY_VAULT
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {genConfigs.map((cfg) => {
              const product = products.find(p => p.id === cfg.productId);
              return (
                <div key={cfg.productId} className="border border-nt rounded-sm p-4 bg-b1/50 space-y-3">
                  <div className="flex items-center justify-between border-b border-nt pb-2">
                    <span className="font-bold text-xs text-da truncate max-w-[200px] font-mono" title={product?.title}>
                      {product?.title || 'Unknown Product Layer'}
                    </span>
                    <span className="text-[9px] bg-b1 border border-nt text-da py-0.5 px-2 rounded-sm font-mono font-bold uppercase leading-none">
                      {cfg.imageFormat.toUpperCase()} &bull; {cfg.imageQuality.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-nt font-mono">PRIMARY ENGINE</span>
                      <strong className="font-mono text-ac font-bold">{cfg.primaryProvider} / {cfg.primaryModel}</strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-nt font-mono">VAULT TOKEN</span>
                      <strong className="text-ac font-mono font-bold text-[10px] bg-b1 px-1 border border-ac">{cfg.primarySecretRef}</strong>
                    </div>

                    <div className="flex items-center justify-between border-t border-nt pt-2 font-mono">
                      <span className="text-nt uppercase text-[10px]">FALLBACK ENGINE</span>
                      <span className="text-da font-bold">{cfg.fallbackProvider} / {cfg.fallbackModel}</span>
                    </div>

                    <div className="flex items-center justify-between font-mono">
                      <span className="text-nt uppercase text-[10px]">EVALUATOR LLM</span>
                      <span className="text-nt font-bold">{cfg.fallbackLLM}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 bg-b1 rounded-sm text-ac border border-ac text-xs flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-ac shrink-0 mt-0.5" />
            <div className="leading-snug">
              <strong>Vault Cryptography Principle:</strong> High-risk credentials are <strong>never</strong> recorded in catalog models. Env proxies process API request payloads through secure endpoints dynamically.
            </div>
          </div>
        </div>
      )}

      {/* 3. QUALITY GATE 1 VIEW */}
      {activeSection === 'Quality Gate 1' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6">
          
          {/* List panel */}
          <div className="lg:col-span-4 bg-b1 border border-nt p-4 rounded-sm space-y-3">
            <span className="text-[10px] font-bold font-mono text-nt uppercase tracking-widest block">Target Register</span>
            <div className="space-y-2">
              {products.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedGateProdId(p.id)}
                  className={`w-full text-left p-3 rounded-sm border text-xs cursor-pointer transition ${
                    selectedGateProdId === p.id 
                      ? 'bg-b1/50 border-ac border-l-2 border-l-blue-500' 
                      : 'bg-b1 border-nt hover:bg-b2'
                  }`}
                >
                  <div className="font-bold text-da truncate font-mono text-[11px]">{p.title}</div>
                  <div className="text-[9px] font-mono text-nt mt-1">ID: {p.id}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration form panel */}
          <div className="lg:col-span-8 bg-b1 border border-nt p-6 rounded-sm space-y-5">
            <div className="border-b border-nt pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-da font-mono text-[13px] uppercase">Inspection Engine: Quality Gate 1</h3>
                <p className="text-xs text-nt mt-0.5">Define Gemini Vision constraints, visual markers, and auto-escalations.</p>
              </div>
              <span className="font-mono text-[9px] bg-ac text-ac border border-ac py-1 px-2 rounded-sm font-bold tracking-widest">
                GATE_1_LOCK
              </span>
            </div>

            <div className="space-y-4 text-xs font-sans text-da">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-nt uppercase font-mono tracking-wider">LLM Vision Provider</label>
                  <select
                    disabled={isObserver}
                    value={activeGateConfig.llmProvider}
                    onChange={(e) => saveGateConfig({ ...activeGateConfig, llmProvider: e.target.value as any })}
                    className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 font-mono text-xs outline-none"
                  >
                    <option value="Gemini">Gemini (Imagen QA Model)</option>
                    <option value="OpenAI">OpenAI (GPT-4o Vision)</option>
                    <option value="Claude">Claude 3.5 Sonnet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-nt uppercase font-mono tracking-wider">Inspection Model</label>
                  <input
                    type="text"
                    disabled={isObserver}
                    value={activeGateConfig.model}
                    onChange={(e) => saveGateConfig({ ...activeGateConfig, model: e.target.value })}
                    placeholder="gemini-2.5-pro"
                    className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 font-mono text-xs outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-nt uppercase font-mono tracking-wider">Credentials Key Vault Secret Reference</label>
                  <input
                    type="text"
                    disabled={isObserver}
                    value={activeGateConfig.secretRef}
                    onChange={(e) => saveGateConfig({ ...activeGateConfig, secretRef: e.target.value })}
                    placeholder="SECRET_REF_GEMINI_QA"
                    className="mt-1 w-full border border-nt bg-b2 rounded-sm p-1.5 font-mono text-ac font-bold text-xs"
                  />
                </div>
              </div>

              {/* Threshold parameters */}
              <div className="border-t border-nt pt-3">
                <div className="text-[10px] font-bold text-nt mb-3 uppercase font-mono tracking-wider">Gate Safety Variables</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-nt font-mono uppercase">Fault Tolerance</label>
                    <select
                      disabled={isObserver}
                      value={activeGateConfig.faultTolerance}
                      onChange={(e) => saveGateConfig({ ...activeGateConfig, faultTolerance: e.target.value as any })}
                      className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 font-mono text-xs outline-none"
                    >
                      <option value="low">Low (Strict)</option>
                      <option value="medium">Medium</option>
                      <option value="high">High (Relaxed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-nt font-mono uppercase">Min Score (10-100)</label>
                    <input
                      type="number"
                      disabled={isObserver}
                      min={10}
                      max={100}
                      value={activeGateConfig.minAcceptanceScore}
                      onChange={(e) => saveGateConfig({ ...activeGateConfig, minAcceptanceScore: Number(e.target.value) })}
                      className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 text-center font-bold font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-nt font-mono uppercase">Max Iterations</label>
                    <input
                      type="number"
                      disabled={isObserver}
                      min={1}
                      max={5}
                      value={activeGateConfig.maxRejectedBeforeEscalation}
                      onChange={(e) => saveGateConfig({ ...activeGateConfig, maxRejectedBeforeEscalation: Number(e.target.value) })}
                      className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 text-center font-bold font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Evaluators Prompts editor */}
              <div className="border-t border-nt pt-3 space-y-2">
                <label className="block text-[10px] font-bold text-nt uppercase font-mono tracking-wider">Vision Engine System Instructions / Rules</label>
                <textarea
                  disabled={isObserver}
                  rows={2}
                  value={activeGateConfig.qaPrompt}
                  onChange={(e) => saveGateConfig({ ...activeGateConfig, qaPrompt: e.target.value })}
                  placeholder="Evaluate the composition colors, alignment and text overlays..."
                  className="w-full border border-nt rounded-sm p-2 bg-b1 font-mono text-[11px] leading-relaxed focus:outline-none"
                />
              </div>

              {/* Upload Reference images layout */}
              <div className="border-t border-nt pt-3 space-y-2">
                <span className="block text-[10px] font-bold text-nt uppercase font-mono tracking-wider">Target Comparison Matrices / Reference Canvas</span>
                <div className="flex flex-wrap items-center gap-3">
                  {activeGateConfig.referenceImages.map((imgUrl, i) => (
                    <div key={i} className="border border-nt rounded-sm p-1.5 bg-b1 w-[70px] aspect-square flex items-center justify-center">
                      <img src={imgUrl} className="max-w-full max-h-full rounded-sm" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                  
                  <div className="border border-dashed border-nt hover:border-nt transition rounded-sm text-nt w-[70px] aspect-square flex flex-col items-center justify-center text-center cursor-pointer bg-b1">
                    <span className="text-[10px] font-bold font-mono uppercase">+ UPLOAD</span>
                    <span className="text-[7px] font-mono">IMG FILES</span>
                  </div>
                  <span className="text-[10.5px] text-nt italic font-mono">Preseeded standard template vectors mapped to coordinate grid.</span>
                </div>
              </div>

              {/* Rejections Escalation Template editor as requested */}
              <div className="border-t border-nt pt-3 space-y-2">
                <h4 className="font-bold text-da text-[10px] font-mono uppercase flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-ac" /> Auto-Escalation Email Template Editor (Liquid Syntax)
                </h4>
                <p className="text-[10px] text-nt font-mono leading-normal">
                  Fires automatically to dispatcher. Dynamic keys: <code>{"{{order_number}}"}, {"{{product_title}}"}, {"{{iteration_count}}"}, {"{{rejection_reasons}}"}</code>
                </p>
                <textarea
                  disabled={isObserver}
                  rows={4}
                  value={activeGateConfig.escalationEmailTemplate}
                  onChange={(e) => saveGateConfig({ ...activeGateConfig, escalationEmailTemplate: e.target.value })}
                  placeholder="Paste or write raw Liquid compilation template email content here..."
                  className="w-full border border-nt rounded-sm p-2 bg-b1 font-mono text-[11px] leading-relaxed focus:outline-none"
                />
              </div>

            </div>
          </div>

        </div>
      )}

      {/* 4. PERSONALIZATION API CONFIG VIEW */}
      {activeSection === 'Personalization API' && personalization && (
        <div className="space-y-4">
          <div className="bg-b1 border border-nt p-6 rounded-sm space-y-5 animate-fade-in text-da">
            <div className="border-b border-nt pb-3 flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-widest font-mono text-nt">Personalization Adapter (FuFire API)</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Enabled</span>
                <input
                  type="checkbox"
                  disabled={isObserver}
                  checked={personalization.enabled}
                  onChange={(e) => setPersonalization({ ...personalization, enabled: e.target.checked })}
                  className="w-3.5 h-3.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans text-da">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Service Adapter Identifier</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.name}
                  onChange={(e) => setPersonalization({ ...personalization, name: e.target.value })}
                  className="w-full border border-nt rounded-sm p-2 font-mono font-bold mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Base URL</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.baseUrl}
                  onChange={(e) => setPersonalization({ ...personalization, baseUrl: e.target.value })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Auth Credentials Secret Ref</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.apiKeySecretRef}
                  onChange={(e) => setPersonalization({ ...personalization, apiKeySecretRef: e.target.value })}
                  className="w-full border border-nt bg-b2 rounded-sm p-2 font-mono text-ac font-bold mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Chronometry Resolve Path</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.endpointPaths.chronometryResolve}
                  onChange={(e) => setPersonalization({ ...personalization, endpointPaths: { ...personalization.endpointPaths, chronometryResolve: e.target.value } })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">BaZi Path</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.endpointPaths.bazi}
                  onChange={(e) => setPersonalization({ ...personalization, endpointPaths: { ...personalization.endpointPaths, bazi: e.target.value } })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">BaZi Trace Path</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.endpointPaths.baziTrace}
                  onChange={(e) => setPersonalization({ ...personalization, endpointPaths: { ...personalization.endpointPaths, baziTrace: e.target.value } })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">WuXing Path</label>
                <input
                  type="text"
                  disabled={isObserver}
                  value={personalization.endpointPaths.wuxing}
                  onChange={(e) => setPersonalization({ ...personalization, endpointPaths: { ...personalization.endpointPaths, wuxing: e.target.value } })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Default Standard</label>
                <select
                  disabled={isObserver}
                  value={personalization.defaultStandard}
                  onChange={(e) => setPersonalization({ ...personalization, defaultStandard: e.target.value })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs bg-b1 cursor-pointer"
                >
                  <option value="CIVIL">CIVIL</option>
                  <option value="LOCAL_MEAN">LOCAL_MEAN</option>
                  <option value="APPARENT_SOLAR">APPARENT_SOLAR</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Default Boundary</label>
                <select
                  disabled={isObserver}
                  value={personalization.defaultBoundary}
                  onChange={(e) => setPersonalization({ ...personalization, defaultBoundary: e.target.value })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs bg-b1 cursor-pointer"
                >
                  <option value="midnight">Midnight</option>
                  <option value="23_00">23:00</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Ambiguous Time Policy</label>
                <select
                  disabled={isObserver}
                  value={personalization.ambiguousTimePolicy}
                  onChange={(e) => setPersonalization({ ...personalization, ambiguousTimePolicy: e.target.value as any })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs bg-b1 cursor-pointer"
                >
                  <option value="earlier">earlier</option>
                  <option value="later">later</option>
                  <option value="require_manual_resolution">require_manual_resolution</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Nonexistent Time Policy</label>
                <select
                  disabled={isObserver}
                  value={personalization.nonexistentTimePolicy}
                  onChange={(e) => setPersonalization({ ...personalization, nonexistentTimePolicy: e.target.value as any })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs bg-b1 cursor-pointer"
                >
                  <option value="error">error</option>
                  <option value="shift_forward">shift_forward</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Timeout (ms)</label>
                <input
                  type="number"
                  disabled={isObserver}
                  value={personalization.timeoutMs}
                  onChange={(e) => setPersonalization({ ...personalization, timeoutMs: parseInt(e.target.value, 10) || 10000 })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Retry Count</label>
                <input
                  type="number"
                  disabled={isObserver}
                  value={personalization.retryCount}
                  onChange={(e) => setPersonalization({ ...personalization, retryCount: parseInt(e.target.value, 10) || 3 })}
                  className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
                />
              </div>
            </div>

            {!isObserver && (
              <div className="flex justify-end pt-3 border-t border-nt">
                <button
                  id="btn-save-personalization"
                  onClick={handleSavePersonalization}
                  className="bg-b2 hover:opacity-90 text-da font-bold font-mono p-2 px-6 rounded-sm text-xs flex items-center gap-1.5 cursor-pointer uppercase tracking-wider border border-da"
                >
                  <Save className="w-3.5 h-3.5 text-ac" /> Save Coordinates
                </button>
              </div>
            )}
          </div>
          <FuFireTestConsole personalization={personalization} />
        </div>
      )}

      {/* 5. POD PROVIDER VIEW */}
      {activeSection === 'Fulfillment / Shipping APIs' && podConfig && (
        <div className="bg-b1 border border-nt p-6 rounded-sm space-y-5 animate-fade-in text-da">
          <div className="flex border-b border-nt pb-3 items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest font-mono text-nt">Fulfillment Engine Settings (Gelato Pod)</h2>
              <p className="text-xs text-nt mt-1">Configure automated dispatch specifications for Print-On-Demand dispatchers.</p>
            </div>
            <span className="bg-b1 border border-ac text-ac text-[10px] py-1 px-3.5 rounded-sm font-mono font-bold uppercase tracking-wide leading-none">
              {podConfig.dispatchMode === 'disabled' ? 'DISABLED' : 'CONFIG_REQUIRED'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans text-da">
            <div>
              <label className="block text-[10px] font-mono font-bold text-nt uppercase tracking-widest">Default POD Provider Name</label>
              <input
                type="text"
                disabled={isObserver}
                value={podConfig.name}
                onChange={(e) => setPodConfig({ ...podConfig, name: e.target.value })}
                className="w-full border border-nt rounded-sm p-2 font-mono font-bold mt-1 text-xs bg-b2 text-nt"
                readOnly
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-nt uppercase tracking-widest">Live Endpoint API base</label>
              <input
                type="text"
                disabled={isObserver}
                value={podConfig.baseUrl}
                onChange={(e) => setPodConfig({ ...podConfig, baseUrl: e.target.value })}
                className="w-full border border-nt rounded-sm p-2 font-mono mt-1 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-nt uppercase tracking-widest">Access Private Secret Vault Reference</label>
              <input
                type="text"
                disabled={isObserver}
                value={podConfig.secretRef}
                onChange={(e) => setPodConfig({ ...podConfig, secretRef: e.target.value })}
                className="w-full border border-nt bg-b2 rounded-sm p-2 font-mono text-ac font-bold mt-1 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-nt uppercase tracking-widest">Fulfillment Dispatch Mode</label>
              <select
                disabled={isObserver}
                value={podConfig.dispatchMode}
                onChange={(e) => setPodConfig({ ...podConfig, dispatchMode: e.target.value as any })}
                className="w-full border border-nt bg-b1 rounded-sm p-2 font-bold font-mono text-xs text-da mt-1"
              >
                <option value="disabled">Disabled (No API connection)</option>
                <option value="draft">Queue Creator Only (Build Draft Orders)</option>
                <option value="order">Direct AutoSubmit (Instant Production)</option>
              </select>
            </div>

            {/* Product UID mapper per shop product */}
            <div className="md:col-span-2 border-t border-nt pt-4 space-y-3">
              <h3 className="font-bold text-da uppercase font-mono tracking-widest text-[11px]">Product SKU mappings</h3>
              <p className="text-[11px] font-mono text-nt">Pair shop items with physical print blueprints and paper weight codes inside Gelato.</p>

              <div className="grid grid-cols-1 gap-2 border border-nt rounded-sm overflow-hidden divide-y divide-slate-150">
                {products.map((p) => {
                  const val = podConfig.productUidMappings[p.id] || '';
                  return (
                    <div key={p.id} className="p-3 bg-b1/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="font-bold text-da truncate max-w-[250px] font-mono">{p.title}</div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-nt uppercase">BluePrint UID:</span>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={val}
                          onChange={(e) => handleUpdateProductUid(p.id, e.target.value)}
                          placeholder="gelato-uuid-xxx"
                          className="border border-nt bg-b1 rounded-sm p-1.5 font-mono text-xs min-w-[260px]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {!isObserver && (
            <div className="flex justify-end pt-3 border-t border-nt">
              <button
                id="btn-save-pod"
                onClick={handleSavePod}
                className="bg-b2 hover:opacity-90 text-da font-bold font-mono p-2 px-6 rounded-sm text-xs flex items-center gap-1.5 cursor-pointer uppercase tracking-wider border border-da"
              >
                <Save className="w-3.5 h-3.5 text-ac" /> Save Dispatch Rules
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
