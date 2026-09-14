'use client';
import { useState } from 'react';
import { Play, Globe, Smartphone, Monitor } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NewRunForm() {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('https://www.saucedemo.com');
  const [goalText, setGoalText] = useState('1. Type "standard_user" into username\n2. Type "secret_sauce" into password\n3. Click Login');
  const [device, setDevice] = useState('desktop');
  
  const router = useRouter();

  const handleRun = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, goal_text: goalText, device })
      });
      
      if (res.ok) {
        setIsOpen(false);
        setTimeout(() => router.refresh(), 2000);
      } else {
        alert("Failed to queue the test. Check API logs.");
      }
    } catch (e) {
      alert("Error connecting to the API.");
    }
    setLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Play className="w-4 h-4 fill-current" />
        Start New Test
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form onSubmit={handleRun} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Configure AI Test Run</h3>
          <p className="text-sm text-slate-400">The agent will spin up a headless browser and attempt to achieve your goal.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Start URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="url" 
                required
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Goal Instructions</label>
            <textarea 
              required
              rows={4}
              value={goalText}
              onChange={e => setGoalText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Device Profile</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setDevice('desktop')} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${device === 'desktop' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'}`}>
                <Monitor className="w-4 h-4" /> Desktop
              </button>
              <button type="button" onClick={() => setDevice('mobile')} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${device === 'mobile' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'}`}>
                <Smartphone className="w-4 h-4" /> Mobile
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end pt-2">
          <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Queuing Job...' : 'Execute Test'}
          </button>
        </div>
      </form>
    </div>
  );
}
