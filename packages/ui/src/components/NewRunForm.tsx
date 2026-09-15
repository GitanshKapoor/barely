'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Play, Globe, Smartphone, Monitor, Tablet, X, Info, Tag, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface RunConfigData {
  name?: string;
  url?: string;
  goalText?: string;
  device?: string;
  strictMode?: boolean;
  useCache?: boolean;
  tags?: string[];
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
  const [device, setDevice] = useState(initialData?.device || 'desktop');
  const [strictMode, setStrictMode] = useState(Boolean(initialData?.strictMode));
  const [useCache, setUseCache] = useState(Boolean(initialData?.useCache));
  const [autoNavigate, setAutoNavigate] = useState(false);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [toast, setToast] = useState<{ id: string; name: string } | null>(null);

  const router = useRouter();

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

  const openModal = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (initialData) {
      setName(initialData.name || '');
      setUrl(initialData.url || 'https://');
      setGoalText(initialData.goalText || '');
      setDevice(initialData.device || 'desktop');
      setStrictMode(Boolean(initialData.strictMode));
      setUseCache(Boolean(initialData.useCache));
      setTags(initialData.tags || []);
      setTagInput('');
    } else {
      setName('');
      setUrl('https://');
      setGoalText('');
      setDevice('desktop');
      setStrictMode(false);
      setUseCache(false);
      setTags([]);
      setTagInput('');
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
          device,
          strict_mode: strictMode,
          use_cache: useCache,
          tags
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
            setName(''); setUrl('https://'); setGoalText(''); setDevice('desktop'); setStrictMode(false); setUseCache(false); setTags([]); setTagInput('');
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-left whitespace-normal select-auto overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <form 
        onSubmit={handleRun} 
        className="bg-[#0d1322] border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl space-y-5 text-left whitespace-normal relative my-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-lg font-bold text-slate-100 text-left">
              {initialData ? 'Re-run & Reconfigure Test' : 'Configure Test Run'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 text-left">
              {initialData ? 'Tweak any test parameters and launch a new execution.' : 'The autonomous AI agent will execute your test instructions.'}
            </p>
          </div>
          <button 
            type="button" 
            onClick={() => setIsOpen(false)} 
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-left">
          {/* Test Name */}
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Test Name</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Wikipedia Search Verification"
              value={name} 
              onChange={e => setName(e.target.value)}
              className="w-full block bg-[#070b14] border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff]" 
            />
          </div>

          {/* Target URL */}
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Target URL</label>
            <div className="relative w-full">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input 
                type="url" 
                required 
                value={url} 
                onChange={e => setUrl(e.target.value)}
                className="w-full block bg-[#070b14] border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff]" 
              />
            </div>
          </div>

          {/* Test Instructions */}
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Test Instructions</label>
            <textarea 
              required 
              rows={4} 
              value={goalText} 
              onChange={e => setGoalText(e.target.value)}
              placeholder={"1. Type Artificial Intelligence into the search box\n2. Click search\n3. Verify the article title appears"}
              className="w-full block bg-[#070b14] border border-slate-800 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] resize-none font-mono leading-relaxed" 
            />
          </div>

          {/* Tags Configuration */}
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 text-left">
                <Tag className="w-3.5 h-3.5 text-[#0278ff]" /> Tags
              </label>
              <span className="text-[11px] text-slate-500">Press Enter or comma to add</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] p-2 bg-[#070b14] border border-slate-800 rounded-lg focus-within:border-[#0278ff] focus-within:ring-1 focus-within:ring-[#0278ff] transition-all">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-[#0278ff]/15 text-[#0278ff] border border-[#0278ff]/30 group"
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
                className="flex-1 min-w-[140px] bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none px-1"
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

          {/* Device Profile */}
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Device Profile</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {devices.map(d => (
                <button 
                  key={d.id} 
                  type="button" 
                  onClick={() => setDevice(d.id)}
                  className={"flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer text-center " +
                    (device === d.id
                      ? 'bg-[#0278ff]/15 border-[#0278ff] text-[#0278ff] font-bold shadow-sm'
                      : 'bg-[#070b14] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700')}>
                  <d.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="block truncate">{d.label}</span>
                  <span className="block text-[10px] opacity-60 font-mono">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Strict Mode Configuration */}
          <div className="pt-2 border-t border-slate-800/80 text-left">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#070b14]">
              <div className="space-y-0.5 pr-3 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-200">Strict Locator Mode</span>
                  <div className="relative group cursor-help">
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal">
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
                <p className="text-[11px] text-slate-400 text-left">
                  {strictMode ? 'Fail immediately if duplicate matching elements exist' : 'Auto-heal by targeting primary matching element'}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={strictMode}
                  onChange={(e) => setStrictMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0278ff]"></div>
              </label>
            </div>
          </div>

          {/* GitHub-style Auto-navigate Toggle */}
          <div className="text-left">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#070b14]">
              <div className="space-y-0.5 pr-3 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-200">Auto-navigate to Live Audit</span>
                  <div className="relative group cursor-help">
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal">
                      <p className="font-bold text-white mb-1">What is Auto-navigate?</p>
                      <p>
                        When <strong className="text-emerald-400">Enabled</strong>: Your browser immediately opens the live test execution screen upon queueing the test.
                      </p>
                      <p className="mt-1.5 text-slate-400">
                        When <strong className="text-[#0278ff]">Disabled (Recommended)</strong>: Stays on your current page (GitHub Actions style), updates the runs table in real time, and shows a floating notification toast to view the audit when ready.
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 text-left">
                  {autoNavigate 
                    ? 'Immediately open live execution logs upon dispatch' 
                    : 'Stay on page and display background dispatch toast (GitHub Actions style)'}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={autoNavigate}
                  onChange={(e) => setAutoNavigate(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0278ff]"></div>
              </label>
            </div>
          </div>

          {/* AI Decision Caching Toggle */}
          <div className="text-left">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#070b14]">
              <div className="space-y-0.5 pr-3 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-200">AI Decision Caching</span>
                  <div className="relative group cursor-help">
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none text-left whitespace-normal">
                      <p className="font-bold text-white mb-1">What is AI Decision Caching?</p>
                      <p>
                        When <strong className="text-emerald-400">Enabled</strong>: Replays previous verified LLM decisions for identical DOM states to achieve sub-second execution speed without calling the AI model.
                      </p>
                      <p className="mt-1.5 text-slate-400">
                        When <strong className="text-[#0278ff]">Disabled (Recommended)</strong>: Prompt Claude live at every step to inspect the live page and verify dynamic behavior or recent website changes.
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                    useCache 
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {useCache ? 'Active' : 'Disabled (Live AI)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 text-left">
                  {useCache 
                    ? 'Replays cached decisions if DOM matches (fastest, skips LLM calls)' 
                    : 'Disabled (Recommended) — AI agent inspects DOM and prompts Claude live at every step'}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={useCache}
                  onChange={(e) => setUseCache(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0278ff]"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end pt-2 border-t border-slate-800/80">
          <button 
            type="button" 
            onClick={() => setIsOpen(false)} 
            className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0278ff] hover:bg-[#0062d6] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading
              ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Queuing Test...</>
              : <><Play className="w-3.5 h-3.5 fill-current" /> {initialData ? 'Re-run Now' : 'Run Test'}</>}
          </button>
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
