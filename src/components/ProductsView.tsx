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
  // REQ-A-002: OpenRouter is the single default model gateway.
  const [primaryProv, setPrimaryProv] = useState<'OpenRouter' | 'Gemini' | 'OpenAI' | 'Midjourney' | 'Stability'>('OpenRouter');
  const [primaryModel, setPrimaryModel] = useState('');
  const [primarySecret, setPrimarySecret] = useState('');
  const [fallbackProv, setFallbackProv] = useState<'OpenRouter' | 'Gemini' | 'OpenAI' | 'Stability'>('OpenRouter');
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
      // REQ-A-002: OpenRouter is the single default model gateway.
      primaryProvider: 'OpenRouter',
      primaryModel: 'google/gemini-2.5-flash-image',
      primarySecretRef: 'SECRET_REF_OPENROUTER_API_KEY',
      fallbackProvider: 'OpenRouter',
      fallbackModel: 'google/gemini-2.5-flash-image',
      fallbackLLM: 'google/gemini-2.5-flash',
      fallbackSecretRef: 'SECRET_REF_OPENROUTER_API_KEY'
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
    setFallbackLLM(config.fallbackLLM || 'google/gemini-2.5-flash');
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
    <div className="space-y-6 animate-fade-in text-da" id="products-view-container">
      {notification && (
        <div className="fixed bottom-4 right-4 bg-b2 border border-nt text-da px-4 py-3 rounded-sm shadow-sm flex items-center gap-2.5 z-50">
          <span className="w-1.5 h-1.5 rounded-sm bg-ac animate-pulse"></span>
          <span className="text-[10px] font-mono uppercase tracking-wider font-bold">{notification}</span>
        </div>
      )}

      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-nt pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-da">Products & Config Matrix</h1>
          <p className="text-xs text-nt mt-1">Associate shop products with prompt templates and secure fallback model chains</p>
        </div>
        {!isObserver && (
          <button
            id="btn-create-product"
            onClick={handleCreateNew}
            className="bg-b2 hover:opacity-90 border border-da text-da text-[10px] font-mono font-bold px-4 py-2 rounded-sm flex items-center gap-1 cursor-pointer uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5 text-ac" /> NEW PRODUCT
          </button>
        )}
      </div>

      {/* Main layout splitting products list and edit panel if open */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Product List Table */}
        <div className={`${editingProduct ? 'lg:col-span-6' : 'lg:col-span-12'} bg-b1 rounded-sm border border-nt overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-b1 border-b border-nt text-nt font-mono text-[10px] uppercase font-bold tracking-widest select-none">
                  <th className="py-2.5 px-4 font-bold">Title & Provider</th>
                  <th className="py-2.5 px-4 font-bold border-l border-nt">External IDs</th>
                  <th className="py-2.5 px-4 font-bold border-l border-nt">Active Bind</th>
                  <th className="py-2.5 px-4 font-bold text-center border-l border-nt">Status</th>
                  {!isObserver && <th className="py-2.5 px-4 text-right border-l border-nt">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {products.map((p) => {
                  const boundTemplate = templates.find(t => t.id === p.activeTemplateId);
                  return (
                    <tr key={p.id} className="hover:bg-b1/50 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-da font-mono text-[11.5px] uppercase tracking-wide">{p.title}</div>
                        <div className="text-[10px] text-nt mt-0.5 flex items-center gap-1.5 font-mono">
                          <span className={`px-1.5 py-0.2 rounded-sm font-bold text-[9px] border ${
                            p.shopProvider === 'Etsy' ? 'bg-b1 text-ac border-ac' : 'bg-ac text-ac border-nt'
                          }`}>
                            {p.shopProvider.toUpperCase()}
                          </span>
                          &bull; {p.productType}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-nt border-l border-nt/80">
                        <div>PROD: {p.externalProductId}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">VAR: {p.externalVariantId}</div>
                      </td>
                      <td className="py-3 px-4 border-l border-nt/80">
                        {boundTemplate ? (
                          <div className="text-da font-mono text-[11px] flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-sm bg-ac"></span>
                            {boundTemplate.name.substring(0, 24)}...
                          </div>
                        ) : (
                          <span className="text-[10px] text-ac font-mono font-bold flex items-center gap-1.5 uppercase">
                            <span className="w-1.5 h-1.5 rounded-sm bg-ac"></span>
                            NO BINDER
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center border-l border-nt/80">
                        <button
                          disabled={isObserver}
                          onClick={() => toggleProductActive(p)}
                          className={`inline-flex items-center gap-1 justify-center disabled:opacity-50 ${isObserver ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {p.isActive ? (
                            <span className="bg-b1 text-ac text-[9px] uppercase font-bold py-0.5 px-2 rounded-sm border border-ac flex items-center gap-1">
                              <span className="w-1 h-1 rounded-sm bg-ac"></span>
                              Active
                            </span>
                          ) : (
                            <span className="bg-b1 text-nt text-[9px] uppercase font-bold py-0.5 px-2 rounded-sm border border-nt flex items-center gap-1">
                              <span className="w-1 h-1 rounded-sm bg-b2"></span>
                              Inactive
                            </span>
                          )}
                        </button>
                      </td>
                      {!isObserver && (
                        <td className="py-3 px-4 text-right border-l border-nt/80">
                          <button
                            id={`btn-edit-${p.id}`}
                            onClick={() => handleEdit(p)}
                            className="text-da hover:bg-b2 bg-b2 p-1.5 rounded-sm border border-nt transition cursor-pointer"
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
          <div className="lg:col-span-6 bg-b1 border border-nt p-4 rounded-sm space-y-4 animate-fade-in relative shadow-sm">
            <button
              onClick={() => {
                setEditingProduct(null);
                setSelectedConfig(null);
              }}
              className="absolute top-4 right-4 text-nt hover:text-da p-1 rounded-sm border border-nt hover:bg-b2 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-nt font-mono">
                {isNew ? 'New Product Configuration' : 'Product Parameters'}
              </h2>
              <div className="text-nt text-[10px] mt-0.5 font-mono">UUID: {editingProduct.id}</div>
            </div>

            {/* Core Fields Grid */}
            <div className="grid grid-cols-2 gap-4 bg-b1 p-4 rounded-sm border border-nt">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-nt uppercase tracking-widest font-mono">Product Display Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Astrological Birth Constellation Poster"
                  className="mt-1 w-full text-xs font-sans border border-nt bg-b1 rounded-sm p-2 outline-none focus:border-nt"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt uppercase tracking-widest font-mono">Shop Platform</label>
                <select
                  value={shopProvider}
                  onChange={(e) => setShopProvider(e.target.value as any)}
                  className="mt-1 w-full text-xs font-mono border border-nt bg-b1 rounded-sm p-2 outline-none"
                >
                  <option value="Etsy">Etsy Store</option>
                  <option value="Eatsy">Eatsy Store</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt uppercase tracking-widest font-mono">Category / Type</label>
                <input
                  type="text"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  placeholder="Fine Art Print"
                  className="mt-1 w-full text-xs font-mono border border-nt bg-b1 rounded-sm p-2 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt uppercase tracking-widest font-mono">External Product ID</label>
                <input
                  type="text"
                  value={extId}
                  onChange={(e) => setExtId(e.target.value)}
                  placeholder="etsy-1294819"
                  className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-2 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-nt uppercase tracking-widest font-mono">Variant ID</label>
                <input
                  type="text"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  placeholder="var-4412"
                  className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-2 outline-none font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-nt uppercase tracking-widest font-mono">Prompt Template Assignment</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-2 outline-none font-mono text-ac font-bold"
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
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-da font-mono flex items-center justify-between">
                <span>Generative Flow Swarms</span>
                <span className="text-[9px] bg-b1 text-ac px-2 py-0.5 rounded-sm border border-ac font-mono font-bold">Quality Gate 1 Input</span>
              </h3>

              <div className="bg-b1 p-4 rounded-sm border border-nt space-y-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[9px] font-bold text-nt font-mono uppercase">Swarms Count</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={numGenerated}
                      onChange={(e) => setNumGenerated(Number(e.target.value))}
                      className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 text-center font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-nt font-mono uppercase">Image Format</label>
                    <select
                      value={imageFormat}
                      onChange={(e) => setImageFormat(e.target.value as any)}
                      className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                    >
                      <option value="png">PNG (Lossless)</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-nt font-mono uppercase">Print Quality</label>
                    <select
                      value={imageQuality}
                      onChange={(e) => setImageQuality(e.target.value as any)}
                      className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                    >
                      <option value="standard">Standard DPI</option>
                      <option value="hd">Ultra-HD HD</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-nt pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest font-mono text-da mb-2 font-bold">Primary Model Gateway Adaptive Chain</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Model Gateway / Provider</label>
                      <select
                        value={primaryProv}
                        onChange={(e) => setPrimaryProv(e.target.value as any)}
                        className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                      >
                        <option value="OpenRouter">Model Gateway / OpenRouter (default)</option>
                        <option value="OpenAI">OpenAI (DALL-E)</option>
                        <option value="Gemini">Gemini (Imagen)</option>
                        <option value="Stability">Stability SD</option>
                        <option value="Midjourney">Midjourney</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Model Reef</label>
                      <input
                        type="text"
                        value={primaryModel}
                        onChange={(e) => setPrimaryModel(e.target.value)}
                        placeholder="google/gemini-2.5-flash-image"
                        className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-1.5 font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Secret Reference Key (No Plain Keys Allowed)</label>
                      <input
                        type="text"
                        value={primarySecret}
                        onChange={(e) => setPrimarySecret(e.target.value)}
                        placeholder="SECRET_REF_OPENROUTER_API_KEY"
                        className="mt-1 w-full text-xs border border-nt bg-b2 rounded-sm p-1.5 font-mono text-ac font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-nt pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest font-mono text-da mb-2 font-bold">Fallback Model Gateway Adaptive Chain</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Fallback Model Gateway / Provider</label>
                      <select
                        value={fallbackProv}
                        onChange={(e) => setFallbackProv(e.target.value as any)}
                        className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                      >
                        <option value="OpenRouter">Model Gateway / OpenRouter (default)</option>
                        <option value="Gemini">Gemini (Imagen)</option>
                        <option value="OpenAI">OpenAI (DALL-E)</option>
                        <option value="Stability">Stability SD</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Fallback Model Reef</label>
                      <input
                        type="text"
                        value={fallbackModel}
                        onChange={(e) => setFallbackModel(e.target.value)}
                        placeholder="imagen-3.0-generate-002"
                        className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-1.5 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Fallback Evaluator LLM</label>
                      <input
                        type="text"
                        value={fallbackLLM}
                        onChange={(e) => setFallbackLLM(e.target.value)}
                        placeholder="gemini-1.5-pro"
                        className="mt-1 w-full text-xs border border-nt bg-b1 rounded-sm p-1.5 font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[9px] font-bold font-mono text-nt uppercase">Fallback Secret Reference</label>
                      <input
                        type="text"
                        value={fallbackSecret}
                        onChange={(e) => setFallbackSecret(e.target.value)}
                        placeholder="SECRET_REF_GEMINI_FALLBACK"
                        className="mt-1 w-full text-xs border border-nt bg-b2 rounded-sm p-1.5 font-mono text-ac font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-b1 rounded-sm border border-ac p-3 text-[10px] text-ac leading-normal flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-ac shrink-0 mt-0.5" />
                  <div className="font-mono">
                    <strong>Vault Reference Rule:</strong> Plain API secrets is a system restriction bypass. Register proxies inside Bazzi secrets tab, then reference them here.
                  </div>
                </div>
              </div>
            </div>

            {/* Save Cta BAR */}
            <div className="flex gap-2 justify-end pt-2 border-t border-nt">
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setSelectedConfig(null);
                }}
                className="bg-b2 hover:bg-b2 border border-nt text-da text-[10px] font-mono font-bold px-4 py-2 rounded-sm cursor-pointer uppercase tracking-wider transition"
              >
                Cancel
              </button>
              <button
                id="btn-save-product-config"
                onClick={handleSave}
                className="bg-b2 hover:opacity-90 border border-da text-da text-[10px] font-mono font-bold px-4 py-2 rounded-sm flex items-center gap-1 cursor-pointer uppercase tracking-wider transition"
              >
                <Save className="w-3.5 h-3.5 text-ac" /> SAVE CONFIG
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
