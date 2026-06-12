import React, { useState, useEffect, useRef } from 'react';
import { appServices } from '../lib/app/appServices';
import {
  PromptTemplate,
  ShopProduct,
  VisualWorkflow,
  WorkflowNode,
  WorkflowConnection,
  AppRoleName
} from '../types';
import {
  Zap,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  Printer,
  ChevronRight,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  Move,
  Settings,
  X,
  Play,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';

export default function WorkflowBuilderView() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [activeWorkflow, setActiveWorkflow] = useState<VisualWorkflow | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [role, setRole] = useState<AppRoleName>('Owner');
  const [notification, setNotification] = useState<string | null>(null);
  const [isDraggingNodeId, setIsDraggingNodeId] = useState<string | null>(null);
  
  // DRAG AND DROP OFFSET IN NODE DRAG
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sync initial datasets
    const init = async () => {
      try {
        const [allProds, allTemps, activeRole] = await Promise.all([
          appServices.products.getProducts(),
          appServices.templates.getTemplates(),
          appServices.roles.getActiveRole()
        ]);
        setProducts(allProds);
        setTemplates(allTemps.filter(t => t.status === 'active'));
        setRole(activeRole);

        if (allProds.length > 0) {
          const pid = allProds[0].id;
          setSelectedProductId(pid);
          await loadWorkflowForProduct(pid);
        }
      } catch (e) {
        console.error(e);
      }
    };
    init();

    const handleRoleChanged = async () => {
      try {
        const activeRole = await appServices.roles.getActiveRole();
        setRole(activeRole);
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('bazzi_role_changed', handleRoleChanged);
    return () => {
      window.removeEventListener('bazzi_role_changed', handleRoleChanged);
    };
  }, []);

  const isObserver = role === 'Observer';

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadWorkflowForProduct = async (productId: string) => {
    try {
      const config = await appServices.workflows.getVisualWorkflow(productId);
      setActiveWorkflow(config);
      // Select first node by default if available
      if (config.nodes.length > 0) {
        setSelectedNodeId(config.nodes[0].id);
      } else {
        setSelectedNodeId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    loadWorkflowForProduct(productId);
  };

  const activeNode = activeWorkflow?.nodes.find(n => n.id === selectedNodeId) || null;

  // H5 DRAG START CODES FROM SIDEBAR
  const handleSidebarDragStart = (e: React.DragEvent, nodeType: string) => {
    if (isObserver) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('bazzi_node_type', nodeType);
  };

  // H5 CANVAS DROP CODES
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isObserver || !activeWorkflow) return;

    const nodeType = e.dataTransfer.getData('bazzi_node_type') as WorkflowNode['type'];
    if (!nodeType) return;

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(20, Math.min(rect.width - 220, e.clientX - rect.left - 100));
    const y = Math.max(20, Math.min(rect.height - 100, e.clientY - rect.top - 35));

    // Formulate a high-polished default state corresponding to the node category
    let defaultTitle = '';
    let description = '';
    let defaultConfig = {};

    switch (nodeType) {
      case 'personalization':
        defaultTitle = 'Personalization API';
        description = 'Extracts astro birth charts & meta fields';
        defaultConfig = {
          name: 'FuFire API Portal',
          apiUrl: 'https://api.fufire.io/v1/personalization',
          secretRef: 'SECRET_REF_FUFIRE_LIVE_KEY'
        };
        break;
      case 'template':
        defaultTitle = 'Prompt Template Selection';
        description = 'Binds astrology Liquid templates';
        defaultConfig = {
          templateId: templates.length > 0 ? templates[0].id : ''
        };
        break;
      case 'generation':
        defaultTitle = 'Image Generation Stage';
        description = 'Invokes image swarms iteratively';
        defaultConfig = {
          numInitiallyGenerated: 3,
          imageFormat: 'png',
          imageQuality: 'standard',
          primaryProvider: 'Gemini',
          primaryModel: 'imagen-3.0-generate-002',
          primarySecretRef: 'SECRET_REF_GEMINI_MAIN',
          fallbackProvider: 'OpenAI',
          fallbackModel: 'dall-e-3',
          fallbackSecretRef: 'SECRET_REF_OPENAI_FALLBACK'
        };
        break;
      case 'quality_gate':
        defaultTitle = 'Quality Gate 1 Evaluation';
        description = 'Vision screening validator scoring candidates';
        defaultConfig = {
          llmProvider: 'Gemini',
          model: 'gemini-2.5-flash',
          secretRef: 'SECRET_REF_GEMINI_QA',
          minAcceptanceScore: 80,
          maxRejectedBeforeEscalation: 3,
          qaPrompt: 'Review candidate renders for noise background, typos, blurred limits...'
        };
        break;
      case 'pod':
        defaultTitle = 'POD Provider Integration';
        description = 'Dispatched print payloads securely';
        defaultConfig = {
          name: 'Gelato POD Default Engine',
          baseUrl: 'https://api.gelato.com/v2/orders',
          secretRef: 'SECRET_REF_GELATO_PROD_TOKEN',
          dispatchMode: 'draft',
          productUid: 'print-poster-standard-uuid'
        };
        break;
    }

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: nodeType,
      title: defaultTitle,
      description,
      x,
      y,
      config: defaultConfig
    };

    const updatedNodes = [...activeWorkflow.nodes, newNode];
    
    // Auto-generate linear edges based on left-to-right sorting as standard routing pipelines
    const resortedNodes = [...updatedNodes].sort((a, b) => a.x - b.x);
    const updatedEdges: WorkflowConnection[] = [];
    for (let i = 0; i < resortedNodes.length - 1; i++) {
      updatedEdges.push({
        id: `edge-${i}-${Date.now()}`,
        source: resortedNodes[i].id,
        target: resortedNodes[i+1].id
      });
    }

    const nextWorkflowState = {
      ...activeWorkflow,
      nodes: updatedNodes,
      edges: updatedEdges,
      updatedAt: new Date().toISOString()
    };

    setActiveWorkflow(nextWorkflowState);
    setSelectedNodeId(newNode.id);
    showNotification(`Added new stage: ${defaultTitle}`);
  };

  // MOUSE-DRAG CODES FOR NODES MOVEMENT IN CANVAS
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (isObserver) return;
    e.stopPropagation();
    setIsDraggingNodeId(nodeId);
    
    const node = activeWorkflow?.nodes.find(n => n.id === nodeId);
    if (node) {
      dragStartOffset.current = {
        x: e.clientX - node.x,
        y: e.clientY - node.y
      };
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingNodeId || !activeWorkflow || !canvasRef.current) return;
    e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const targetX = Math.max(10, Math.min(rect.width - 210, e.clientX - dragStartOffset.current.x));
    const targetY = Math.max(10, Math.min(rect.height - 90, e.clientY - dragStartOffset.current.y));

    const updatedNodes = activeWorkflow.nodes.map(n => {
      if (n.id === isDraggingNodeId) {
        return { ...n, x: targetX, y: targetY };
      }
      return n;
    });

    // Auto-recalculate edge matrix flow when x coords shuffle
    const sortedNodes = [...updatedNodes].sort((a, b) => a.x - b.x);
    const updatedEdges: WorkflowConnection[] = [];
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      updatedEdges.push({
        id: `edge-${i}-${Date.now()}`,
        source: sortedNodes[i].id,
        target: sortedNodes[i+1].id
      });
    }

    setActiveWorkflow({
      ...activeWorkflow,
      nodes: updatedNodes,
      edges: updatedEdges,
      updatedAt: new Date().toISOString()
    });
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingNodeId(null);
  };

  // DELETE STAGE NODE
  const handleDeleteNode = (nodeId: string) => {
    if (isObserver || !activeWorkflow) return;

    const filteredNodes = activeWorkflow.nodes.filter(n => n.id !== nodeId);
    
    // Auto-rebuild edges sequentially
    const sortedNodes = [...filteredNodes].sort((a, b) => a.x - b.x);
    const updatedEdges: WorkflowConnection[] = [];
    for (let i = 0; i < sortedNodes.length - 1; i++) {
      updatedEdges.push({
        id: `edge-${i}-${Date.now()}`,
        source: sortedNodes[i].id,
        target: sortedNodes[i+1].id
      });
    }

    setActiveWorkflow({
      ...activeWorkflow,
      nodes: filteredNodes,
      edges: updatedEdges,
      updatedAt: new Date().toISOString()
    });

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(filteredNodes.length > 0 ? filteredNodes[0].id : null);
    }
    showNotification('Stage removed from visual workflow');
  };

  // UPDATE ACTIVE NODE CONFIGS FROM INPUTS
  const handleUpdateNodeConfig = (updatedConfig: any) => {
    if (isObserver || !activeWorkflow || !selectedNodeId) return;

    const updatedNodes = activeWorkflow.nodes.map(n => {
      if (n.id === selectedNodeId) {
        return { ...n, config: { ...n.config, ...updatedConfig } };
      }
      return n;
    });

    setActiveWorkflow({
      ...activeWorkflow,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString()
    });
  };

  // PROPAGATE AND CRITICAL SAVE TO CLOUD CORE STORAGE (Bridge to active databases!)
  const handleSaveAll = async () => {
    if (isObserver || !activeWorkflow) return;

    // Verify all nodes are connected and robust
    const validationErrors: string[] = [];
    if (activeWorkflow.nodes.length === 0) {
      validationErrors.push('Workflow needs at least one operational module.');
    }

    // Check we have prompt template node mapped
    const tmNode = activeWorkflow.nodes.find(n => n.type === 'template');
    if (tmNode && !tmNode.config.templateId) {
      validationErrors.push('Prompt Template selection is unmapped. Assign a valid template.');
    }

    // Check POD blueprint is assigned if node exists
    const podNodeCheck = activeWorkflow.nodes.find(n => n.type === 'pod');
    if (podNodeCheck && !podNodeCheck.config.productUid) {
      validationErrors.push('POD Dispatch Node contains empty Print blueprint SKU reference.');
    }

    if (validationErrors.length > 0) {
      alert(`Validation Warning:\n\n${validationErrors.join('\n')}`);
      return;
    }

    // Critical Step: Propagate visual node configurations directly into our database mock collections
    // This allows visual adjustments to instantaneously drive the simulation pipeline!
    
    try {
      // A. Propagate template bind
      if (tmNode) {
        const allProds = await appServices.products.getProducts();
        const pIdx = allProds.findIndex(p => p.id === selectedProductId);
        if (pIdx !== -1) {
          allProds[pIdx].activeTemplateId = tmNode.config.templateId;
          await appServices.products.saveProducts(allProds);
        }
      }

      // B. Propagate generation settings
      const genNode = activeWorkflow.nodes.find(n => n.type === 'generation');
      if (genNode) {
        const allGens = await appServices.settings.getGenConfigs();
        const gConfig = {
          productId: selectedProductId,
          numInitiallyGenerated: Number(genNode.config.numInitiallyGenerated || 3),
          imageFormat: genNode.config.imageFormat || 'png',
          imageQuality: genNode.config.imageQuality || 'standard',
          primaryProvider: genNode.config.primaryProvider || 'OpenAI',
          primaryModel: genNode.config.primaryModel || 'dall-e-3',
          primarySecretRef: genNode.config.primarySecretRef || 'SECRET_REF_DEFAULT',
          fallbackProvider: genNode.config.fallbackProvider || 'Gemini',
          fallbackModel: genNode.config.fallbackModel || 'imagen-3.0-generate-002',
          fallbackLLM: genNode.config.fallbackLLM || 'gemini-1.5-pro',
          fallbackSecretRef: genNode.config.fallbackSecretRef || 'SECRET_REF_DEFAULT_FALLBACK'
        };
        const gIdx = allGens.findIndex(g => g.productId === selectedProductId);
        if (gIdx !== -1) {
          allGens[gIdx] = gConfig;
        } else {
          allGens.push(gConfig);
        }
        await appServices.settings.saveGenConfigs(allGens);
      }

      // C. Propagate Quality gate configs
      const qaNode = activeWorkflow.nodes.find(n => n.type === 'quality_gate');
      if (qaNode) {
        const allQas = await appServices.settings.getQualityConfigs();
        const qConfig = {
          productId: selectedProductId,
          llmProvider: qaNode.config.llmProvider || 'Gemini',
          model: qaNode.config.model || 'gemini-2.5-pro',
          secretRef: qaNode.config.secretRef || 'SECRET_REF_GEMINI_QA',
          fallbackProvider: 'OpenAI' as const,
          fallbackModel: 'gpt-4o',
          fallbackSecretRef: 'SECRET_REF_GPT_QA_FALLBACK',
          qaPrompt: qaNode.config.qaPrompt || 'Inspect and review candidate...',
          referenceImages: [],
          faultTolerance: 'medium' as const,
          minAcceptanceScore: Number(qaNode.config.minAcceptanceScore || 80),
          maxRejectedBeforeEscalation: Number(qaNode.config.maxRejectedBeforeEscalation || 3),
          escalationEmailTemplate: 'Subject: Escalation for order {{order_number}}'
        };
        const qIdx = allQas.findIndex(q => q.productId === selectedProductId);
        if (qIdx !== -1) {
          allQas[qIdx] = qConfig;
        } else {
          allQas.push(qConfig);
        }
        await appServices.settings.saveQualityConfigs(allQas);
      }

      // D. Propagate Personalization details
      const pcNode = activeWorkflow.nodes.find(n => n.type === 'personalization');
      if (pcNode) {
        const pConfig = {
          name: pcNode.config.name || 'FuFire API',
          baseUrl: pcNode.config.baseUrl || 'https://api.fufire.space',
          apiKeySecretRef: pcNode.config.apiKeySecretRef || 'SECRET_REF_FUFIRE',
          enabled: true,
          endpointPaths: {
            chronometryResolve: '/v1/chronometry/resolve',
            bazi: '/v1/calculate/bazi',
            baziTrace: '/v1/calculate/bazi/trace',
            wuxing: '/v1/calculate/wuxing'
          },
          defaultStandard: 'CIVIL',
          defaultBoundary: 'midnight',
          ambiguousTimePolicy: 'earlier',
          nonexistentTimePolicy: 'error',
          timeoutMs: 10000,
          retryCount: 3,
          healthStatus: 'unknown'
        } as any;
        await appServices.settings.savePersonalizationConfig(pConfig);
      }

      // E. Propagate POD dispatch params
      const podNode = activeWorkflow.nodes.find(n => n.type === 'pod');
      if (podNode) {
        const allPod = await appServices.settings.getPodConfig();
        const updatedPod = {
          ...allPod,
          name: podNode.config.name || 'Gelato',
          baseUrl: podNode.config.baseUrl || 'https://api.gelato.com',
          secretRef: podNode.config.secretRef || 'SECRET_REF_GELATO',
          dispatchMode: podNode.config.dispatchMode || 'draft',
          productUidMappings: {
            ...allPod.productUidMappings,
            [selectedProductId]: podNode.config.productUid || 'gelato-fallback-canvas'
          }
        };
        await appServices.settings.savePodConfig(updatedPod);
      }

      // F. Persist visual schematic itself
      await appServices.workflows.saveVisualWorkflow(selectedProductId, activeWorkflow);
      showNotification('Visual pipeline states deployed & mapped to Core API Services');
      
      // Broadcast updates to rest of console context
      window.dispatchEvent(new Event('bazzi_role_changed'));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // REST RESET PRESETS
  const resetToPresetSequential = async () => {
    if (isObserver || !activeWorkflow) return;
    if (window.confirm('Reset this product’s visual grid to the standard 5-step serial pipeline?')) {
      try {
        const defaults = await appServices.workflows.getVisualWorkflow('prod-001'); // prod-001 is the standard 5 step preset
        const configured = {
          ...defaults,
          productId: selectedProductId,
          updatedAt: new Date().toISOString()
        };
        setActiveWorkflow(configured);
        if (configured.nodes.length > 0) {
          setSelectedNodeId(configured.nodes[0].id);
        }
        showNotification('Reverted to sequential print workflow preset.');
      } catch (e) {
        console.error(e);
      }
    }
  };

  // HELPER FOR ICON RENDER
  const getNodeIcon = (type: WorkflowNode['type']) => {
    switch (type) {
      case 'personalization': return <Zap className="w-5 h-5 text-ac" />;
      case 'template': return <FileText className="w-5 h-5 text-ac" />;
      case 'generation': return <ImageIcon className="w-5 h-5 text-ac" />;
      case 'quality_gate': return <ShieldCheck className="w-5 h-5 text-ac" />;
      case 'pod': return <Printer className="w-5 h-5 text-ac" />;
    }
  };

  const getProductTitleOfCurrentId = () => {
    return products.find(p => p.id === selectedProductId)?.title || 'Loading...';
  };

  return (
    <div className="space-y-6 animate-fade-in text-da" id="workflow-builder-view-root">
      
      {/* Toast Alert */}
      {notification && (
        <div className="fixed bottom-4 right-4 bg-b2 border border-nt text-da px-4 py-3 rounded-sm shadow-sm flex items-center gap-2.5 z-50">
          <span className="w-1.5 h-1.5 rounded-full bg-ac animate-pulse"></span>
          <span className="text-[10px] font-mono uppercase tracking-wider font-bold">{notification}</span>
        </div>
      )}

      {/* View Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-nt pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-da">Visual Workflow Control Board</h1>
          <p className="text-xs text-nt mt-1">Design, construct, and drag pipeline nodes to synchronize print-on-demand variants with LLM Quality Gates</p>
        </div>
        
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[10px] font-mono font-bold text-nt uppercase">ACTIVE CONFIG MATRIX:</span>
          <select
            value={selectedProductId}
            onChange={(e) => handleProductChange(e.target.value)}
            className="border border-nt bg-b1 rounded-sm p-1.5 text-xs text-da outline-none font-mono font-bold font-semibold"
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.title.length > 28 ? p.title.substring(0, 28) + '...' : p.title} ({p.shopProvider})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Observer Block warning banner */}
      {isObserver && (
        <div className="bg-b1 border border-ac text-ac p-4 rounded-sm text-xs leading-normal flex items-start gap-2.5 shadow-xs font-mono">
          <AlertTriangle className="w-4 h-4 text-ac shrink-0 mt-0.5" />
          <div>
            <strong>Observer Authorization Check:</strong> You have read-only permissions for visual schematics. You can select stages to inspect variables and template paths, but dragging, node appending, deleting, and deployments are strictly suspended.
          </div>
        </div>
      )}

      {/* Main layout splitted into Sidebar Node list, Interactive Canvas, and Settings drawer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* COL 1: Stages Drawer Panel (Draggable Items) */}
        {!isObserver ? (
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-b1 border border-nt p-4 rounded-sm space-y-3.5">
              <div>
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-nt">Available Stages</h3>
                <p className="text-[10px] text-nt leading-normal">Drag nodes onto the canvas grid coordinate space to append layers:</p>
              </div>

              <div className="space-y-2">
                {[
                  { type: 'personalization', label: 'Personalization API', desc: 'Queries birth alignments' },
                  { type: 'template', label: 'Prompt Template', desc: 'Prepares astro Liquid text' },
                  { type: 'generation', label: 'Image Generation', desc: 'Initializes image swarms' },
                  { type: 'quality_gate', label: 'Quality Gate 1', desc: 'Vision LLM screening score' },
                  { type: 'pod', label: 'POD Integration', desc: 'Dispatches finalized canvas' }
                ].map(item => (
                  <div
                    key={item.type}
                    draggable={!isObserver}
                    onDragStart={(e) => handleSidebarDragStart(e, item.type)}
                    className="p-3 bg-b1 hover:bg-b2 border border-nt rounded-sm flex items-center gap-2.5 cursor-grab active:cursor-grabbing transition text-left select-none group"
                  >
                    <div className="p-1 px-1.5 bg-b1 border border-nt rounded-sm">
                      {getNodeIcon(item.type as any)}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold font-sans text-da uppercase tracking-tight group-hover:text-ac transition-colors">{item.label}</div>
                      <div className="text-[9px] text-nt font-mono mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-nt pt-3">
                <button
                  onClick={resetToPresetSequential}
                  className="w-full text-center py-1.5 border border-nt hover:bg-b1 text-[9px] font-bold font-mono tracking-wider uppercase rounded-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-nt" /> Sequential Preset
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-b1 border border-nt p-4 rounded-sm space-y-3 font-mono text-[10px] text-nt">
              <span className="font-bold text-nt uppercase block tracking-wider">Active Stage Path</span>
              <p className="leading-snug">Each column represents a sequential execution step running left-to-right on incoming webhooks.</p>
              <div className="p-2 border border-ac bg-b1/10 text-ac rounded-sm">
                Automatic connectors calculate relative coordinates instantly.
              </div>
            </div>
          </div>
        )}

        {/* COL 2: Drag and drop Canvas */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-b1 border border-nt rounded-sm flex flex-col overflow-hidden relative shadow-xs">
            {/* Canvas Header bar */}
            <div className="p-3 bg-b1 border-b border-nt flex items-center justify-between text-xs font-mono font-bold select-none">
              <div className="flex items-center gap-2 text-[10px]">
                <Sparkles className="w-3.5 h-3.5 text-ac" />
                <span className="uppercase text-nt">Product Mesh Grid Context:</span>
                <span className="bg-ac text-ac py-0.2 px-1 border border-ac uppercase font-black tracking-wide text-[9px]">{selectedProductId}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[9px] text-nt">Node Elements: {activeWorkflow?.nodes.length || 0}</span>
                {!isObserver && (
                  <button
                    onClick={handleSaveAll}
                    className="bg-b2 hover:opacity-90 border border-da text-da text-[9.5px] font-mono font-black py-1 px-3.5 rounded-sm flex items-center gap-1 cursor-pointer uppercase tracking-wider"
                  >
                    <Save className="w-3.5 h-3.5 text-ac" /> Save & Deploy Live
                  </button>
                )}
              </div>
            </div>

            {/* Drag & Drop Visual Canvas Space */}
            <div
              ref={canvasRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleCanvasDrop}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              className="bg-b1 h-[480px] w-full relative overflow-hidden select-none cursor-default custom-scrollbar"
              style={{
                backgroundImage: 'radial-gradient(#d1d1cf 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}
            >
              {/* Connection Lines (SVG) */}
              {activeWorkflow && activeWorkflow.nodes.length > 1 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                  <defs>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
                    </marker>
                    <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>

                  {/* Draw beautiful Bezier lines between consecutive sorted nodes */}
                  {[...activeWorkflow.nodes]
                    .sort((a, b) => a.x - b.x)
                    .map((node, index, sortedList) => {
                      if (index === sortedList.length - 1) return null;
                      const nextNode = sortedList[index + 1];
                      
                      // Node boxes are roughly 200px wide, 70px high
                      const startX = node.x + 200;
                      const startY = node.y + 35;
                      const endX = nextNode.x;
                      const endY = nextNode.y + 35;

                      // Control points for a smooth cubic bezier S-curve
                      const controlOffset = Math.abs(endX - startX) * 0.4;
                      const cp1X = startX + controlOffset;
                      const cp1Y = startY;
                      const cp2X = endX - controlOffset;
                      const cp2Y = endY;

                      return (
                        <g key={`edge-path-${node.id}-${nextNode.id}`}>
                          <path
                            d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                            stroke="url(#flowGrad)"
                            strokeWidth="2.5"
                            fill="none"
                            markerEnd="url(#arrow)"
                          />
                          {/* Pulsing indicator traveling along path */}
                          <circle r="4" fill="#3b82f6" opacity="0.8">
                            <animateMotion
                              path={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                              dur="3s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        </g>
                      );
                    })}
                </svg>
              )}

              {/* Node Card Elements */}
              {activeWorkflow?.nodes.map((node, index) => {
                const isSelected = selectedNodeId === node.id;
                
                return (
                  <div
                    key={node.id}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                    }}
                    className={`absolute w-[210px] bg-b1 border rounded-sm p-3.5 space-y-2 z-10 select-none shadow-sm cursor-grab active:cursor-grabbing hover:border-ac hover:shadow-md transition-all ${
                      isSelected 
                        ? 'border-ac ring-1 ring-blue-400 border-l-4 border-l-blue-600' 
                        : 'border-nt'
                    }`}
                    style={{ left: `${node.x}px`, top: `${node.y}px` }}
                  >
                    {/* Visual Node Pin Header */}
                    <div className="flex items-center justify-between pointer-events-none">
                      <span className="text-[8.5px] font-black uppercase text-ac tracking-widest font-mono bg-b1 border border-ac px-1 rounded-sm leading-none">
                        STAGE {index + 1}
                      </span>
                      <span className="text-[10px] font-mono text-nt font-bold">X: {Math.round(node.x)}</span>
                    </div>

                    <div className="flex items-start gap-2.5 pointer-events-none pt-1">
                      <div className="p-1 px-1.5 bg-b1 border border-nt rounded-sm shrink-0 mt-0.5">
                        {getNodeIcon(node.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[11.5px] font-bold text-da tracking-tight truncate leading-none uppercase font-mono">{node.title}</h4>
                        <p className="text-[9.5px] text-nt leading-normal mt-1 line-clamp-2">{node.description}</p>
                      </div>
                    </div>

                    {/* Node Footer metrics link / Actions */}
                    <div className="flex items-center justify-between border-t border-nt pt-2 mt-1">
                      <div className="text-[8px] text-nt font-mono flex items-center leading-none">
                        {node.type === 'template' && (
                          <span className="text-[8.5px] bg-ac text-ac border border-ac px-1.5 rounded-sm uppercase font-bold truncate max-w-[130px]">
                            TMP: {node.config.templateId || 'Unassigned'}
                          </span>
                        )}
                        {node.type === 'generation' && (
                          <span className="text-[8.5px] bg-b1 text-ac border border-ac px-1.5 rounded-sm uppercase font-bold">
                            Iter Swarm: {node.config.numInitiallyGenerated || '3'}
                          </span>
                        )}
                        {node.type === 'quality_gate' && (
                          <span className="text-[8.5px] bg-b1 text-ac border border-ac px-1.5 rounded-sm uppercase font-bold">
                            Score &gt;={node.config.minAcceptanceScore || '80'}
                          </span>
                        )}
                        {node.type === 'personalization' && (
                          <span className="text-[8.5px] bg-b1 text-ac border border-ac px-1.5 rounded-sm uppercase font-bold">
                            API: {node.config.name ? node.config.name.substring(0,8) : 'FuFire'}
                          </span>
                        )}
                        {node.type === 'pod' && (
                          <span className="text-[8.5px] bg-ac text-ac border border-ac px-1.5 rounded-sm uppercase font-bold truncate max-w-[130px]">
                            SKU: {node.config.productUid || 'Missing'}
                          </span>
                        )}
                      </div>

                      {!isObserver && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          className="text-nt hover:text-ac p-0.5 rounded hover:bg-b1 transition cursor-pointer"
                          title="Remove Stage"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Empty state instruction on blank canvas */}
              {activeWorkflow?.nodes.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-nt pointer-events-none select-none">
                  <Move className="w-8 h-8 text-nt stroke-[1.2] animate-bounce duration-500 mb-2" />
                  <span className="text-xs font-mono font-bold uppercase text-nt">Mesh Canvas Unpopulated</span>
                  <span className="p-3 text-[11px] max-w-sm leading-relaxed block text-nt">
                    Use the left panel to drag staging adapters onto the grid, or click "Sequential Preset" to load a default flow state.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COL 3: Properties Drawer (Configuration of selected node) */}
        <div className="xl:col-span-3">
          <div className="bg-b1 border border-nt rounded-sm p-4 space-y-4 shadow-xs min-h-[400px]">
            <div className="border-b border-nt pb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-da font-mono flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-nt animate-spin-slow" />
                Stage variables
              </h3>
              {activeNode && (
                <span className="text-[8px] bg-b2 text-nt font-mono py-0.2 px-1 rounded">
                  {activeNode.type.toUpperCase()}
                </span>
              )}
            </div>

            {activeNode ? (
              <div className="space-y-4 animate-fade-in text-xs font-sans text-da">
                {/* Visual Label */}
                <div>
                  <label className="block text-[10px] font-bold text-nt uppercase font-mono">Stage Visual Label</label>
                  <input
                    type="text"
                    disabled={isObserver}
                    value={activeNode.title}
                    onChange={(e) => {
                      if (activeWorkflow) {
                        const nextNodes = activeWorkflow.nodes.map(n => n.id === activeNode.id ? { ...n, title: e.target.value } : n);
                        setActiveWorkflow({ ...activeWorkflow, nodes: nextNodes });
                      }
                    }}
                    className="mt-1 w-full border border-nt bg-b1 rounded-sm p-2 outline-none text-xs font-sans text-da"
                  />
                </div>

                {/* Desc */}
                <div>
                  <label className="block text-[10px] font-bold text-nt uppercase font-mono">Visual Subtitle</label>
                  <input
                    type="text"
                    disabled={isObserver}
                    value={activeNode.description}
                    onChange={(e) => {
                      if (activeWorkflow) {
                        const nextNodes = activeWorkflow.nodes.map(n => n.id === activeNode.id ? { ...n, description: e.target.value } : n);
                        setActiveWorkflow({ ...activeWorkflow, nodes: nextNodes });
                      }
                    }}
                    className="mt-1 w-full border border-nt bg-b1 rounded-sm p-2 outline-none text-xs text-da"
                  />
                </div>

                {/* NODE SPECIFIC PROPERTY CONFIGURATOR FIELDS (MOCKED & INTEGRATED) */}
                <div className="border-t border-nt pt-3.5 space-y-4">
                  <div className="text-[10px] font-mono font-bold text-nt uppercase block tracking-wider">Configure properties</div>
                  
                  {/* Category A: Prompt Template Node configs */}
                  {activeNode.type === 'template' && (
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt">Prompt Template Binder</label>
                        <select
                          disabled={isObserver}
                          value={activeNode.config.templateId || ''}
                          onChange={(e) => handleUpdateNodeConfig({ templateId: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 rounded-sm p-2 outline-none font-mono text-nt font-bold"
                        >
                          <option value="">-- Choose active astro prompt --</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} (v{t.version})
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="p-3 bg-b1/5 border border-ac/50 rounded-sm text-[10px] text-ac leading-normal font-mono">
                        <strong>Pipeline Variable Injector:</strong> Mapped templates receive dynamic tokens (<code>{"{{fufire.animal}}"}, {"{{personalization.birth_place}}"}</code>) when orders materialize.
                      </div>

                      <div className="text-[10px] text-nt font-mono">
                        <span className="font-bold">Backend Trigger:</span><br />
                        <code className="text-nt block bg-b1 p-1 border rounded text-[9.5px] mt-1">
                          TODO: REST POST /api/v1/compile-template
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Category B: Image generation configs */}
                  {activeNode.type === 'generation' && (
                    <div className="space-y-3.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[9px] font-black font-mono text-nt uppercase">Swarm size</label>
                          <input
                            type="number"
                            min={1}
                            max={6}
                            disabled={isObserver}
                            value={activeNode.config.numInitiallyGenerated || 3}
                            onChange={(e) => handleUpdateNodeConfig({ numInitiallyGenerated: Number(e.target.value) })}
                            className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 text-center font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-black font-mono text-nt uppercase">File Format</label>
                          <select
                            disabled={isObserver}
                            value={activeNode.config.imageFormat || 'png'}
                            onChange={(e) => handleUpdateNodeConfig({ imageFormat: e.target.value })}
                            className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 font-mono"
                          >
                            <option value="png">PNG (Lossless)</option>
                            <option value="jpeg">JPEG</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black font-mono text-nt uppercase">Primary AI Provider</label>
                        <select
                          disabled={isObserver}
                          value={activeNode.config.primaryProvider || 'Gemini'}
                          onChange={(e) => handleUpdateNodeConfig({ primaryProvider: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                        >
                          <option value="Gemini">Gemini (Imagen 3)</option>
                          <option value="OpenAI">OpenAI (DALL-E 3)</option>
                          <option value="Stability">Stability SDXL</option>
                          <option value="Midjourney">Midjourney v6</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black font-mono text-nt uppercase">Primary Engine Model</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.primaryModel || ''}
                          onChange={(e) => handleUpdateNodeConfig({ primaryModel: e.target.value })}
                          placeholder="e.g. dall-e-3"
                          className="mt-1 w-full border border-nt bg-b1 p-1.5 font-mono"
                        />
                      </div>

                      <div className="pt-2">
                        <label className="block text-[9px] font-black font-mono text-nt uppercase">API Credentials Reference</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.primarySecretRef || ''}
                          onChange={(e) => handleUpdateNodeConfig({ primarySecretRef: e.target.value })}
                          placeholder="SECRET_REF_OPENAI_MAIN"
                          className="mt-1 w-full border border-ac bg-ac/10 p-1.5 font-mono text-ac font-bold"
                        />
                      </div>

                      <div className="text-[10px] text-nt font-mono">
                        <span className="font-bold">Backend Trigger:</span><br />
                        <code className="text-nt block bg-b1 p-1 border rounded text-[9.5px] mt-1 whitespace-pre-wrap">
                          TODO: REST POST /api/v1/generate-swarm
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Category C: Quality Gate 1 evaluation */}
                  {activeNode.type === 'quality_gate' && (
                    <div className="space-y-3.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[9px] font-black font-mono text-nt uppercase">Min Score (10-100)</label>
                          <input
                            type="number"
                            min={10}
                            max={100}
                            disabled={isObserver}
                            value={activeNode.config.minAcceptanceScore || 80}
                            onChange={(e) => handleUpdateNodeConfig({ minAcceptanceScore: Number(e.target.value) })}
                            className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 text-center font-bold font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-black font-mono text-nt uppercase">Max iterations</label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            disabled={isObserver}
                            value={activeNode.config.maxRejectedBeforeEscalation || 3}
                            onChange={(e) => handleUpdateNodeConfig({ maxRejectedBeforeEscalation: Number(e.target.value) })}
                            className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 text-center font-bold font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black font-mono text-nt uppercase">LLM Vision Provider</label>
                        <select
                          disabled={isObserver}
                          value={activeNode.config.llmProvider || 'Gemini'}
                          onChange={(e) => handleUpdateNodeConfig({ llmProvider: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                        >
                          <option value="Gemini">Gemini Vision (Pro)</option>
                          <option value="OpenAI">OpenAI GPT-4o</option>
                          <option value="Claude">Claude 3.5 Sonnet</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black font-mono text-nt uppercase">Evaluation Instructions / Prompt</label>
                        <textarea
                          disabled={isObserver}
                          rows={3}
                          value={activeNode.config.qaPrompt || ''}
                          onChange={(e) => handleUpdateNodeConfig({ qaPrompt: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 rounded-sm p-2 outline-none font-mono text-[10.5px] leading-normal"
                          placeholder="Rule parameters here..."
                        />
                      </div>

                      <div className="text-[10px] text-nt font-mono">
                        <span className="font-bold">Backend Trigger:</span><br />
                        <code className="text-nt block bg-b1 p-1 border rounded text-[9.5px] mt-1 whitespace-pre-wrap">
                          TODO: REST POST /api/v1/qa-evaluation
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Category D: Personalization webhook configurations */}
                  {activeNode.type === 'personalization' && (
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt uppercase">Adapter Name</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.name || ''}
                          onChange={(e) => handleUpdateNodeConfig({ name: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 p-2 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt uppercase">webhook Endpoint URL</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.apiUrl || ''}
                          onChange={(e) => handleUpdateNodeConfig({ apiUrl: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 p-2 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt uppercase">API credentials Token Ref</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.secretRef || ''}
                          onChange={(e) => handleUpdateNodeConfig({ secretRef: e.target.value })}
                          className="mt-1 w-full border border-nt bg-ac/10 text-ac font-bold p-2 font-mono"
                        />
                      </div>

                      <div className="text-[10px] text-nt font-mono">
                        <span className="font-bold">Backend Trigger:</span><br />
                        <code className="text-nt block bg-b1 p-1 border rounded text-[9.5px] mt-1 whitespace-pre-wrap">
                          TODO: Fetch payload webhook and bind to astroglyphs system logic (CJS/ESM proxy integration)
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Category E: POD integrations config */}
                  {activeNode.type === 'pod' && (
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt uppercase">Fulfillment vendor</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.name || ''}
                          onChange={(e) => handleUpdateNodeConfig({ name: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 p-2 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt uppercase">Target BluePrint code / SKU</label>
                        <input
                          type="text"
                          disabled={isObserver}
                          value={activeNode.config.productUid || ''}
                          onChange={(e) => handleUpdateNodeConfig({ productUid: e.target.value })}
                          placeholder="canvas-40x50-vintage"
                          className="mt-1 w-full border border-nt bg-b1 p-2 font-mono text-ac font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[9.5px] font-bold font-mono text-nt uppercase">API Dispatch mode</label>
                        <select
                          disabled={isObserver}
                          value={activeNode.config.dispatchMode || 'draft'}
                          onChange={(e) => handleUpdateNodeConfig({ dispatchMode: e.target.value })}
                          className="mt-1 w-full border border-nt bg-b1 rounded-sm p-1.5 outline-none font-mono"
                        >
                          <option value="draft">Draft Order Queue (Review before print)</option>
                          <option value="order">Full AutoSubmit (Direct Production)</option>
                        </select>
                      </div>

                      <div className="text-[10px] text-nt font-mono">
                        <span className="font-bold">Backend Trigger:</span><br />
                        <code className="text-nt block bg-b1 p-1 border rounded text-[9.5px] mt-1 whitespace-pre-wrap">
                          TODO: REST POST /api/v1/pod/dispatch
                        </code>
                      </div>
                    </div>
                  )}
                </div>

                {/* DB Table alignment info for RBAC compliance */}
                <div className="bg-b1 border border-nt rounded-sm p-3.5 text-[9.5px] text-da space-y-1 font-mono">
                  <div className="font-bold uppercase text-nt">Postgres Schema Maps</div>
                  <div>TABLE: <code>workflow_stages</code></div>
                  <div>POLICY: <code>auth.role() = 'Owner' OR 'Admin'</code></div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-nt font-mono text-[11px] leading-normal pt-24">
                <Info className="w-5 h-5 text-nt mx-auto mb-2" />
                Select any stage node inside the canvas to inspect and configure variables.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
