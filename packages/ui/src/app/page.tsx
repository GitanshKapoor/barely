import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, Activity, ArrowRight, Play, FileText, Ban } from 'lucide-react';
import AutoRefresher from "../components/AutoRefresher";

async function getStats() {
  try {
    // Server-side fetch needs an absolute URL. Every platform sets INTERNAL_API_URL
    // on the UI container; API_URL is kept as a fallback for older compose files.
    const apiUrl = process.env.INTERNAL_API_URL || process.env.API_URL || 'http://barely-api:8000';
    const res = await fetch(`${apiUrl}/api/runs`, { cache: 'no-store' });
    if (!res.ok) return { runs: [] };
    const data = await res.json();
    return data;
  } catch {
    return { runs: [] };
  }
}

export default async function Home() {
  const data = await getStats();
  const runs = data.runs || [];

  const total     = runs.length;
  const passed    = runs.filter((r: any) => r.status === 'completed' && r.success).length;
  const failed    = runs.filter((r: any) => (r.status === 'completed' && !r.success) || r.status === 'cancelled').length;
  const running   = runs.filter((r: any) => r.status === 'running').length;
  const pending   = runs.filter((r: any) => r.status === 'pending').length;
  const completed = passed + failed;
  const passRate  = completed > 0 ? Math.round((passed / completed) * 100) : (total > 0 && running + pending > 0 ? 0 : 100);

  const recentRuns = runs.slice(0, 6);

  const stats = [
    { label: 'Total Executions', value: total, icon: Activity, color: 'text-[#0278ff]', bg: 'bg-[#0278ff]/10', border: 'border-[#0278ff]/25' },
    { label: 'Passed Tests',     value: passed, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
    { label: 'Failed Tests',     value: failed, icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/25' },
    { label: 'Active Pipeline',  value: running + pending, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <AutoRefresher />

      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0278ff]"></span>
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Pipeline Overview</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">Autonomous E2E test execution metrics and pipeline health.</p>
        </div>
        <Link 
          href="/executions" 
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0278ff] hover:bg-[#0062d6] text-white text-sm font-semibold rounded-lg shadow-lg shadow-[#0278ff]/20 transition-all"
        >
          <Play className="w-4 h-4 fill-current" /> Trigger Test Run
        </Link>
      </div>

      {/* Stat Cards - Harness style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-5 space-y-3 backdrop-blur-sm`}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-4xl font-extrabold ${s.color} font-mono tracking-tight`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pass Rate Bar - Harness visual widget */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">Overall Pass Rate</p>
            <p className="text-xs text-slate-400 mt-0.5">Calculated across all completed test pipelines</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-slate-100 font-mono">{passRate}%</span>
            <span className="text-xs text-slate-400 font-light tracking-wide">Success</span>
          </div>
        </div>
        {/* Multi-status segmented distribution bar */}
        <div className="w-full h-3 bg-slate-900/90 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-slate-800">
          {total > 0 ? (
            <>
              {passed > 0 && (
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 hover:brightness-110"
                  style={{ width: `${(passed / total) * 100}%` }}
                  title={`${passed} Passed (${Math.round((passed / total) * 100)}%)`}
                />
              )}
              {failed > 0 && (
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500 hover:brightness-110"
                  style={{ width: `${(failed / total) * 100}%` }}
                  title={`${failed} Failed / Cancelled (${Math.round((failed / total) * 100)}%)`}
                />
              )}
              {(running + pending) > 0 && (
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500 animate-pulse hover:brightness-110"
                  style={{ width: `${((running + pending) / total) * 100}%` }}
                  title={`${running + pending} In-Flight (${Math.round(((running + pending) / total) * 100)}%)`}
                />
              )}
            </>
          ) : (
            <div className="h-full bg-slate-800/60 rounded-full w-full" />
          )}
        </div>
        <div className="flex items-center justify-between text-xs pt-1 tracking-wide font-light">
          <span className="flex items-center gap-1.5 text-emerald-400/90">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
            {passed} Passed
          </span>
          <span className="flex items-center gap-1.5 text-rose-400/90">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0"></span>
            {failed} Failed / Cancelled
          </span>
          <span className="flex items-center gap-1.5 text-amber-400/90">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"></span>
            {running + pending} In-Flight
          </span>
          <span className="flex items-center gap-1.5 text-slate-400/80">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0"></span>
            {total} Total Runs
          </span>
        </div>
      </div>

      {/* Recent Runs Table */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0278ff]" />
            <p className="text-sm font-semibold text-slate-200">Recent Executions</p>
          </div>
          <Link href="/executions" className="text-xs text-[#0278ff] hover:text-[#3b82f6] font-medium flex items-center gap-1 transition-colors">
            View full execution history <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recentRuns.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            No pipeline runs yet. <Link href="/executions" className="text-[#0278ff] hover:underline font-medium">Start your first test →</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {recentRuns.map((run: any) => (
              <div key={run.id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-slate-800/30 transition-colors">
                <div className="flex-shrink-0">
                  {run.status === 'completed' && run.success && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {run.status === 'completed' && !run.success && <XCircle className="w-4 h-4 text-rose-400" />}
                  {run.status === 'cancelled' && <Ban className="w-4 h-4 text-orange-400" />}
                  {run.status === 'running' && (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0278ff] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#0278ff]"></span>
                    </span>
                  )}
                  {run.status === 'pending' && <Clock className="w-4 h-4 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{run.name || run.id}</p>
                  <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{run.id}</p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase flex-shrink-0">
                  {run.device || 'desktop'}
                </span>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border flex-shrink-0 ${
                  run.status === 'completed' && run.success ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  run.status === 'completed' && !run.success ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                  run.status === 'running' ? 'bg-[#0278ff]/10 text-[#0278ff] border-[#0278ff]/30 animate-pulse' :
                  run.status === 'cancelled' ? 'bg-orange-500/10 text-orange-400 border-orange-500/25' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {run.status === 'completed' && run.success ? 'PASS' :
                   run.status === 'completed' && !run.success ? 'FAIL' :
                   run.status === 'running' ? 'RUNNING' :
                   run.status === 'cancelled' ? 'CANCELLED' : 'PENDING'}
                </span>
                <Link 
                  href={`/runs/${run.id}`} 
                  className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm flex-shrink-0"
                >
                  <FileText className="w-3.5 h-3.5 text-[#0278ff]" /> Audit
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
