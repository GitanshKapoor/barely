'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  PlayCircle, 
  Download, 
  Printer, 
  Ban, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Terminal, 
  Layers, 
  ExternalLink,
  RotateCw
} from 'lucide-react';

interface RunStep {
  description: string;
  thought?: string | null;
  screenshot?: string | null;
}

interface RunData {
  id: string;
  name: string;
  goal: string;
  start_url: string;
  device: string;
  status: string;
  success: boolean | null;
  failure_reason: string | null;
  created_at: string | null;
  logs: string;
  steps: RunStep[];
}

export default function ClientRunDetails({ id }: { id: string }) {
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'steps' | 'logs'>('steps');
  const [selectedStepIdx, setSelectedStepIdx] = useState<number>(0);
  const [cancelling, setCancelling] = useState(false);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  const fetchRun = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/runs/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const data: RunData = await res.json();
        setRun(data);
        if (data.steps && data.steps.length > 0) {
          setSelectedStepIdx((prev) => (prev >= data.steps.length ? data.steps.length - 1 : prev));
        }
      } else {
        setRun(null);
      }
    } catch (e) {
      console.error("Error fetching run details:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRun();
  }, [id]);

  useEffect(() => {
    if (!run || run.status === 'running' || run.status === 'pending') {
      const timer = setInterval(fetchRun, 2000);
      return () => clearInterval(timer);
    }
  }, [run?.status, id]);

  useEffect(() => {
    if (activeTab === 'logs' && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [run?.logs, activeTab]);

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this running test?")) return;
    setCancelling(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/runs/${id}/cancel`, { method: 'POST' });
      await fetchRun();
    } catch (e) {
      console.error("Failed to cancel run:", e);
    } finally {
      setCancelling(false);
    }
  };

  if (loading && !run) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center space-y-3">
        <RotateCw className="w-8 h-8 animate-spin text-[#0278ff] mx-auto" />
        <p className="text-slate-400 text-sm">Loading execution audit payload...</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-3xl mx-auto p-8 rounded-xl border border-rose-500/30 bg-rose-950/20 text-center space-y-4">
        <XCircle className="w-10 h-10 text-rose-400 mx-auto" />
        <h3 className="text-lg font-bold text-slate-100">Run Execution Not Found</h3>
        <p className="text-sm text-slate-400">
          The requested run <code className="text-xs bg-slate-800 px-1.5 py-0.5 rounded font-mono text-rose-300">{id}</code> could not be loaded from the database.
        </p>
        <Link href="/executions" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700">
          <ArrowLeft className="w-4 h-4" /> Back to Executions
        </Link>
      </div>
    );
  }

  const isRunning = run.status === 'running' || run.status === 'pending';
  const activeStep = run.steps && run.steps[selectedStepIdx] ? run.steps[selectedStepIdx] : run.steps[run.steps.length - 1];

  return (
    <div className="max-w-7xl mx-auto space-y-6 flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Top Banner & Actions Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-start gap-4">
          <Link href="/executions" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-800 bg-slate-900/50">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-slate-100 tracking-tight">{run.name || run.id}</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                run.status === 'completed' && run.success ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' :
                run.status === 'completed' && !run.success ? 'bg-rose-500/10 text-rose-400 border-rose-500/25' :
                run.status === 'running' ? 'bg-[#0278ff]/10 text-[#0278ff] border-[#0278ff]/30 animate-pulse' :
                run.status === 'cancelled' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                'bg-amber-500/10 text-amber-400 border-amber-500/25'
              }`}>
                {run.status === 'completed' && run.success && <CheckCircle2 className="w-3.5 h-3.5" />}
                {run.status === 'completed' && !run.success && <XCircle className="w-3.5 h-3.5" />}
                {run.status === 'cancelled' && <Ban className="w-3.5 h-3.5" />}
                {run.status === 'running' && <span className="w-2 h-2 rounded-full bg-[#0278ff] animate-ping" />}
                {run.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                <span className="uppercase">{run.status}</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                {run.device || 'desktop'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              <span className="font-mono text-slate-500">{run.id}</span>
              {run.start_url && (
                <a href={run.start_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#0278ff] hover:underline font-mono">
                  {run.start_url} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {isRunning && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-lg transition-all shadow-sm"
            >
              <Ban className="w-3.5 h-3.5" />
              {cancelling ? "Cancelling..." : "Cancel Pipeline"}
            </button>
          )}

          <button
            onClick={() => window.open(`http://localhost:8000/api/runs/${run.id}/report?print=true`, '_blank')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold rounded-lg transition-all shadow-sm cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            Export PDF
          </button>

          <a 
            href={`http://localhost:8000/api/runs/${run.id}/download`}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0278ff] hover:bg-[#0062d6] text-white text-xs font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download Package
          </a>
        </div>
      </div>

      {/* Goal Instructions Card */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs font-mono space-y-1">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Goal & Test Instructions</span>
        <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{run.goal}</p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('steps')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'steps'
              ? 'bg-[#0278ff] text-white shadow-md shadow-[#0278ff]/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Visual Steps ({run.steps?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'logs'
              ? 'bg-[#0278ff] text-white shadow-md shadow-[#0278ff]/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" /> Real-Time Console Logs
        </button>
        {isRunning && (
          <div className="ml-auto flex items-center gap-2 text-xs text-[#0278ff] font-mono">
            <RotateCw className="w-3.5 h-3.5 animate-spin" /> Live Streaming...
          </div>
        )}
      </div>

      {/* Tab 1: Visual Steps & Simulation */}
      {activeTab === 'steps' && (
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[480px]">
          {/* Left: Steps List with AI Thoughts */}
          <div className="w-full lg:w-5/12 flex flex-col rounded-xl border border-slate-800 bg-[#0d1322] overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>EXECUTION TIMELINE</span>
              <span className="text-[10px] text-slate-500 font-mono">{run.steps?.length || 0} STEPS COMPLETED</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[550px]">
              {run.steps && run.steps.length > 0 ? (
                run.steps.map((step: RunStep, idx: number) => {
                  const isSelected = selectedStepIdx === idx;
                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedStepIdx(idx)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-[#0278ff] bg-[#0278ff]/10 shadow-md shadow-[#0278ff]/10' 
                          : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          isSelected ? 'bg-[#0278ff] text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          Step {idx + 1}
                        </span>
                        {step.screenshot && (
                          <span className="text-[10px] text-slate-500 font-mono">📷 screenshot captured</span>
                        )}
                      </div>

                      {step.thought && (
                        <div className="mb-2 p-2 rounded bg-slate-950/60 border border-slate-800/60 text-slate-400 text-[11px] leading-relaxed">
                          <span className="text-[9px] font-bold tracking-wider uppercase text-[#0278ff] block mb-0.5">AI Agent Thought</span>
                          <p className="italic">"{step.thought}"</p>
                        </div>
                      )}

                      <p className="text-slate-200 font-mono font-medium">{step.description}</p>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  {isRunning ? (
                    <div className="flex flex-col items-center gap-2">
                      <RotateCw className="w-5 h-5 animate-spin text-[#0278ff]" />
                      <p>Agent is booting browser and analyzing DOM...</p>
                    </div>
                  ) : (
                    <p>No execution steps recorded.</p>
                  )}
                </div>
              )}

              {run.failure_reason && (
                <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-950/20 text-xs space-y-1">
                  <span className="font-bold text-rose-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Pipeline Failure Log
                  </span>
                  <p className="text-rose-200 font-mono leading-relaxed">{run.failure_reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Viewport Simulation with Selected Screenshot */}
          <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-[#060911] overflow-hidden shadow-xl">
            <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60"></div>
                </div>
                <span className="text-[11px] text-slate-400 font-mono font-medium ml-2">
                  Device Viewport Simulation ({run.device || 'desktop'})
                </span>
              </div>
              {activeStep?.screenshot && (
                <span className="text-[10px] text-slate-500 font-mono">
                  Displaying Step {selectedStepIdx + 1}
                </span>
              )}
            </div>

            <div className="flex-1 relative overflow-auto p-4 flex items-center justify-center bg-[#070b14] min-h-[420px]">
              {activeStep?.screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={`data:image/jpeg;base64,${activeStep.screenshot}`} 
                  alt={`Screenshot at step ${selectedStepIdx + 1}`}
                  className="rounded-lg border border-slate-800 shadow-2xl max-h-[500px] object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-600">
                  <PlayCircle className="w-12 h-12 opacity-30" />
                  <p className="text-xs font-medium">No viewport snapshot available for this step.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Real-time Terminal / Console Logs */}
      {activeTab === 'logs' && (
        <div className="rounded-xl border border-slate-800 bg-[#060911] overflow-hidden shadow-2xl flex flex-col flex-1 min-h-[450px]">
          <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#0278ff]" />
              <span className="font-mono text-slate-300 font-semibold">Barely Runner Process Output</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Stream: stdout / DB-persisted</span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed space-y-1 text-slate-300 bg-[#050811] max-h-[550px]">
            {run.logs ? (
              run.logs.split('\n').map((line: string, i: number) => {
                if (!line.trim()) return null;
                const isError = line.includes('❌') || line.includes('Error') || line.includes('interrupted');
                const isSuccess = line.includes('✅') || line.includes('passed');
                const isStep = line.includes('Step') || line.includes('Executed');
                return (
                  <div key={i} className={`flex items-start gap-2 ${
                    isError ? 'text-rose-400 bg-rose-950/20 px-1 py-0.5 rounded' :
                    isSuccess ? 'text-emerald-400' :
                    isStep ? 'text-[#0278ff]' :
                    'text-slate-300'
                  }`}>
                    <span className="text-slate-600 select-none w-8 text-right flex-shrink-0">{i + 1}</span>
                    <span className="break-all">{line}</span>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-600">
                <Terminal className="w-8 h-8 opacity-20 mx-auto mb-2" />
                <p>Awaiting runner process telemetry...</p>
              </div>
            )}
            <div ref={terminalBottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
