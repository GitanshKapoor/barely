'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Play, Globe, Smartphone, Monitor, Tablet, X, Info, Tag, ArrowRight, Loader2, Cpu, ChevronDown, Bell, Eye, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatModelName } from '../utils/models';

export interface RunConfigData {
  name?: string;
  url?: string;
  goalText?: string;
  context?: string;
  device?: string;
  strictMode?: boolean;
  useCache?: boolean;
  model?: string;
  tags?: string[];
  isolatedEnv?: boolean;
  createJiraTicket?: boolean;
  notificationChannel?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  supports_vision: boolean;
  recommended: boolean;
  context_window?: string;
  description?: string;
  is_default?: boolean;
  enabled?: boolean;
}

interface NewRunFormProps {
  initialData?: RunConfigData;
  triggerButton?: (open: (e?: React.MouseEvent) => void) => React.ReactNode;
  onRunCreated?: (jobId: string) => void;
}

const emptySubscribe = () => () => {};

export default function NewRunForm({ initialData, triggerButton, onRunCreated }: NewRunFormProps) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(initialData?.name || '');
  const [url, setUrl] = useState(initialData?.url || 'https://');
  const [goalText, setGoalText] = useState(initialData?.goalText || '');
  const [context, setContext] = useState(initialData?.context || '');
  const [device, setDevice] = useState(initialData?.device || 'desktop');
  const [strictMode, setStrictMode] = useState(Boolean(initialData?.strictMode));
  const [useCache, setUseCache] = useState(Boolean(initialData?.useCache));
  const [isolatedEnv, setIsolatedEnv] = useState(Boolean(initialData?.isolatedEnv));
  const [model, setModel] = useState(initialData?.model || '');
  const [defaultModelName, setDefaultModelName] = useState<string>('anthropic/claude-sonnet-4-5');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModelType, setSelectedModelType] = useState<string>('default');
  const [customModelSlug, setCustomModelSlug] = useState<string>('');
  const [isK8sAvailable, setIsK8sAvailable] = useState<boolean>(false);
  const [autoNavigate, setAutoNavigate] = useState(false);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [toast, setToast] = useState<{ id: string; name: string } | null>(null);

  // Enterprise Integrations (Jira, Slack, Teams)
  const [jiraConfigured, setJiraConfigured] = useState(false);
  const [jiraProjectKey, setJiraProjectKey] = useState('QA');
  const [jiraAutoCreateDefault, setJiraAutoCreateDefault] = useState(false);
  const [createJiraTicket, setCreateJiraTicket] = useState(Boolean(initialData?.createJiraTicket));
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [teamsConfigured, setTeamsConfigured] = useState(false);
  const [defaultNotificationMechanism, setDefaultNotificationMechanism] = useState<string>('both');
  const [notificationChannel, setNotificationChannel] = useState<string>(initialData?.notificationChannel || 'default');

  const router = useRouter();

  useEffect(() => {
    const fetchConfiguration = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        
        // Fetch supported models
        const res = await fetch(`${apiUrl}/api/models`);
        if (res.ok) {
          const data = await res.json();
          if (data.default_model) setDefaultModelName(data.default_model);
          if (data.models && Array.isArray(data.models)) {
            setAvailableModels(data.models);
          }
        }

        // Fetch execution engine status
        const engineRes = await fetch(`${apiUrl}/api/execution-engine`);
        if (engineRes.ok) {
          const engData = await engineRes.json();
          setIsK8sAvailable(Boolean(engData.is_k8s_available));
          if (engData.mode === 'k8s_job' && !initialData) {
            setIsolatedEnv(true);
          }
        }

        // Fetch enterprise integrations configuration
        const intgRes = await fetch(`${apiUrl}/api/integrations`);
        if (intgRes.ok) {
          const intgData = await intgRes.json();
          const intg = intgData.integrations;
          if (intg?.jira) {
            setJiraConfigured(Boolean(intg.jira.configured));
            setJiraProjectKey(intg.jira.project_key || 'QA');
            const autoCreate = Boolean(intg.jira.auto_create);
            setJiraAutoCreateDefault(autoCreate);
            if (initialData?.createJiraTicket === undefined) {
              setCreateJiraTicket(autoCreate);
            }
          }
          if (intg?.slack) {
            setSlackConfigured(Boolean(intg.slack.configured));
          }
          if (intg?.teams) {
            setTeamsConfigured(Boolean(intg.teams.configured));
          }
          if (intg?.default_notification_mechanism) {
            setDefaultNotificationMechanism(intg.default_notification_mechanism);
          }
        }
      } catch {
        // silent fallback
      }
    };
    fetchConfiguration();
  }, [initialData]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const addTag = (rawTag: string) => {
    const cleaned = rawTag.trim().replace(/^#+/, '').toLowerCase();
    if (cleaned && !tags.includes(cleaned)) {
      setTags(prev => [...prev, cleaned]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
        setTagInput('');
      }
    }
  };

  const handleModelSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedModelType(val);
    if (val === 'default') {
      setModel('');
    } else if (val === 'custom') {
      setModel(customModelSlug.trim());
    } else {
      setModel(val);
    }
  };

  const handleCustomModelChange = (val: string) => {
    setCustomModelSlug(val);
    setModel(val.trim());
  };

  const openModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (initialData) {
      setName(initialData.name || '');
      setUrl(initialData.url || 'https://');
      setGoalText(initialData.goalText || '');
      setContext(initialData.context || '');
      setDevice(initialData.device || 'desktop');
      setStrictMode(Boolean(initialData.strictMode));
      setUseCache(Boolean(initialData.useCache));
      setIsolatedEnv(isK8sAvailable ? Boolean(initialData.isolatedEnv) : false);
      setModel(initialData.model || '');
      if (initialData.model) {
        const found = availableModels.some(m => m.id === initialData.model);
        if (found) {
          setSelectedModelType(initialData.model);
          setCustomModelSlug('');
        } else {
          setSelectedModelType('custom');
          setCustomModelSlug(initialData.model);
        }
      } else {
        setSelectedModelType('default');
        setCustomModelSlug('');
      }
      setTags(initialData.tags || []);
      setTagInput('');
      if (initialData.createJiraTicket !== undefined) {
        setCreateJiraTicket(Boolean(initialData.createJiraTicket));
      }
      if (initialData.notificationChannel) {
        setNotificationChannel(initialData.notificationChannel);
      }
    } else {
      setName('');
      setUrl('https://');
      setGoalText('');
      setContext('');
      setDevice('desktop');
      setStrictMode(false);
      setUseCache(false);
      setIsolatedEnv(isK8sAvailable);
      setModel('');
      setSelectedModelType('default');
      setCustomModelSlug('');
      setTags([]);
      setTagInput('');
      setNotificationChannel('default');
      setCreateJiraTicket(jiraAutoCreateDefault);
    }
    setIsOpen(true);
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          url, 
          goal_text: goalText, 
          context: context.trim() || undefined,
          device,
          strict_mode: strictMode,
          use_cache: useCache,
          model: model.trim() || undefined,
          tags,
          isolated_env: isK8sAvailable ? isolatedEnv : false,
          create_jira_ticket: createJiraTicket,
          notification_channel: notificationChannel
        })
      });
      if (res.ok) {
        const data = await res.json();
        const createdJobId = data.job_id;

        if (onRunCreated && createdJobId) {
          onRunCreated(createdJobId);
        }

        if (autoNavigate && createdJobId) {
          setTransitioning(true);
          setTimeout(() => {
            setIsOpen(false);
            setTransitioning(false);
            router.push(`/runs/${createdJobId}`);
          }, 450);
        } else {
          setIsOpen(false);
          const currentTestName = name || 'Automated E2E Test';
          if (!initialData) {
            setName(''); setUrl('https://'); setGoalText(''); setDevice('desktop'); setStrictMode(false); setUseCache(false); setModel(''); setSelectedModelType('default'); setCustomModelSlug(''); setTags([]); setTagInput('');
          }
          if (createdJobId) {
            setToast({
              id: createdJobId,
              name: currentTestName
            });
            setTimeout(() => {
              setToast((curr) => (curr?.id === createdJobId ? null : curr));
            }, 8000);
          }
        }
      } else {
        alert('Failed to queue the test. Check API logs.');
      }
    } catch {
      alert('Error connecting to the API. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  const devices = [
    { id: 'desktop', label: 'Desktop', icon: Monitor, desc: '1280x720' },
    { id: 'tablet',  label: 'Tablet',  icon: Tablet,  desc: '768x1024' },
    { id: 'ios',     label: 'iOS',     icon: Smartphone, desc: 'iPhone 15' },
    { id: 'android', label: 'Android', icon: Smartphone, desc: 'Pixel 7' },
  ];

  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 text-left whitespace-normal select-auto overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <form 
        onSubmit={handleRun} 
        className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-left whitespace-normal relative my-auto animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Pinned Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-[#0d1322] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0278ff]/10 border border-[#0278ff]/20 flex items-center justify-center text-[#0278ff] flex-shrink-0">
              <Play className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {initialData ? 'Re-run & Reconfigure Test' : 'Configure Test Run'}
                {initialData && (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    Re-run
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {initialData ? 'Tweak parameters or target environment and launch a new execution.' : 'The autonomous AI agent will navigate, evaluate assertions, and generate audit reports.'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setIsOpen(false)} 
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body - 2 Column Rectangular Layout */}
        <div className="p-6 overflow-y-auto flex-1 text-left">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column (7 Cols): Test Definition, Context & Instructions */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Row 1: Test Name & Target URL Side-by-Side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">
                    Test Name <span className="text-[#0278ff]">*</span>
                  </label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Wikipedia Search Verification"
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    className="w-full block bg-[#070b14] border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff]" 
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">
                    Target URL <span className="text-[#0278ff]">*</span>
                  </label>
                  <div className="relative w-full">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input 
                      type="url" 
                      required 
                      value={url} 
                      onChange={e => setUrl(e.target.value)}
                      className="w-full block bg-[#070b14] border border-slate-800 rounded-lg pl-9 pr-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff]" 
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Application Context */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-left">
                      <span className="w-2 h-2 rounded-full bg-purple-400 inline-block"></span>
                      <span>Application Context</span>
                    </label>
                    <div className="relative group cursor-help inline-flex items-center">
                      <Info className="w-3.5 h-3.5 text-slate-400 hover:text-purple-400 transition-colors" />
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal normal-case font-normal font-sans">
                        <p className="font-bold text-white mb-1">Application Context</p>
                        <p className="text-purple-300 mb-1 font-medium">App identity, persona &amp; domain knowledge</p>
                        <p>
                          Given to the model before testing. Injected into the AI agent&apos;s system prompt to ground it in your application&apos;s business logic, user roles, sandbox credentials, or custom rules.
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Injected into system prompt · Optional</span>
                </div>
                <textarea 
                  value={context} 
                  onChange={e => setContext(e.target.value)}
                  placeholder={"You are testing an e-commerce store ABC. Act as a customer browsing the catalog, adding items to cart, and proceeding through checkout.\nContext: Dismiss any promotional modal if shown. Sandbox card: 4242-4242-4242-4242."}
                  className="w-full h-[145px] block bg-[#070b14] border border-purple-500/30 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 resize-none font-mono leading-relaxed" 
                />
              </div>

              {/* Row 3: Test Goal & Instructions */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-left">
                    <span className="w-2 h-2 rounded-full bg-[#0278ff] inline-block"></span>
                    Test Goal &amp; Instructions <span className="text-[#0278ff]">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500">Numbered sequence of actions</span>
                </div>
                <textarea 
                  required 
                  value={goalText} 
                  onChange={e => setGoalText(e.target.value)}
                  placeholder={"1. Type running shoes into search box\n2. Click search button\n3. Click on the first product\n4. Click Add to Cart\n5. Verify cart counter displays 1"}
                  className="w-full h-[145px] block bg-[#070b14] border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] resize-none font-mono leading-relaxed" 
                />
              </div>

              {/* Row 4: Tags Configuration */}
              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 text-left">
                    <Tag className="w-3.5 h-3.5 text-[#0278ff]" /> Tags &amp; Classification
                  </label>
                  <span className="text-[11px] text-slate-500">Press Enter or comma to add</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] p-2 bg-[#070b14] border border-slate-800 rounded-lg focus-within:border-[#0278ff] focus-within:ring-1 focus-within:ring-[#0278ff] transition-all">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-[#0278ff]/15 text-[#0278ff] border border-[#0278ff]/30 group"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-slate-400 hover:text-white rounded transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={tags.length === 0 ? "e.g. smoke, regression, auth, p0..." : "Add more..."}
                    className="flex-1 min-w-[130px] bg-transparent text-xs text-slate-200 placeholder-slate-600 focus:outline-none px-1"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Presets:</span>
                  {['smoke', 'regression', 'auth', 'p0', 'e2e'].map((preset) => {
                    const isSelected = tags.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => isSelected ? removeTag(preset) : addTag(preset)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#0278ff]/25 text-[#0278ff] border-[#0278ff]/50 font-bold'
                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}#{preset}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column (5 Cols): Execution Engine, Sandboxing & Integrations */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Group 1: AI Model & Emulated Device */}
              <div className="p-4 rounded-xl border border-slate-800/90 bg-[#070b14]/70 space-y-3.5">
                
                {/* AI Model */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-left">
                      <Cpu className="w-3.5 h-3.5 text-purple-400" /> AI Model
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Default: <span className="text-purple-300 font-semibold">{formatModelName(defaultModelName)}</span>
                    </span>
                  </div>

                  <div className="relative w-full">
                    <select
                      value={selectedModelType}
                      onChange={handleModelSelectChange}
                      className="w-full bg-[#0a0f1d] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] transition-all cursor-pointer appearance-none pr-8"
                    >
                      <option value="default">
                        ⚡ Platform Default ({formatModelName(defaultModelName)})
                      </option>

                      {availableModels.filter(m => m.provider === 'anthropic' && m.enabled !== false).length > 0 && (
                        <optgroup label="Anthropic (High Reasoning)">
                          {availableModels
                            .filter(m => m.provider === 'anthropic' && m.enabled !== false)
                            .map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} {m.recommended ? '★ (Recommended)' : ''}
                              </option>
                            ))}
                        </optgroup>
                      )}

                      {availableModels.filter(m => m.provider === 'openai' && m.enabled !== false).length > 0 && (
                        <optgroup label="OpenAI (Vision Grounding)">
                          {availableModels
                            .filter(m => m.provider === 'openai' && m.enabled !== false)
                            .map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} {m.recommended ? '★ (Recommended)' : ''}
                              </option>
                            ))}
                        </optgroup>
                      )}

                      {availableModels.filter(m => m.provider === 'gemini' && m.enabled !== false).length > 0 && (
                        <optgroup label="Google Gemini (Long Context & Vision)">
                          {availableModels
                            .filter(m => m.provider === 'gemini' && m.enabled !== false)
                            .map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} {m.recommended ? '★ (Recommended)' : ''}
                              </option>
                            ))}
                        </optgroup>
                      )}

                      {availableModels.filter(m => m.provider === 'groq' && m.enabled !== false).length > 0 && (
                        <optgroup label="Groq (High-Speed LPU)">
                          {availableModels
                            .filter(m => m.provider === 'groq' && m.enabled !== false)
                            .map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} {m.recommended ? '★ (Recommended)' : ''}
                              </option>
                            ))}
                        </optgroup>
                      )}

                      <optgroup label="Custom / Open Source">
                        <option value="custom">✎ Custom Model Identifier...</option>
                      </optgroup>
                    </select>

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  {selectedModelType === 'custom' && (
                    <div className="pt-1.5 space-y-1">
                      <input
                        type="text"
                        value={customModelSlug}
                        onChange={(e) => handleCustomModelChange(e.target.value)}
                        placeholder="e.g. ollama/llama3, deepseek/deepseek-r1"
                        className="w-full bg-[#0a0f1d] border border-purple-500/40 rounded-lg px-3 py-1.5 text-xs font-mono text-purple-200 placeholder-slate-600 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all"
                        autoFocus
                      />
                      <p className="text-[10px] text-slate-500">
                        Enter provider prefix + model slug (e.g. <code className="text-purple-300">ollama/qwen2.5</code>).
                      </p>
                    </div>
                  )}

                  {selectedModelType !== 'default' && selectedModelType !== 'custom' && (
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      {(() => {
                        const m = availableModels.find(x => x.id === selectedModelType);
                        if (!m) return null;
                        return (
                          <>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 uppercase font-semibold">
                              {m.provider}
                            </span>
                            {m.supports_vision && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                <span>Vision</span>
                              </span>
                            )}
                            {m.context_window && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                                {m.context_window}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Emulated Device Profile */}
                <div className="space-y-1.5 text-left pt-2 border-t border-slate-800/80">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Device Profile</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {devices.map(d => (
                      <button 
                        key={d.id} 
                        type="button" 
                        onClick={() => setDevice(d.id)}
                        className={"flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border text-xs font-medium transition-all cursor-pointer text-center " +
                          (device === d.id
                            ? 'bg-[#0278ff]/15 border-[#0278ff] text-[#0278ff] font-bold shadow-sm'
                            : 'bg-[#0a0f1d] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700')}>
                        <d.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="block truncate text-[11px]">{d.label}</span>
                        <span className="block text-[9px] opacity-60 font-mono truncate max-w-full">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Group 2: Sandboxing & Execution Policy */}
              <div className="space-y-2.5">
                {/* Ephemeral Pod Isolation Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-[#070b14]/70">
                  <div className="space-y-0.5 pr-2.5 text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-200">Run in Isolated Pod</span>
                      <div className="relative group cursor-help inline-flex items-center">
                        <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal font-sans font-normal">
                          <p className="font-bold text-white mb-1">Ephemeral Pod Isolation</p>
                          <p>
                            When <strong className="text-emerald-400">Enabled</strong>: Spawns an isolated, single-use Kubernetes Pod running strictly as an unprivileged non-root user (UID 10001, drop: ALL). Prevents privilege escalation and isolates memory &amp; processes.
                          </p>
                          <p className="mt-1.5 text-slate-400">
                            When <strong className="text-[#0278ff]">Disabled</strong>: Executes in the persistent daemon worker pool.
                          </p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                        !isK8sAvailable
                          ? 'bg-slate-800/80 text-slate-400 border-slate-700'
                          : isolatedEnv 
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {!isK8sAvailable ? 'Worker Pool (Docker)' : isolatedEnv ? 'Non-Root Pod' : 'Worker Pool'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {!isK8sAvailable
                        ? 'Docker mode: runs in persistent daemon worker pool.'
                        : isolatedEnv 
                        ? 'Dedicated ephemeral non-root pod (UID 10001, /dev/shm)' 
                        : 'Shared persistent worker pool (fast execution)'}
                    </p>
                  </div>

                  <label className={`relative inline-flex items-center ${!isK8sAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} shrink-0 ml-2`}>
                    <input
                      type="checkbox"
                      disabled={!isK8sAvailable}
                      checked={isK8sAvailable && isolatedEnv}
                      onChange={(e) => isK8sAvailable && setIsolatedEnv(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Strict Locator Mode Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-[#070b14]/70">
                  <div className="space-y-0.5 pr-2.5 text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-200">Strict Locator Mode</span>
                      <div className="relative group cursor-help inline-flex items-center">
                        <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal font-sans font-normal">
                          <p className="font-bold text-white mb-1">What is Strict Mode?</p>
                          <p>
                            When <strong className="text-emerald-400">Enabled</strong>: Playwright strictly enforces that an interactive element matched by the AI is 100% unique in the DOM. If multiple matching elements exist, the test halts with a strict-mode violation.
                          </p>
                          <p className="mt-1.5 text-slate-400">
                            When <strong className="text-[#0278ff]">Disabled (Recommended)</strong>: Barely auto-heals by interacting with the primary active matching element.
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {strictMode ? 'Fail immediately if duplicate matching elements exist' : 'Auto-heal by targeting primary matching element'}
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                    <input
                      type="checkbox"
                      checked={strictMode}
                      onChange={(e) => setStrictMode(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#0278ff]"></div>
                  </label>
                </div>
              </div>

              {/* Group 3: Integrations & Notifications */}
              <div className="space-y-2.5">
                {/* Jira Bug Auto-Creation */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-[#070b14]/70">
                  <div className="space-y-0.5 pr-2.5 text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <svg className="w-3.5 h-3.5 fill-[#2684ff] shrink-0" viewBox="0 0 24 24">
                        <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84H11.53zM6.77 6.8a4.36 4.36 0 0 0 4.34 4.34h1.8v1.72a4.36 4.36 0 0 0 4.34 4.34V7.63a.84.84 0 0 0-.83-.83H6.77zM2 11.6a4.36 4.36 0 0 0 4.34 4.34h1.8v1.72a4.35 4.35 0 0 0 4.35 4.34v-9.57a.84.84 0 0 0-.84-.83H2z"/>
                      </svg>
                      <span className="text-xs font-bold text-slate-200">Auto-Create Jira Bug</span>
                      <div className="relative group cursor-help inline-flex items-center">
                        <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal font-sans font-normal">
                          <p className="font-bold text-white mb-1">Jira Auto-Defect Creation</p>
                          <p>
                            When <strong className="text-[#2684ff]">Enabled</strong>: If this test encounters an assertion failure or timeout, Barely automatically files a rich Jira bug ticket with reproduction steps, error logs, and screenshots.
                          </p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                        !jiraConfigured
                          ? 'bg-slate-800/80 text-slate-500 border-slate-700'
                          : createJiraTicket 
                          ? 'bg-blue-500/15 text-[#2684ff] border-blue-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {!jiraConfigured ? 'Unconfigured' : createJiraTicket ? `Active (${jiraProjectKey})` : 'Off'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {!jiraConfigured
                        ? 'Configure Jira Cloud integration in Settings to enable.'
                        : createJiraTicket 
                        ? `Auto-files bug issue in project '${jiraProjectKey}' on failure.` 
                        : 'Manual 1-click filing is available in run audit.'}
                    </p>
                  </div>

                  <label className={`relative inline-flex items-center ${!jiraConfigured ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} shrink-0 ml-2`}>
                    <input
                      type="checkbox"
                      disabled={!jiraConfigured}
                      checked={jiraConfigured && createJiraTicket}
                      onChange={(e) => jiraConfigured && setCreateJiraTicket(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#0052cc]"></div>
                  </label>
                </div>

                {/* Incident Notifications Dropdown */}
                <div className="p-3 rounded-xl border border-slate-800 bg-[#070b14]/70 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-left">
                      <Bell className="w-3.5 h-3.5 text-amber-400" /> Incident Notifications
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Default: <span className="text-amber-300 font-semibold font-mono">
                        {defaultNotificationMechanism === 'both' ? 'Slack & Teams' : defaultNotificationMechanism === 'slack' ? 'Slack' : defaultNotificationMechanism === 'teams' ? 'Teams' : 'Muted'}
                      </span>
                    </span>
                  </div>

                  <div className="relative w-full">
                    <select
                      value={notificationChannel}
                      onChange={(e) => setNotificationChannel(e.target.value)}
                      disabled={!slackConfigured && !teamsConfigured}
                      className="w-full bg-[#0a0f1d] border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] transition-all cursor-pointer appearance-none pr-8 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!slackConfigured && !teamsConfigured ? (
                        <option value="default">No notification webhooks set up (configure in Settings)</option>
                      ) : (
                        <>
                          <option value="default">
                            Default Channel ({defaultNotificationMechanism === 'both' ? 'Slack & Teams' : defaultNotificationMechanism === 'slack' ? 'Slack' : defaultNotificationMechanism === 'teams' ? 'Teams' : 'None'})
                          </option>
                          {slackConfigured && teamsConfigured && (
                            <option value="both">Both Slack &amp; Microsoft Teams</option>
                          )}
                          {slackConfigured && (
                            <option value="slack">Slack Channel Only</option>
                          )}
                          {teamsConfigured && (
                            <option value="teams">Microsoft Teams Channel Only</option>
                          )}
                          <option value="none">Mute Notifications for this Run</option>
                        </>
                      )}
                    </select>

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 4: Preferences & Decision Cache */}
              <div className="space-y-2.5">
                {/* Auto-navigate Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-[#070b14]/70">
                  <div className="space-y-0.5 pr-2.5 text-left min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-200">Auto-navigate to Live Audit</span>
                      <div className="relative group cursor-help inline-flex items-center">
                        <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal font-sans font-normal">
                          <p className="font-bold text-white mb-1">Auto-navigate vs Background Toast</p>
                          <p>
                            When <strong className="text-emerald-400">Enabled</strong>: Browser redirects immediately to live test execution logs upon dispatch.
                          </p>
                          <p className="mt-1.5 text-slate-400">
                            When <strong className="text-[#0278ff]">Disabled (Recommended)</strong>: Remains on current page (GitHub Actions style) with a non-intrusive floating toast.
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {autoNavigate ? 'Redirect immediately to live execution logs' : 'Stay on current page and show dispatch toast'}
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                    <input
                      type="checkbox"
                      checked={autoNavigate}
                      onChange={(e) => setAutoNavigate(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#0278ff]"></div>
                  </label>
                </div>

                {/* AI Decision Caching Toggle - Only when re-running */}
                {initialData && (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-[#070b14]/70">
                    <div className="space-y-0.5 pr-2.5 text-left min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-200">AI Decision Caching</span>
                        <div className="relative group cursor-help inline-flex items-center">
                          <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal font-sans font-normal">
                            <p className="font-bold text-white mb-1">What is AI Decision Caching?</p>
                            <p>
                              When <strong className="text-emerald-400">Enabled</strong>: Replays previous verified LLM decisions for identical DOM states to achieve sub-second execution speed without calling the AI model.
                            </p>
                            <p className="mt-1.5 text-slate-400">
                              When <strong className="text-[#0278ff]">Disabled (Recommended)</strong>: Prompts Claude live at every step to inspect the live page.
                            </p>
                          </div>
                        </div>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0 ${
                          useCache 
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {useCache ? 'Active' : 'Disabled (Live AI)'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        {useCache ? 'Replay cached decisions if DOM matches' : 'Prompt Claude live at every step'}
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
                      <input
                        type="checkbox"
                        checked={useCache}
                        onChange={(e) => setUseCache(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#0278ff]"></div>
                    </label>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Pinned Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-between flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60">
              {device === 'desktop' && <Monitor className="w-3 h-3 text-[#0278ff]" />}
              {device === 'tablet' && <Tablet className="w-3 h-3 text-[#0278ff]" />}
              {(device === 'ios' || device === 'android') && <Smartphone className="w-3 h-3 text-[#0278ff]" />}
              <span className="capitalize text-slate-300">{device}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 truncate max-w-[180px]">
              {selectedModelType === 'default' 
                ? formatModelName(defaultModelName) 
                : selectedModelType === 'custom' 
                ? (customModelSlug || 'Custom Model') 
                : formatModelName(selectedModelType)}
            </span>
            <span className="text-slate-600">·</span>
            <span className={`px-2 py-1 rounded border ${
              !isK8sAvailable 
                ? 'bg-slate-800/80 text-slate-400 border-slate-700/60' 
                : isolatedEnv 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
            }`}>
              {!isK8sAvailable ? 'Worker Pool (Docker)' : isolatedEnv ? 'Isolated Non-Root Pod' : 'Worker Pool'}
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button 
              type="button" 
              onClick={() => setIsOpen(false)} 
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-slate-800/60"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0278ff] hover:bg-[#0062d6] text-white text-xs font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading
                ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Queuing Test...</>
                : <><Play className="w-3.5 h-3.5 fill-current" /> {initialData ? 'Re-run Now' : 'Run Test'}</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  const toastContent = toast ? (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-md w-full sm:w-auto">
      <div className="bg-[#0d1322]/95 border border-[#0278ff]/40 shadow-2xl shadow-[#0278ff]/10 rounded-xl p-4 flex items-center gap-3.5 backdrop-blur-md">
        <div className="w-9 h-9 rounded-lg bg-[#0278ff]/15 border border-[#0278ff]/30 flex items-center justify-center text-[#0278ff] flex-shrink-0">
          <Play className="w-4 h-4 fill-current animate-pulse" />
        </div>
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wide">Test Dispatched</h4>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Active
            </span>
          </div>
          <p className="text-xs text-slate-300 truncate mt-0.5 font-medium">{toast.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => router.push(`/runs/${toast.id}`)}
            className="px-3 py-1.5 bg-[#0278ff] hover:bg-[#0062d6] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>View Live Audit</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const transitioningContent = transitioning ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-[#0d1322] border border-slate-800 shadow-2xl">
        <Loader2 className="w-6 h-6 animate-spin text-[#0278ff]" />
        <p className="text-sm font-medium text-slate-200">Navigating to live test execution...</p>
      </div>
    </div>
  ) : null;

  return (
    <>
      {triggerButton ? (
        triggerButton(openModal)
      ) : (
        <button 
          type="button"
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2 bg-[#0278ff] hover:bg-[#0062d6] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" /> Start New Test
        </button>
      )}
      {isOpen && mounted && createPortal(modalContent, document.body)}
      {mounted && toast && createPortal(toastContent, document.body)}
      {mounted && transitioning && createPortal(transitioningContent, document.body)}
    </>
  );
}
