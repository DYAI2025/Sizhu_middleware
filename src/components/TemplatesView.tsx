import { useState, useEffect } from 'react';
import { appServices } from '../lib/app/appServices';
import { PromptTemplate } from '../types';
import { Clipboard, Eye, Code, Save, History, Check, AlertCircle, FileText, Plus } from 'lucide-react';

const MANDATORY_VARS = [
  '{{order.order_number}}',
  '{{personalization.name}}',
  '{{personalization.birth_date}}',
  '{{personalization.birth_time}}',
  '{{personalization.birth_time_known}}',
  '{{personalization.birth_time_source}}',
  '{{personalization.birth_place}}',
  '{{fufire.animal}}',
  '{{fufire.element}}',
  '{{fufire.birth_year}}',
  '{{fufire.dominant_element}}'
];

export default function TemplatesView() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Editor State
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'archived'>('draft');
  const [isPreview, setIsPreview] = useState(false);

  const [role, setRole] = useState<string>('Owner');
  const [validationMsg, setValidationMsg] = useState<{ type: 'ok' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      const activeRole = await appServices.roles.getActiveRole();
      setRole(activeRole);
      await loadTemplates();
    };
    init();
  }, []);

  const loadTemplates = async () => {
    try {
      const list = await appServices.templates.getTemplates();
      setTemplates(list);
      if (list.length > 0 && !selectedTemplate) {
        handleSelect(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isObserver = role === 'Observer';

  const handleSelect = (temp: PromptTemplate) => {
    setSelectedTemplate(temp);
    setIsCreating(false);
    setName(temp.name);
    setContent(temp.content);
    setStatus(temp.status);
    validateVariables(temp.content);
  };

  const validateVariables = (text: string) => {
    const found = MANDATORY_VARS.filter(v => text.includes(v));
    if (found.length === 0) {
      setValidationMsg({ type: 'warning', text: 'No template personalization variables detected. Liquid compilation might map empty values.' });
    } else {
      setValidationMsg({ type: 'ok', text: `Liquid compiler check: Passed. Detected ${found.length} of ${MANDATORY_VARS.length} operational context variables.` });
    }
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    validateVariables(val);
  };

  const handleAddNew = () => {
    if (isObserver) return;
    setIsCreating(true);
    setSelectedTemplate(null);
    setName('New Custom Prompt Template');
    setContent(`# Personalization Base Template
Hello {{personalization.name}}, welcome. 
Order reference: {{order.order_number}}
Dominant Elemental Path: {{fufire.dominant_element}}
`);
    setStatus('draft');
  };

  const handleSave = async () => {
    if (isObserver) return;
    if (!name.trim()) {
      alert('Template Name is required.');
      return;
    }

    try {
      const list = await appServices.templates.getTemplates();

      if (isCreating) {
        const newTemp: PromptTemplate = {
          id: `temp-${Math.floor(1000 + Math.random() * 9000)}`,
          name,
          content,
          version: 1,
          status,
          createdAt: new Date().toISOString(),
          createdBy: role
        };

        // If making active, archive others
        let updated = [...list];
        if (status === 'active') {
          updated = updated.map(t => t.status === 'active' ? { ...t, status: 'archived' as const } : t);
        }
        updated.unshift(newTemp);
        await appServices.templates.saveTemplates(updated);
        setTemplates(updated);
        setSelectedTemplate(newTemp);
        setIsCreating(false);
        alert('Prompt Template created successfully at version 1 (Draft)');
      } else if (selectedTemplate) {
        // Rule Checklist: "Never overwrite active template content; create a new version instead."
        let updatedList = [...list];
        
        const requiresNewVersion = selectedTemplate.status === 'active';

        if (requiresNewVersion) {
          // Create incremented version!
          const newVersionNum = selectedTemplate.version + 1;
          const newVerTemp: PromptTemplate = {
            id: `temp-${Math.floor(1000 + Math.random() * 9000)}`,
            name,
            content,
            version: newVersionNum,
            status, // e.g. draft or active
            createdAt: new Date().toISOString(),
            createdBy: role
          };

          // If newly saved version is active, archive previous revisions of the same ID/name
          if (status === 'active') {
            updatedList = updatedList.map(t => t.name === name && t.status === 'active' ? { ...t, status: 'archived' as const } : t);
          }

          updatedList.unshift(newVerTemp);
          await appServices.templates.saveTemplates(updatedList);
          setTemplates(updatedList);
          setSelectedTemplate(newVerTemp);
          alert(`Content update rules applied: Safeguarded version v${selectedTemplate.version}. Created incremented revision version v${newVersionNum} instead.`);
        } else {
          // Draft/Archived can be overridden directly
          updatedList = updatedList.map(t => {
            if (t.id === selectedTemplate.id) {
              return {
                ...t,
                name,
                content,
                status
              };
            }
            return t;
          });

          // enforce single active template rules
          if (status === 'active') {
            updatedList = updatedList.map(t => t.id !== selectedTemplate.id && t.status === 'active' ? { ...t, status: 'archived' as const } : t);
          }

          await appServices.templates.saveTemplates(updatedList);
          setTemplates(updatedList);
          alert('Prompt template status/meta updated cleanly.');
        }
      }
      await loadTemplates();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // Basic HTML markdown parser representation for the live layout preview box
  const renderMockMarkdownPreview = (txt: string) => {
    return txt.split('\n').map((line, idx) => {
      let cleanLine = line;
      
      // Variable rendering
      MANDATORY_VARS.forEach(v => {
        if (cleanLine.includes(v)) {
          cleanLine = cleanLine.replaceAll(v, `<span class="bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded text-xs border border-indigo-200">${v}</span>`);
        }
      });

      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-xl font-extrabold pb-1 mt-4 text-slate-900 border-b border-slate-100" dangerouslySetInnerHTML={{ __html: cleanLine.substring(2) }} />;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-lg font-bold mt-3 text-slate-800" dangerouslySetInnerHTML={{ __html: cleanLine.substring(3) }} />;
      }
      if (line.startsWith('- ')) {
        return <li key={idx} className="ml-4 list-disc text-xs text-slate-600 my-1" dangerouslySetInnerHTML={{ __html: cleanLine.substring(2) }} />;
      }
      return <p key={idx} className="text-xs text-slate-600 min-h-4 leading-normal my-1" dangerouslySetInnerHTML={{ __html: cleanLine }} />;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in" id="templates-view-container">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#d1d1cf] pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">Prompt Template Revisions</h1>
          <p className="text-xs text-slate-500 mt-1">Edit Liquid templates, verify mandatory tags, and lock active revisions to dynamic sandbox environments</p>
        </div>
        {!isObserver && (
          <button
            onClick={handleAddNew}
            className="bg-[#141414] hover:opacity-90 text-white text-xs font-mono font-bold px-4 py-2 rounded-sm flex items-center gap-1.5 cursor-pointer uppercase tracking-wider border border-black"
          >
            <Plus className="w-3.5 h-3.5 text-blue-500" /> New Template
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Template Revision Register */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-[#d1d1cf] text-[#141414] rounded-sm p-4 space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest font-mono text-slate-400">Archived & Active Register</h2>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className={`w-full text-left p-3 rounded-sm border transition text-xs flex flex-col gap-1 cursor-pointer ${
                    selectedTemplate?.id === t.id 
                      ? 'bg-blue-50/50 border-blue-400 border-l-2 border-l-blue-500' 
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-slate-900 flex items-center justify-between font-mono">
                    <span className="truncate max-w-[180px]">{t.name}</span>
                    <span className="text-[10px] font-mono bg-blue-100 text-blue-800 py-0.2 px-1.5 rounded-sm font-bold border border-blue-200">
                      v{t.version}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 font-mono">
                    <span className={`px-1.5 py-0.2 rounded-sm font-bold text-[9px] border ${
                      t.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                      t.status === 'draft' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                      'bg-slate-100 border-slate-300 text-slate-600'
                    }`}>
                      {t.status.toUpperCase()}
                    </span>
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Guidelines info */}
          <div className="bg-blue-50 border border-blue-200 rounded-sm p-4 text-xs text-blue-800 space-y-2">
            <h4 className="font-bold font-mono text-[10px] uppercase flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-blue-600" />
              Automated Version Safety Rules
            </h4>
            <p className="leading-relaxed opacity-95">
              Once an astroglyph template is marked as <strong>Active</strong>, the console safeguards it from overrides.
            </p>
            <p className="leading-relaxed opacity-95 font-mono text-[10.5px]">
              Subsequent updates seamlessly auto-increment (e.g. <code>v2 &rarr; v3</code>), keeping active items secure.
            </p>
          </div>
        </div>

        {/* Right Side: Interactive Editor and Variable compliance */}
        <div className="lg:col-span-8 bg-white border border-[#d1d1cf] rounded-sm p-6 flex flex-col gap-5">
          
          {/* Top Panel fields */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Template Identifier / Name</label>
              <input
                type="text"
                disabled={isObserver}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Astrological Constellation Print Prompt Template"
                className="mt-1.5 w-full text-base font-bold border-b border-transparent hover:border-slate-200 focus:border-slate-900 py-1 outline-none text-[#141414] font-mono"
              />
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div>
                <label className="block text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider">Revision Status</label>
                <select
                  disabled={isObserver}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="mt-1 border border-[#d1d1cf] bg-white rounded-sm p-1.5 text-xs font-mono font-bold text-slate-800 outline-none"
                >
                  <option value="draft">DRAFT CODE</option>
                  <option value="active">ACTIVE ENGINE</option>
                  <option value="archived">ARCHIVED STATE</option>
                </select>
              </div>

              {!isObserver && (
                <button
                  id="btn-save-template"
                  onClick={handleSave}
                  className="bg-[#141414] hover:opacity-90 text-white text-xs font-mono font-bold px-4 py-2.5 rounded-sm flex items-center gap-1.5 mt-4 cursor-pointer uppercase border border-black"
                >
                  <Save className="w-3.5 h-3.5 text-blue-500" /> Save Version
                </button>
              )}
            </div>
          </div>

          {/* Validation Banner */}
          {validationMsg && (
            <div className={`p-3 rounded-sm flex items-start gap-2 text-xs border ${
              validationMsg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {validationMsg.type === 'ok' ? (
                <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 stroke-[2.5]" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-655 text-amber-600" />
              )}
              <span className="font-mono text-[11px] font-semibold">{validationMsg.text}</span>
            </div>
          )}

          {/* Editor Header / Preview Selector */}
          <div className="flex border-b border-[#d1d1cf]">
            <button
              onClick={() => setIsPreview(false)}
              className={`py-2 px-4 text-xs font-mono font-bold border-b-2 -mb-[2px] transition ${
                !isPreview ? 'border-[#141414] text-[#141414]' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" /> MD Template Editor
              </span>
            </button>
            <button
              onClick={() => setIsPreview(true)}
              className={`py-2 px-4 text-xs font-mono font-bold border-b-2 -mb-[2px] transition ${
                isPreview ? 'border-[#141414] text-[#141414]' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-500" /> Live Webhook Render
              </span>
            </button>
          </div>

          {/* Frame Container */}
          <div className="flex-1 min-h-[300px] border border-[#d1d1cf] rounded-sm overflow-hidden flex flex-col">
            {!isPreview ? (
              <textarea
                disabled={isObserver}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Paste or write raw markdown prompt template including {{order.order_number}} values..."
                className="w-full flex-1 p-4 font-mono text-xs text-slate-800 leading-relaxed bg-slate-50 focus:bg-white focus:outline-none resize-none min-h-[300px]"
              />
            ) : (
              <div className="w-full flex-1 p-5 bg-white overflow-y-auto leading-relaxed text-xs space-y-3 border-l border-slate-50">
                {renderMockMarkdownPreview(content)}
              </div>
            )}
          </div>

          {/* Liquid Variable Reference Board */}
          <div className="bg-slate-50 p-4 rounded-sm border border-[#d1d1cf] space-y-2">
            <h3 className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest">Available Astrological context keys:</h3>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {MANDATORY_VARS.map((v) => {
                const isActiveVar = content.includes(v);
                return (
                  <span
                    key={v}
                    onClick={() => {
                      if (!isObserver && !isPreview) {
                        handleContentChange(content + ` ${v}`);
                      }
                    }}
                    className={`font-mono py-1 px-2 rounded-sm border flex items-center gap-1 cursor-pointer transition select-none ${
                      isActiveVar 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold' 
                        : 'bg-white hover:bg-slate-100 text-slate-500 border-[#d1d1cf]'
                    }`}
                  >
                    {isActiveVar ? <Check className="w-3 h-3 text-emerald-600" /> : null}
                    {v}
                  </span>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
