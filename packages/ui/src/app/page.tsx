import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, Activity, ArrowRight, Play } from 'lucide-react';

async function getStats() {
  try {
    const apiUrl = process.env.API_URL || 'http://barely-api:8000';
    const res = await fetch(`${apiUrl}/api/runs`, { cache: 'no-store' });
    if (!res.ok) return { runs: [] };
    const data = await res.json();
    return data;
  } catch (e) {
    return { runs: [] };
  }
}

export default async function Home() {
  const data = await getStats();
  const runs = data.runs || [];

  const total     = runs.length;
  const passed    = runs.filter((r: any) => r.status === 'completed' && r.success).length;
  const failed    = runs.filter((r: any) => r.status === 'completed' && !r.success).length;
  const running   = runs.filter((r: any) => r.status === 'running').length;
  const pending   = runs.filter((r: any) => r.status === 'pending').length;
  const passRate  = total > 0 ? Math.round((passed / total) * 100) : 0;

  const recentRuns = runs.slice(0, 5);

  const stats = [
    { label: 'Total Runs',   value: total,    icon: Activity,     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
    { label: 'Passed',       value: passed,   icon: CheckCircle2, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
    { label: 'Failed',       value: failed,   icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
    { label: 'In Progress',  value: running + pending, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Overview</h2>
          <p className="text-sm text-slate-500 mt-1">Your AI testing platform at a glance.</p>
        </div>
        <Link href="/executions" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Play className="w-4 h-4 fill-current" /> New Test Run
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-5 space-y-3`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-4xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pass Rate Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Overall Pass Rate</p>
          <p className="text-2xl font-bold text-slate-100">{passRate}%</p>
        </div>
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${passRate}%`,
              background: passRate >= 70 ? '#22c55e' : passRate >= 40 ? '#eab308' : '#ef4444'
            }}
          />
        </div>
        <p className="text-xs text-slate-500">{passed} passed · {failed} failed · {total} total runs</p>
      </div>

      {/* Recent Runs */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">Recent Runs</p>
          <Link href="/executions" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recentRuns.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            No runs yet. <Link href="/executions" className="text-blue-400 hover:underline">Start your first test →</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {recentRuns.map((run: any) => (
              <div key={run.id} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-800/20 transition-colors group">
                <div className="flex-shrink-0">
                  {run.status === 'completed' && run.success && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  {run.status === 'completed' && !run.success && <XCircle className="w-4 h-4 text-red-400" />}
                  {run.status === 'running' && <span className="animate-pulse inline-block w-4 h-4 text-blue-400">🔄</span>}
                  {run.status === 'pending' && <Clock className="w-4 h-4 text-yellow-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{run.name || run.id}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">{run.id}</p>
                </div>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase flex-shrink-0">
                  {run.device || 'desktop'}
                </span>
                {run.status === 'completed' && (
                  <Link href={`/runs/${run.id}`} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
