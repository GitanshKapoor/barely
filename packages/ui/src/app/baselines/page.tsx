import { Image as ImageIcon, Info } from 'lucide-react';

export default function BaselinesPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Visual Baselines</h2>
        <p className="text-sm text-slate-500 mt-1">Approved visual snapshots used for regression comparison.</p>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-300">How Visual Baselines Work</p>
          <p className="text-sm text-slate-400 mt-1">
            On the first run of any test, Barely automatically captures a screenshot at each step and saves it as the baseline.
            On subsequent runs, it diffs the new screenshot against the baseline and fails the test if the visual change exceeds the threshold (5%).
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <p className="text-sm font-semibold text-slate-300">Saved Baselines</p>
        </div>
        <div className="px-6 py-16 text-center space-y-3">
          <ImageIcon className="w-10 h-10 text-slate-700 mx-auto" />
          <p className="text-slate-500 text-sm">No baselines captured yet.</p>
          <p className="text-slate-600 text-xs">Run a test from the Executions page to capture your first baseline automatically.</p>
        </div>
      </div>
    </div>
  );
}
