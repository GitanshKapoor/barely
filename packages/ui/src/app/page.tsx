import Link from 'next/link';
import NewRunForm from "../components/NewRunForm";
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import AutoRefresher from "../components/AutoRefresher";

async function getRuns() {
  try {
    const res = await fetch('http://127.0.0.1:8000/api/runs', { cache: 'no-store' });
    if (!res.ok) return { runs: [] };
    return res.json();
  } catch (e) {
    return { runs: [] };
  }
}

export default async function Home() {
  const data = await getRuns();
  const runs = data.runs || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <AutoRefresher />
      <div className="flex items-center justify-between">
        <NewRunForm />
        <h2 className="text-xl font-semibold text-slate-100 tracking-tight">Recent Runs</h2>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500 font-semibold">
            <tr>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Run ID</th>
              <th className="px-6 py-4 font-medium">Goal</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  No execution runs found. Run 'barely run' to start testing.
                </td>
              </tr>
            ) : (
              runs.map((run: any) => (
                <tr key={run.id} className="hover:bg-slate-800/20 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {run.status === "pending" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                        ⏳ Pending
                      </span>
                    )}
                    {run.status === "running" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <span className="animate-pulse">🔄</span> Running...
                      </span>
                    )}
                    {run.status === "completed" && run.success && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                      </span>
                    )}
                    {run.status === "completed" && !run.success && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        <XCircle className="w-3.5 h-3.5" /> Fail
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{run.id}</td>
                  <td className="px-6 py-4 font-medium text-slate-200">{run.goal}</td>
                  <td className="px-6 py-4 text-right">
                    {run.status === "completed" && (
                      <Link href={`/runs/${run.id}`} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium transition-colors opacity-0 group-hover:opacity-100">
                        View Audit <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
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
