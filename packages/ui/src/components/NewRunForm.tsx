'use client';
import { useState } from 'react';
import { Play, Globe, Smartphone, Monitor, Tablet, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NewRunForm() {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://');
  const [goalText, setGoalText] = useState('');
  const [device, setDevice] = useState('desktop');

  const router = useRouter();

  const handleRun = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, goal_text: goalText, device })
      });
      if (res.ok) {
        setIsOpen(false);
        setName(''); setUrl('https://'); setGoalText(''); setDevice('desktop');
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
    { id: 'ios',     label: 'iOS',     icon: Smartphone, desc: 'iPhone 15' },
    { id: 'android', label: 'Android', icon: Smartphone, desc: 'Pixel 7' },
  ];

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
        <Play className="w-4 h-4 fill-current" /> Start New Test
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form onSubmit={handleRun} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Configure Test Run</h3>
            <p className="text-xs text-slate-500 mt-0.5">The AI agent will autonomously execute your goal.</p>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Name</label>
            <input type="text" required placeholder="e.g. Login Flow — Staging"
              value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Start URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="url" required value={url} onChange={e => setUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Goal Instructions</label>
            <textarea required rows={4} value={goalText} onChange={e => setGoalText(e.target.value)}
              placeholder={"1. Click the Login button\n2. Type admin into the username\n3. Verify dashboard is visible"}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none font-mono" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Device Profile</label>
            <div className="grid grid-cols-3 gap-2">
              {devices.map(d => (
                <button key={d.id} type="button" onClick={() => setDevice(d.id)}
                  className={"flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors " +
                    (device === d.id
                      ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700')}>
                  <d.icon className="w-4 h-4" />
                  <span>{d.label}</span>
                  <span className="text-[10px] opacity-60 font-mono">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end pt-1">
          <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {loading
              ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Queuing...</>
              : <><Play className="w-3.5 h-3.5 fill-current" /> Run Test</>}
          </button>
        </div>
      </form>
    </div>
  );
}
