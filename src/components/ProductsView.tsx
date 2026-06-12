import { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
import { ShopProduct, PromptTemplate, GenerationConfig } from '../types';
import { Plus, Edit2, ToggleLeft, ToggleRight, Settings, Loader2, Save, Trash, HelpCircle, X } from 'lucide-react';

export default function ProductsView() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [genConfigs, setGenConfigs] = useState<GenerationConfig[]>([]);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<GenerationConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [role, setRole] = useState<string>('Owner');

  // Form states
  const [title, setTitle] = useState('');
  const [shopProvider, setShopProvider] = useState<'Etsy' | 'Eatsy'>('Etsy');
  const [extId, setExtId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [productType, setProductType] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [templateId, setTemplateId] = useState('');

  // Generation Config states
  const [numGenerated, setNumGenerated] = useState(3);
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');
  const [imageQuality, setImageQuality] = useState<'standard' | 'hd'>('standard');
  const [primaryProv, setPrimaryProv] = useState<'Gemini' | 'OpenAI' | 'Midjourney' | 'Stability'>('OpenAI');
  const [primaryModel, setPrimaryModel] = useState('');
  const [primarySecret, setPrimarySecret] = useState('');
  const [fallbackProv, setFallbackProv] = useState<'Gemini' | 'OpenAI' | 'Stability'>('Gemini');
  const [fallbackModel, setFallbackModel] = useState('');
  const [fallbackLLM, setFallbackLLM] = useState('');
  const [fallbackSecret, setFallbackSecret] = useState('');

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const activeRole = await appServices.roles.getActiveRole();
      setRole(activeRole);
      await loadData();
    };
    init();
  }, []);

  const loadData = async () => {
    try {
      const [allProducts, allTemplates, allConfigs] = await Promise.all([
        appServices.products.getProducts(),
        appServices.templates.getTemplates(),
        appServices.settings.getGenConfigs()
      ]);
      setProducts(allProducts);
      setTemplates(allTemplates.filter(t => t.status === 'active'));
      setGenConfigs(allConfigs);
    } catch (e) {
      console.error(e);
    }
  };

  const isObserver = role === 'Observer';

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCreateNew = () => {
    if (isObserver) return;
    setIsNew(true);
    setEditingProduct({
      id: `prod-${Math.floor(1000 + Math.random() * 9000)}`,
      shopProvider: 'Etsy',
      externalProductId: '',
      externalVariantId: '',
      title: '',
      productType: '',
      isActive: true,
      createdAt: new Date().toISOString()
    });
    setTitle('');
    setShopProvider('Etsy');
    setExtId('');
    setVariantId('');
    setProductType('');
    setIsActive(true);
    setTemplateId('');
  };

  const handleEdit = (product: ShopProduct) => {
    setIsNew(false);
    setEditingProduct(product);
    setTitle(product.title);
    setShopProvider(product.shopProvider);
    setExtId(product.externalProductId);
    setVariantId(product.externalVariantId);
    setProductType(product.productType);
    setIsActive(product.isActive);
    setTemplateId(product.activeTemplateId || '');

    // Load or create generation config matching this product
    const config = genConfigs.find(c => c.productId === product.id) || {
      productId: product.id,
      numInitiallyGenerated: 3,
      imageFormat: 'png',
      imageQuality: 'standard',
      primaryProvider: 'OpenAI',
      primaryModel: 'dall-e-3',
      primarySecretRef: 'SECRET_REF_OPENAI_MAIN',
      fallbackProvider: 'Gemini',
      fallbackModel: 'imagen-3.0-generate-002',
      fallbackLLM: 'gemini-1.5-pro',
      fallbackSecretRef: 'SECRET_REF_GEMINI_FALLBACK'
    };
    setSelectedConfig(config);

    setNumGenerated(config.numInitiallyGenerated);
    setImageFormat(config.imageFormat);
    setImageQuality(config.imageQuality);
    setPrimaryProv(config.primaryProvider);
    setPrimaryModel(config.primaryModel);
    setPrimarySecret(config.primarySecretRef);
    setFallbackProv(config.fallbackProvider);
    setFallbackModel(config.fallbackModel);
    setFallbackLLM(config.fallbackLLM || 'gemini-1.5-pro');
    setFallbackSecret(config.fallbackSecretRef);
  };

  const toggleProductActive = async (product: ShopProduct) => {
    if (isObserver) return;
    const updated = products.map(p => {
      if (p.id === product.id) {
        return { ...p, isActive: !p.isActive };
      }
      return p;
    });
    try {
      await appServices.products.saveProducts(updated);
      setProducts(updated);
      showNotification(`Product status updated successfully`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleSave = async () => {
    if (isObserver || !editingProduct) return;

    if (!title || !extId || !variantId || !productType) {
      alert('Please fill out all product details.');
      return;
    }

    const savedProduct: ShopProduct = {
      ...editingProduct,
      title,
      shopProvider,
      externalProductId: extId,
      externalVariantId: variantId,
      productType,
      isActive,
      activeTemplateId: templateId || undefined
    };

    let updatedProducts = [...products];
    if (isNew) {
      updatedProducts.push(savedProduct);
    } else {
      updatedProducts = updatedProducts.map(p => p.id === savedProduct.id ? savedProduct : p);
    }

    // Save generation configuration alongside as required
    const savedConfig: GenerationConfig = {
      productId: savedProduct.id,
      numInitiallyGenerated: numGenerated,
      imageFormat,
      imageQuality,
      primaryProvider: primaryProv,
      primaryModel,
      primarySecretRef: primarySecret || 'SECRET_REF_DEFAULT_GENERATION',
      fallbackProvider: fallbackProv,
      fallbackModel,
      fallbackSecretRef: fallbackSecret || 'SECRET_REF_DEFAULT_GENERATION_FALLBACK',
      fallbackLLM
    };

    let updatedConfigs = [...genConfigs];
    const confIndex = updatedConfigs.findIndex(c => c.productId === savedProduct.id);
    if (confIndex !== -1) {
      updatedConfigs[confIndex] = savedConfig;
    } else {
      updatedConfigs.push(savedConfig);
    }

    try {
      await appServices.products.saveProducts(updatedProducts);
      await appServices.settings.saveGenConfigs(updatedConfigs);
      
      setProducts(updatedProducts);
      setGenConfigs(updatedConfigs);

      setEditingProduct(null);
      setSelectedConfig(null);
      showNotification(`Product "${title}" saved successfully`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-[#141414]" id="products-view-container">
      {notification && (
        <div className="fixed bottom-4 right-4 bg-[#141414] border border-[#d1d1cf] text-white px-4 py-3 rounded-sm shadow-sm flex items-center gap-2.5 z-50">
          <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400 animate-pulse"></span>
          <span className="text-[10px] font-mono uppercase tracking-wider font-bold">{notification}</span>
        </div>
      )}

      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d1d1cf] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#141414]">Products & Config Matrix</h1>
          <p className="text-xs text-slate-500 mt-1">Associate shop products with prompt templates and secure fallback model chains</p>
        </div>
        {!isObserver && (
          <button
            id="btn-create-product"
            onClick={handleCreateNew}
            className="bg-[#141414] hover:opacity-90 border border-black text-white text-[10px] font-mono font-bold px-4 py-2 rounded-sm flex items-center gap-1 cursor-pointer uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" /> NEW PRODUCT
          </button>
        )}
      </div>

      {/* Main layout splitting products list and edit panel if open */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Product List Table */}
        <div className={`${editingProduct ? 'lg:col-span-6' : 'lg:col-span-12'} bg-white rounded-sm border border-[#d1d1cf] overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-[#d1d1cf] text-slate-500 font-mono text-[10px] uppercase font-bold tracking-widest select-none">
                  <th className="py-2.5 px-4 font-bold">Title & Provider</th>
                  <th className="py-2.5 px-4 font-bold border-l border-[#d1d1cf]">External IDs</th>
                  <th className="py-2.5 px-4 font-bold border-l border-[#d1d1cf]">Active Bind</th>
                  <th className="py-2.5 px-4 font-bold text-center border-l border-[#d1d1cf]">Status</th>
                  {!isObserver && <th className="py-2.5 px-4 text-right border-l border-[#d1d1cf]">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {products.map((p) => {
                  const boundTemplate = templates.find(t => t.id === p.activeTemplateId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#141414] font-mono text-[11.5px] uppercase tracking-wide">{p.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono">
                          <span className={`px-1.5 py-0.2 rounded-sm font-bold text-[9px] border ${
                            p.shopProvider === 'Etsy' ? 'bg-amber-50 text-amber-700 border-amber-250' : 'bg-rose-50 text-rose-700 border-[#d1d1cf]'
                          }`}>
                            {p.shopProvider.toUpperCase()}
                          </span>
                          &bull; {p.productType}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#555] border-l border-[#d1d1cf]/80">
                        <div>PROD: {p.externalProductId}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">VAR: {p.externalVariantId}</div>
                      </td>
                      <td className="py-3 px-4 border-l border-[#d1d1cf]/80">
                        {boundTemplate ? (
                          <div className="text-slate-800 font-mono text-[11px] flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-sm bg-blue-500"></span>
                            {boundTemplate.name.substring(0, 24)}...
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-700 font-mono font-bold flex items-center gap-1.5 uppercase">
                            <span className="w-1.5 h-1.5 rounded-sm bg-amber-400"></span>
                            NO BINDER
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center border-l border-[#d1d1cf]/80">
                        <button
                          disabled={isObserver}
                          onClick={() => toggleProductActive(p)}
                          className={`inline-flex items-center gap-1 justify-center disabled:opacity-50 ${isObserver ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {p.isActive ? (
                            <span className="bg-emerald-50 text-emerald-800 text-[9px] uppercase font-bold py-0.5 px-2 rounded-sm border border-emerald-200 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-sm bg-emerald-500"></span>
                              Active
                            </span>
                          ) : (
                            <span className="bg-slate-50 text-slate-400 text-[9px] uppercase font-bold py-0.5 px-2 rounded-sm border border-slate-250 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-sm bg-slate-400"></span>
                              Inactive
                            </span>
                          )}
                        </button>
                      </td>
                      {!isObserver && (
                        <td className="py-3 px-4 text-right border-l border-[#d1d1cf]/80">
                          <button
                            id={`btn-edit-${p.id}`}
                            onClick={() => handleEdit(p)}
                            className="text-[#141414] hover:bg-slate-205 bg-slate-100 p-1.5 rounded-sm border border-[#d1d1cf] transition cursor-pointer"
                            title="Configure Settings"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Configuration & Generation Settings (Slides in on editing state) */}
        {editingProduct && (
          <div className="lg:col-span-6 bg-[#fafafa] border border-[#d1d1cf] p-4 rounded-sm space-y-4 animate-fade-in relative shadow-sm">
            <button
              onClick={() => {
                setEditingProduct(null);
                setSelectedConfig(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 p-1 rounded-sm border border-[#d1d1cf] hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono">
                {isNew ? 'New Product Configuration' : 'Product Parameters'}
              </h2>
              <div className="text-slate-500 text-[10px] mt-0.5 font-mono">UUID: {editingProduct.id}</div>
            </div>

            {/* Core Fields Grid */}
            <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-sm border border-[#d1d1cf]">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Product Display Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Astrological Birth Constellation Poster"
                  className="mt-1 w-full text-xs font-sans border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Shop Platform</label>
                <select
                  value={shopProvider}
                  onChange={(e) => setShopProvider(e.target.value as any)}
                  className="mt-1 w-full text-xs font-mono border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none"
                >
                  <option value="Etsy">Etsy Store</option>
                  <option value="Eatsy">Eatsy Store</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Category / Type</label>
                <input
                  type="text"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  placeholder="Fine Art Print"
                  className="mt-1 w-full text-xs font-mono border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">External Product ID</label>
                <input
                  type="text"
                  value={extId}
                  onChange={(e) => setExtId(e.target.value)}
                  placeholder="etsy-1294819"
                  className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Variant ID</label>
                <input
                  type="text"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  placeholder="var-4412"
                  className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Prompt Template Assignment</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-2 outline-none font-mono text-blue-800 font-bold"
                >
                  <option value="">-- No bind assigned (Suspends processing) --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (v{t.version})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Generative Configuration Sub-module */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#141414] font-mono flex items-center justify-between">
                <span>Generative Flow Swarms</span>
                <span className="text-[9px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded-sm border border-blue-200 font-mono font-bold">Quality Gate 1 Input</span>
              </h3>

              <div className="bg-white p-4 rounded-sm border border-[#d1d1cf] space-y-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 font-mono uppercase">Swarms Count</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={numGenerated}
                      onChange={(e) => setNumGenerated(Number(e.target.value))}
                      className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-1.5 text-center font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 font-mono uppercase">Image Format</label>
                    <select
                      value={imageFormat}
                      onChange={(e) => setImageFormat(e.target.value as any)}
                      className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-1.5 outline-none font-mono"
                    >
                      <option value="png">PNG (Lossless)</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 font-mono uppercase">Print Quality</label>
                    <select
                      value={imageQuality}
                      onChange={(e) => setImageQuality(e.target.value as any)}
                      className="mt-1 w-full border border-[#d1d1cf] bg-white rounded-sm p-1.5 outline-none font-mono"
                    >
                      <option value="standard">Standard DPI</option>
                      <option value="hd">Ultra-HD HD</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-[#d1d1cf] pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest font-mono text-[#141414] mb-2 font-bold">Primary Provider Adaptive Chain</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Provider</label>
                      <select
                        value={primaryProv}
                        onChange={(e) => setPrimaryProv(e.target.value as any)}
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-1.5 outline-none font-mono"
                      >
                        <option value="OpenAI">OpenAI (DALL-E)</option>
                        <option value="Gemini">Gemini (Imagen)</option>
                        <option value="Stability">Stability SD</option>
                        <option value="Midjourney">Midjourney</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Model Reef</label>
                      <input
                        type="text"
                        value={primaryModel}
                        onChange={(e) => setPrimaryModel(e.target.value)}
                        placeholder="dall-e-3"
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-1.5 font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Secret Reference Key (No Plain Keys Allowed)</label>
                      <input
                        type="text"
                        value={primarySecret}
                        onChange={(e) => setPrimarySecret(e.target.value)}
                        placeholder="SECRET_REF_OPENAI_MAIN"
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-slate-100 rounded-sm p-1.5 font-mono text-red-700 font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#d1d1cf] pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest font-mono text-[#141414] mb-2 font-bold">Fallback Provider Adaptive Chain</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Fallback Provider</label>
                      <select
                        value={fallbackProv}
                        onChange={(e) => setFallbackProv(e.target.value as any)}
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-1.5 outline-none font-mono"
                      >
                        <option value="Gemini">Gemini (Imagen)</option>
                        <option value="OpenAI">OpenAI (DALL-E)</option>
                        <option value="Stability">Stability SD</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Fallback Model Reef</label>
                      <input
                        type="text"
                        value={fallbackModel}
                        onChange={(e) => setFallbackModel(e.target.value)}
                        placeholder="imagen-3.0-generate-002"
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-1.5 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Fallback Evaluator LLM</label>
                      <input
                        type="text"
                        value={fallbackLLM}
                        onChange={(e) => setFallbackLLM(e.target.value)}
                        placeholder="gemini-1.5-pro"
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-white rounded-sm p-1.5 font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[9px] font-bold font-mono text-slate-500 uppercase">Fallback Secret Reference</label>
                      <input
                        type="text"
                        value={fallbackSecret}
                        onChange={(e) => setFallbackSecret(e.target.value)}
                        placeholder="SECRET_REF_GEMINI_FALLBACK"
                        className="mt-1 w-full text-xs border border-[#d1d1cf] bg-slate-100 rounded-sm p-1.5 font-mono text-red-700 font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 rounded-sm border border-amber-250 p-3 text-[10px] text-amber-800 leading-normal flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="font-mono">
                    <strong>Vault Reference Rule:</strong> Plain API secrets is a system restriction bypass. Register proxies inside Bazzi secrets tab, then reference them here.
                  </div>
                </div>
              </div>
            </div>

            {/* Save Cta BAR */}
            <div className="flex gap-2 justify-end pt-2 border-t border-[#d1d1cf]">
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setSelectedConfig(null);
                }}
                className="bg-slate-100 hover:bg-slate-205 border border-[#d1d1cf] text-slate-800 text-[10px] font-mono font-bold px-4 py-2 rounded-sm cursor-pointer uppercase tracking-wider transition"
              >
                Cancel
              </button>
              <button
                id="btn-save-product-config"
                onClick={handleSave}
                className="bg-[#141414] hover:opacity-90 border border-black text-white text-[10px] font-mono font-bold px-4 py-2 rounded-sm flex items-center gap-1 cursor-pointer uppercase tracking-wider transition"
              >
                <Save className="w-3.5 h-3.5 text-blue-400" /> SAVE CONFIG
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
