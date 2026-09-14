'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import NewRunForm from "../../components/NewRunForm";
import { CheckCircle2, XCircle, Clock, FileText, Ban, RotateCw, RotateCcw } from 'lucide-react';

export default function ExecutionsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchRuns = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/runs`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch (e) {
      console.error("Failed to fetch runs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleCancel = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to cancel this execution run?")) return;
    setCancellingId(id);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/runs/${id}/cancel`, { method: 'POST' });
      if (res.ok) {
        await fetchRuns();
      }
    } catch (err) {
      console.error("Error cancelling run:", err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0278ff]"></span>
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Execution History</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">Real-time status of all autonomous QA pipelines and jobs.</p>
        </div>
        <NewRunForm />
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#0d1322] overflow-hidden shadow-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/60 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
            <tr>
              <th className="px-6 py-4 font-semibold">Pipeline / Test Name</th>
              <th className="px-6 py-4 font-semibold">Device</th>
              <th className="px-6 py-4 font-semibold">Run ID</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading && runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <RotateCw className="w-4 h-4 animate-spin text-[#0278ff]" />
                    <span>Loading pipeline executions...</span>
                  </div>
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No execution runs found. Click "Start New Test" to begin testing.
                </td>
              </tr>
            ) : (
              runs.map((run: any) => (
                <tr key={run.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 font-medium text-slate-200 align-middle">
                    <div className="flex items-center gap-2.5">
                      {run.status === "completed" && run.success && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                      {run.status === "completed" && !run.success && <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
                      {run.status === "cancelled" && <Ban className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      {run.status === "running" && (
                        <span className="relative flex h-3 w-3 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0278ff] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#0278ff]"></span>
                        </span>
                      )}
                      {run.status === "pending" && <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      <span className="truncate max-w-xs">{run.name || run.id}</span>
                    </div>
                    {run.tags && run.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 pl-6 flex-wrap">
                        {run.tags.map((tag: string) => (
                          <span key={tag} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 align-middle">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                      {run.device || 'desktop'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400 align-middle">{run.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap align-middle">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                      run.status === 'completed' && run.success ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      run.status === 'completed' && !run.success ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      run.status === 'running' ? 'bg-[#0278ff]/10 text-[#0278ff] border-[#0278ff]/30 animate-pulse' :
                      run.status === 'cancelled' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {run.status === "pending" && "⏳ Pending"}
                      {run.status === "running" && "🔄 Running..."}
                      {run.status === "completed" && run.success && "✓ Passed"}
                      {run.status === "completed" && !run.success && "✕ Failed"}
                      {run.status === "cancelled" && "⊘ Cancelled"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap align-middle">
                    <div className="flex items-center justify-end gap-2">
                      {(run.status === "running" || run.status === "pending") && (
                        <button
                          type="button"
                          onClick={(e) => handleCancel(run.id, e)}
                          disabled={cancellingId === run.id}
                          className="px-2.5 py-1 text-xs font-medium text-rose-400 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" />
                          {cancellingId === run.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                      <NewRunForm
                        initialData={{
                          name: run.name || run.id,
                          url: run.start_url || 'https://',
                          goalText: run.goal,
                          device: run.device || 'desktop',
                          strictMode: Boolean(run.strict_mode),
                          tags: run.tags || []
                        }}
                        triggerButton={(openModal) => (
                          <button
                            type="button"
                            onClick={(e) => openModal(e)}
                            title="Re-run & Reconfigure"
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3 text-[#0278ff]" /> Re-run
                          </button>
                        )}
                      />
                      <Link 
                        href={`/runs/${run.id}`} 
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#0278ff]" /> Audit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
