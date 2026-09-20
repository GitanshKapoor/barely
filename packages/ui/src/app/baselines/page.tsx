'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Image as ImageIcon, 
  Info, 
  RotateCw, 
  ExternalLink, 
  Eye, 
  X, 
  Play, 
  Layers,
  RotateCcw
} from 'lucide-react';
import NewRunForm from '../../components/NewRunForm';

interface Snapshot {
  step_index: number;
  description: string;
  thought?: string | null;
  screenshot: string;
}

interface BaselineSuite {
  id: string;
  name: string;
  goal: string;
  device: string;
  start_url: string;
  status: string;
  success: boolean | null;
  created_at: string | null;
  strict_mode?: boolean;
  tags?: string[];
  snapshots_count: number;
  snapshots: Snapshot[];
}

export default function BaselinesPage() {
  const [baselines, setBaselines] = useState<BaselineSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewSnapshot, setPreviewSnapshot] = useState<{
    suiteName: string;
    stepIndex: number;
    description: string;
    screenshot: string;
  } | null>(null);

  const fetchBaselines = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/api/baselines`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setBaselines(data.baselines || []);
      }
    } catch (e) {
      console.error("Failed to fetch baselines:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBaselines();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0278ff]"></span>
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Visual Baselines</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">Approved golden UI snapshots used for automated regression detection.</p>
        </div>
        <NewRunForm />
      </div>

      {/* Explanatory Banner */}
      <div className="rounded-xl border border-[#0278ff]/25 bg-[#0278ff]/5 p-5 flex items-start gap-3.5 shadow-lg">
        <Info className="w-5 h-5 text-[#0278ff] mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-200">How Autonomous Visual Baselines Work</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            During every test run, Barely captures high-fidelity viewport snapshots at each interaction step. 
            The latest passing run establishes the active golden visual baseline for that suite and device profile. 
            On subsequent executions, the AI visual comparison engine validates the UI layout and highlights regressions.
          </p>
        </div>
      </div>

      {/* Baselines Gallery */}
      <div className="space-y-6">
        {loading ? (
          <div className="py-20 text-center space-y-3 rounded-xl border border-slate-800 bg-[#0d1322]">
            <RotateCw className="w-8 h-8 animate-spin text-[#0278ff] mx-auto" />
            <p className="text-slate-400 text-sm font-medium">Loading visual baselines...</p>
          </div>
        ) : baselines.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-12 text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 rounded-full bg-slate-800/60 flex items-center justify-center mx-auto text-slate-500">
              <ImageIcon className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-200">No Visual Baselines Captured Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Run an E2E test to automatically capture your application's first set of golden visual snapshots.
              </p>
            </div>
            <div className="pt-2">
              <NewRunForm 
                triggerButton={(open) => (
                  <button
                    onClick={open}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0278ff] hover:bg-[#0062d6] text-white text-xs font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" /> Capture First Baseline
                  </button>
                )}
              />
            </div>
          </div>
        ) : (
          baselines.map((suite) => (
            <div key={suite.id} className="rounded-xl border border-slate-800 bg-[#0d1322] overflow-hidden shadow-xl space-y-4 p-5">
              {/* Suite Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-slate-100">{suite.name}</h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                      {suite.device}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-[#0278ff]" /> {suite.snapshots_count} snapshots
                    </span>
                    {suite.tags && suite.tags.length > 0 && suite.tags.map((tag: string) => (
                      <span key={tag} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  {suite.start_url && (
                    <a 
                      href={suite.start_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs text-[#0278ff] hover:underline font-mono inline-flex items-center gap-1"
                    >
                      {suite.start_url} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <NewRunForm
                    initialData={{
                      name: suite.name,
                      url: suite.start_url || 'https://',
                      goalText: suite.goal,
                      device: suite.device,
                      strictMode: Boolean(suite.strict_mode),
                      tags: suite.tags || []
                    }}
                    triggerButton={(open) => (
                      <button
                        onClick={open}
                        className="px-3 py-1.5 bg-[#0278ff]/15 hover:bg-[#0278ff]/25 text-[#0278ff] hover:text-white border border-[#0278ff]/30 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Re-run Suite
                      </button>
                    )}
                  />
                  <Link
                    href={`/runs/${suite.id}`}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5"
                  >
                    View Audit
                  </Link>
                </div>
              </div>

              {/* Snapshots Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {suite.snapshots.map((snap) => (
                  <div
                    key={snap.step_index}
                    onClick={() => setPreviewSnapshot({
                      suiteName: suite.name,
                      stepIndex: snap.step_index,
                      description: snap.description,
                      screenshot: snap.screenshot
                    })}
                    className="group relative rounded-lg border border-slate-800 bg-[#070b14] overflow-hidden cursor-pointer hover:border-[#0278ff]/60 transition-all shadow-md"
                  >
                    <div className="aspect-video w-full bg-slate-950 overflow-hidden flex items-center justify-center relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/jpeg;base64,${snap.screenshot}`}
                        alt={`Step ${snap.step_index + 1}`}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono font-bold text-[#0278ff]">Step {snap.step_index + 1}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-mono truncate">{snap.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Snapshot Preview Modal */}
      {previewSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-[#0d1322] border border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-100">
                  {previewSnapshot.suiteName} — Step {previewSnapshot.stepIndex + 1}
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{previewSnapshot.description}</p>
              </div>
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#070b14]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${previewSnapshot.screenshot}`}
                alt="Baseline Visual Preview"
                className="max-w-full max-h-[70vh] rounded-lg border border-slate-800 shadow-2xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
