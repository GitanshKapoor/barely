'use client';

import { useState } from 'react';
import { Play, Globe, Smartphone, Monitor, Tablet, X, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NewRunForm() {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://');
  const [goalText, setGoalText] = useState('');
  const [device, setDevice] = useState('desktop');
  const [strictMode, setStrictMode] = useState(false);

  const router = useRouter();

  const handleRun = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          url, 
          goal_text: goalText, 
          device,
          strict_mode: strictMode
        })
      });
      if (res.ok) {
        setIsOpen(false);
        setName(''); setUrl('https://'); setGoalText(''); setDevice('desktop'); setStrictMode(false);
        router.refresh();
      } else {
        alert('Failed to queue the test. Check API logs.');
      }
    } catch (e) {
      alert('Error connecting to the API. Is it running?');
    }
    setLoading(false);
  };

  const devices = [
    { id: 'desktop', label: 'Desktop', icon: Monitor, desc: '1280x720' },
    { id: 'tablet',  label: 'Tablet',  icon: Tablet,  desc: '768x1024' },
    { id: 'ios',     label: 'iOS',     icon: Smartphone, desc: 'iPhone 15' },
    { id: 'android', label: 'Android', icon: Smartphone, desc: 'Pixel 7' },
  ];

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[#0278ff] hover:bg-[#0062d6] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all">
        <Play className="w-4 h-4 fill-current" /> Start New Test
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form onSubmit={handleRun} className="bg-[#0d1322] border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Configure Test Run</h3>
            <p className="text-xs text-slate-400 mt-0.5">The autonomous AI agent will execute your test instructions.</p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Test Name</label>
            <input type="text" required placeholder="e.g. Wikipedia Search Verification"
              value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff]" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="url" required value={url} onChange={e => setUrl(e.target.value)}
                className="w-full bg-[#070b14] border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff]" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Test Instructions</label>
            <textarea required rows={4} value={goalText} onChange={e => setGoalText(e.target.value)}
              placeholder={"1. Type Artificial Intelligence into the search box\n2. Click search\n3. Verify the article title appears"}
              className="w-full bg-[#070b14] border border-slate-800 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] resize-none font-mono leading-relaxed" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Device Profile</label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {devices.map(d => (
                <button key={d.id} type="button" onClick={() => setDevice(d.id)}
                  className={"flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors " +
                    (device === d.id
                      ? 'bg-[#0278ff]/15 border-[#0278ff] text-[#0278ff] font-bold'
                      : 'bg-[#070b14] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700')}>
                  <d.icon className="w-4 h-4" />
                  <span>{d.label}</span>
                  <span className="text-[10px] opacity-60 font-mono">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Strict Mode Configuration */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-[#070b14]">
              <div className="space-y-0.5 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-200">Strict Locator Mode</span>
                  <div className="relative group cursor-help">
                    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-[#0278ff] transition-colors" />
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-72 p-3 rounded-lg bg-[#0d1322] border border-slate-700 shadow-2xl text-[11px] text-slate-300 leading-relaxed z-50 pointer-events-none">
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
                <p className="text-[11px] text-slate-400">
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
        </div>

        <div className="flex items-center gap-3 justify-end pt-2 border-t border-slate-800/80">
          <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0278ff] hover:bg-[#0062d6] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all disabled:opacity-50">
            {loading
              ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Queuing Test...</>
              : <><Play className="w-3.5 h-3.5 fill-current" /> Run Test</>}
          </button>
        </div>
      </form>
    </div>
  );
}
