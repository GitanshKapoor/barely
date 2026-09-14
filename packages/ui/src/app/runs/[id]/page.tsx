import Link from 'next/link';
import { ArrowLeft, PlayCircle } from 'lucide-react';

async function getRunDetails(id: string) {
  try {
    const apiUrl = process.env.API_URL || 'http://barely-api:8000';
    const res = await fetch(`${apiUrl}/api/runs/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

export default async function RunDetails({ params }: { params: { id: string } }) {
  const run = await getRunDetails(params.id);

  if (!run) {
    return <div className="text-red-400 p-8 rounded-lg border border-red-900/50 bg-red-950/20">Run not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center gap-4">
        <Link href="/" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight">{run.goal}</h2>
          <p className="text-sm font-mono text-slate-500 mt-1">{params.id}</p>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Left Pane: Execution Log */}
        <div className="w-1/3 flex flex-col rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 font-medium text-sm text-slate-300">
            Execution Steps
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {run.steps.map((step: any, idx: number) => (
              <div key={idx} className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 relative pl-10 group cursor-pointer hover:border-blue-500/30 transition-colors">
                <span className="absolute left-3 top-3.5 w-4 h-4 rounded-full bg-slate-800 text-[9px] flex items-center justify-center font-mono text-slate-400 font-bold border border-slate-700">
                  {idx}
                </span>
                <p className="text-sm text-slate-300 leading-relaxed font-mono">{step.description}</p>
              </div>
            ))}
            
            {!run.success && (
              <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 mt-4">
                <p className="text-sm font-medium text-red-400 mb-1">Fatal Error</p>
                <p className="text-sm text-red-300/80 leading-relaxed font-mono">{run.failure_reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Browser Viewport Simulation */}
        <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-[#0a0a0a] overflow-hidden relative">
           <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3">
             <div className="flex gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
               <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
               <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
             </div>
             <div className="flex-1 max-w-sm mx-auto bg-slate-950 rounded border border-slate-800 h-6 px-3 flex items-center">
               <span className="text-[10px] text-slate-500 font-mono">browser viewport</span>
             </div>
           </div>
           <div className="flex-1 relative overflow-auto p-4 flex items-center justify-center bg-slate-950">
             {run.steps.length > 0 && run.steps[run.steps.length - 1].screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
               <img 
                 src={`data:image/jpeg;base64,${run.steps[run.steps.length - 1].screenshot}`} 
                 alt="Latest step screenshot"
                 className="rounded border border-slate-800 shadow-2xl shadow-black/50 max-h-full object-contain"
               />
             ) : (
               <div className="flex flex-col items-center gap-3 text-slate-600">
                 <PlayCircle className="w-12 h-12 opacity-20" />
                 <p className="text-sm font-medium">No visual payload recorded.</p>
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
