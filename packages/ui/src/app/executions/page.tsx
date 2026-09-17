'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import NewRunForm from "../../components/NewRunForm";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText, 
  Ban, 
  RotateCw, 
  RotateCcw, 
  Search, 
  X, 
  Tag, 
  Monitor
} from 'lucide-react';

export default function ExecutionsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed' | 'in_flight' | 'cancelled'>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

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

  // Base filtered runs (matches search, device, and tag before status filter)
  const baseFilteredRuns = useMemo(() => {
    return runs.filter(run => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (run.name || '').toLowerCase().includes(q);
        const matchesId = (run.id || '').toLowerCase().includes(q);
        const matchesUrl = (run.start_url || '').toLowerCase().includes(q);
        const matchesGoal = (run.goal || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesUrl && !matchesGoal) return false;
      }

      // Device filter
      if (deviceFilter !== 'all') {
        if ((run.device || 'desktop').toLowerCase() !== deviceFilter.toLowerCase()) return false;
      }

      // Tag filter
      if (tagFilter !== 'all') {
        if (!run.tags || !run.tags.includes(tagFilter)) return false;
      }

      return true;
    });
  }, [runs, searchQuery, deviceFilter, tagFilter]);

  // Dynamic metrics counts based on active search, device, and tag filters
  const totalCount = baseFilteredRuns.length;
  const passedCount = baseFilteredRuns.filter(r => r.status === 'completed' && r.success).length;
  const failedCount = baseFilteredRuns.filter(r => r.status === 'completed' && !r.success).length;
  const inFlightCount = baseFilteredRuns.filter(r => r.status === 'running' || r.status === 'pending').length;
  const cancelledCount = baseFilteredRuns.filter(r => r.status === 'cancelled').length;

  // Available unique tags across all runs
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    runs.forEach(r => {
      if (Array.isArray(r.tags)) {
        r.tags.forEach((t: string) => t && tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [runs]);

  // Final filtered runs (after applying statusFilter)
  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return baseFilteredRuns;
    return baseFilteredRuns.filter(run => {
      if (statusFilter === 'passed') {
        return run.status === 'completed' && run.success;
      } else if (statusFilter === 'failed') {
        return run.status === 'completed' && !run.success;
      } else if (statusFilter === 'in_flight') {
        return run.status === 'running' || run.status === 'pending';
      } else if (statusFilter === 'cancelled') {
        return run.status === 'cancelled';
      }
      return true;
    });
  }, [baseFilteredRuns, statusFilter]);

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || deviceFilter !== 'all' || tagFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDeviceFilter('all');
    setTagFilter('all');
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
        <NewRunForm onRunCreated={() => fetchRuns()} />
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 space-y-3.5 shadow-xl">
        {/* Top Filter Row: Search & Status Tabs */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by test name, ID, or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#0278ff] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Quick Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                statusFilter === 'all'
                  ? 'bg-[#0278ff] text-white shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
              }`}
            >
              All <span className="text-[10px] opacity-80 font-mono">({totalCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('passed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                statusFilter === 'passed'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-emerald-400/80 hover:text-emerald-300 hover:bg-slate-800/80 border border-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Passed <span className="text-[10px] opacity-80 font-mono">({passedCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                statusFilter === 'failed'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-rose-400/80 hover:text-rose-300 hover:bg-slate-800/80 border border-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              Failed <span className="text-[10px] opacity-80 font-mono">({failedCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('in_flight')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                statusFilter === 'in_flight'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-amber-400/80 hover:text-amber-300 hover:bg-slate-800/80 border border-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              In-Flight <span className="text-[10px] opacity-80 font-mono">({inFlightCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                statusFilter === 'cancelled'
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                  : 'bg-slate-900/60 text-slate-400 hover:text-orange-400 hover:bg-orange-500/10 border border-slate-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
              Cancelled <span className="text-[10px] opacity-80 font-mono">({cancelledCount})</span>
            </button>
          </div>
        </div>

        {/* Dynamic Segmented Distribution Mini-bar */}
        {totalCount > 0 && (
          <div className="w-full h-1.5 bg-slate-900/90 rounded-full overflow-hidden flex gap-0.5 border border-slate-800">
            {passedCount > 0 && (
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${(passedCount / totalCount) * 100}%` }}
                title={`${passedCount} Passed`}
              />
            )}
            {failedCount > 0 && (
              <div 
                className="h-full bg-rose-500 rounded-full transition-all duration-300"
                style={{ width: `${(failedCount / totalCount) * 100}%` }}
                title={`${failedCount} Failed`}
              />
            )}
            {cancelledCount > 0 && (
              <div 
                className="h-full bg-orange-400 rounded-full transition-all duration-300"
                style={{ width: `${(cancelledCount / totalCount) * 100}%` }}
                title={`${cancelledCount} Cancelled`}
              />
            )}
            {inFlightCount > 0 && (
              <div 
                className="h-full bg-amber-400 rounded-full animate-pulse transition-all duration-300"
                style={{ width: `${(inFlightCount / totalCount) * 100}%` }}
                title={`${inFlightCount} In-Flight`}
              />
            )}
          </div>
        )}

        {/* Bottom Filter Row: Secondary Selectors (Device, Tags, Clear) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Device Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1">
              <Monitor className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">Device:</span>
              <select
                value={deviceFilter}
                onChange={(e) => setDeviceFilter(e.target.value)}
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#0d1322]">All Devices</option>
                <option value="desktop" className="bg-[#0d1322]">Desktop</option>
                <option value="tablet" className="bg-[#0d1322]">Tablet</option>
                <option value="ios" className="bg-[#0d1322]">iOS</option>
                <option value="android" className="bg-[#0d1322]">Android</option>
              </select>
            </div>

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Tag:</span>
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-[#0d1322]">All Tags</option>
                  {availableTags.map(tag => (
                    <option key={tag} value={tag} className="bg-[#0d1322]">#{tag}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-slate-400 hover:text-rose-400 flex items-center gap-1 text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear filters
              </button>
            )}
          </div>

          {/* Results Counter */}
          <div className="text-slate-400 font-mono text-[11px]">
            Showing <strong className="text-slate-200">{filteredRuns.length}</strong> of {totalCount} runs {totalCount !== runs.length && <span className="text-slate-500">({runs.length} total)</span>}
          </div>
        </div>
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
            ) : filteredRuns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  {hasActiveFilters ? (
                    <div className="space-y-2">
                      <p className="text-slate-300 font-medium">No execution runs match the selected filters.</p>
                      <button
                        onClick={resetFilters}
                        className="text-xs text-[#0278ff] hover:underline font-semibold"
                      >
                        Reset all filters
                      </button>
                    </div>
                  ) : (
                    <p>No execution runs found. Click "Start New Test" to begin testing.</p>
                  )}
                </td>
              </tr>
            ) : (
              filteredRuns.map((run: any) => (
                <tr key={run.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 font-medium text-slate-200 align-middle">
                    <div className="flex items-center gap-2.5">
                      {run.status === "completed" && run.success && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                      {run.status === "completed" && !run.success && <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
                      {run.status === "cancelled" && <Ban className="w-4 h-4 text-orange-400 flex-shrink-0" />}
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
                    <div className="flex flex-col gap-1 items-start">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                        {run.device || 'desktop'}
                      </span>
                      {run.model && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 truncate max-w-[130px]" title={run.model}>
                          {run.model.split('/').pop()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400 align-middle">{run.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap align-middle">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                      run.status === 'completed' && run.success ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      run.status === 'completed' && !run.success ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      run.status === 'running' ? 'bg-[#0278ff]/10 text-[#0278ff] border-[#0278ff]/30 animate-pulse' :
                      run.status === 'cancelled' ? 'bg-orange-500/10 text-orange-400 border-orange-500/25' :
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
                          useCache: false,
                          tags: run.tags || []
                        }}
                        onRunCreated={() => fetchRuns()}
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
