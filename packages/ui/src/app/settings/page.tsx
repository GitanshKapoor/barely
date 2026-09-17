'use client';

import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Cpu, 
  Database, 
  Globe, 
  Eye, 
  EyeOff, 
  Check, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  Trash2, 
  RefreshCw, 
  Server,
  Lock,
  Zap,
  Info
} from 'lucide-react';

interface SettingItem {
  key: string;
  label: string;
  category: string;
  placeholder: string;
  is_secret: boolean;
  is_configured: boolean;
  source: 'database' | 'environment' | 'none';
  masked_value: string;
  updated_at: string | null;
}

interface DatabaseStatus {
  url_masked: string;
  is_connected: boolean;
  latency_ms: number | null;
  provider: string;
  version: string | null;
  ssl_enabled: boolean;
  error?: string;
}

interface SettingsResponse {
  settings: SettingItem[];
  database: DatabaseStatus;
}

const PROVIDER_INFO: Record<string, { provider: string; model: string; desc: string }> = {
  ANTHROPIC_API_KEY: {
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-5',
    desc: 'Recommended for precise multi-modal vision & autonomous browser reasoning'
  },
  OPENAI_API_KEY: {
    provider: 'openai',
    model: 'openai/gpt-4o',
    desc: 'Fast general-purpose web testing and vision execution'
  },
  GROQ_API_KEY: {
    provider: 'groq',
    model: 'groq/llama-3.3-70b-versatile',
    desc: 'Ultra-low latency open-source reasoning engine'
  },
  GEMINI_API_KEY: {
    provider: 'gemini',
    model: 'gemini/gemini-1.5-pro',
    desc: 'Massive context window & rapid multimodal web inspection'
  }
};

export default function SettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form input states
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [showPlaintext, setShowPlaintext] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchSettings = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`${apiUrl}/api/settings`);
      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      const data: SettingsResponse = await res.json();
      setSettings(data.settings);
      setDbStatus(data.database);
    } catch (err: any) {
      showToast(`Failed to load settings: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleInputChange = (key: string, val: string) => {
    setInputValues(prev => ({ ...prev, [key]: val }));
  };

  const togglePlaintext = (key: string) => {
    setShowPlaintext(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const saveSetting = async (key: string) => {
    const val = inputValues[key];
    if (val === undefined || val.trim() === '') {
      showToast('Please enter a value before saving.', 'error');
      return;
    }

    setSavingKey(key);
    try {
      const res = await fetch(`${apiUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val.trim() })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Save failed');
      }

      showToast(`Setting '${key}' saved and encrypted securely in PostgreSQL!`, 'success');
      setInputValues(prev => ({ ...prev, [key]: '' }));
      await fetchSettings();
    } catch (err: any) {
      showToast(`Error saving setting: ${err.message}`, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const deleteSetting = async (key: string) => {
    setDeletingKey(key);
    try {
      const res = await fetch(`${apiUrl}/api/settings/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete setting');
      showToast(`Database override for '${key}' removed. Falling back to environment.`, 'info');
      setInputValues(prev => ({ ...prev, [key]: '' }));
      await fetchSettings();
    } catch (err: any) {
      showToast(`Error clearing setting: ${err.message}`, 'error');
    } finally {
      setDeletingKey(null);
    }
  };

  const testKey = async (keyName: string) => {
    const info = PROVIDER_INFO[keyName];
    if (!info) return;

    setTestingKey(keyName);
    try {
      const tempVal = inputValues[keyName]?.trim();
      const payload: any = { provider: info.provider };
      if (tempVal) {
        payload.key = tempVal;
      }

      const res = await fetch(`${apiUrl}/api/settings/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
      } else {
        showToast(data.error || 'Test connection failed', 'error');
      }
    } catch (err: any) {
      showToast(`Key test error: ${err.message}`, 'error');
    } finally {
      setTestingKey(null);
    }
  };

  const apiKeys = settings.filter(s => s.category === 'api_keys');
  const modelSettings = settings.filter(s => s.category === 'model');
  const defaultSettings = settings.filter(s => s.category === 'defaults');

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm transition-all animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' 
            : toast.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-blue-950/90 border-blue-500/50 text-blue-200'
        }`}>
          {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
          <span className="font-medium text-xs sm:text-sm">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Platform Settings</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configure encrypted LLM keys, cloud database connections, and autonomous agent defaults.
          </p>
        </div>

        <button
          onClick={() => fetchSettings(true)}
          disabled={refreshing}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#0278ff]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Zero-Leak Security Guarantee Card */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-[#070b14] to-emerald-950/30 border border-blue-500/30 flex items-start gap-3.5 shadow-lg">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 text-[#0278ff] mt-0.5">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <p className="font-bold text-white flex items-center gap-2">
            Zero-Leak Cryptographic Protection Active
            <span className="px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-mono text-[10px]">
              AES-256 Authenticated
            </span>
          </p>
          <p className="text-slate-400 leading-relaxed">
            API keys and sensitive secrets are automatically encrypted with symmetric cipher before storing in PostgreSQL. Raw keys are never stored in plaintext and never transmitted to the browser.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 rounded-xl bg-[#0a0f1d] border border-slate-800 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-[#0278ff] animate-spin" />
          <p className="text-xs text-slate-400">Loading encrypted platform settings...</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 1: LLM Provider API Keys */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">LLM Provider API Keys</h2>
                  <p className="text-xs text-slate-400">Configure keys for multi-modal reasoning and action planning</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline-block">
                Priority: DB Override &gt; .env
              </span>
            </div>

            <div className="p-6 space-y-6 divide-y divide-slate-800/60">
              {apiKeys.map((item, idx) => {
                const info = PROVIDER_INFO[item.key];
                const isTyping = inputValues[item.key] !== undefined && inputValues[item.key].length > 0;
                const isPlain = showPlaintext[item.key] || false;
                const isSaving = savingKey === item.key;
                const isTesting = testingKey === item.key;
                const isDeleting = deletingKey === item.key;

                return (
                  <div key={item.key} className={`${idx > 0 ? 'pt-6' : ''} space-y-2.5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold font-mono text-slate-200 tracking-wide">
                            {item.key}
                          </label>
                          <span className="text-[11px] text-slate-400 font-medium">
                            ({item.label})
                          </span>
                        </div>
                        {info && (
                          <p className="text-[11px] text-slate-500">{info.desc}</p>
                        )}
                      </div>

                      {/* Status Chip */}
                      <div className="flex items-center gap-1.5">
                        {item.is_configured ? (
                          item.source === 'database' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Encrypted in DB
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              Environment (.env)
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Input and Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={isPlain ? 'text' : 'password'}
                          value={inputValues[item.key] !== undefined ? inputValues[item.key] : ''}
                          onChange={(e) => handleInputChange(item.key, e.target.value)}
                          placeholder={item.is_configured ? item.masked_value : item.placeholder}
                          className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] rounded-lg pl-3.5 pr-10 py-2 text-xs font-mono text-white placeholder:text-slate-600 outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => togglePlaintext(item.key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                          title={isPlain ? 'Hide value' : 'Show value'}
                        >
                          {isPlain ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 justify-end">
                        {/* Save Button */}
                        <button
                          type="button"
                          onClick={() => saveSetting(item.key)}
                          disabled={!isTyping || isSaving}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            isTyping
                              ? 'bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md shadow-blue-500/20 cursor-pointer'
                              : 'bg-slate-800/80 text-slate-500 border border-slate-800 cursor-not-allowed'
                          }`}
                        >
                          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Key</span>
                        </button>

                        {/* Test Connection Button */}
                        <button
                          type="button"
                          onClick={() => testKey(item.key)}
                          disabled={isTesting || (!item.is_configured && !isTyping)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Test key against provider"
                        >
                          {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0278ff]" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                          <span>Test</span>
                        </button>

                        {/* Clear Override Button */}
                        {item.source === 'database' && (
                          <button
                            type="button"
                            onClick={() => deleteSetting(item.key)}
                            disabled={isDeleting}
                            className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
                            title="Remove database override and revert to .env"
                          >
                            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: AI Model Selection */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">AI Agent Model</h2>
                <p className="text-xs text-slate-400">Select the default LLM architecture for agent reasoning</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {modelSettings.map(item => {
                const currentVal = inputValues[item.key] !== undefined ? inputValues[item.key] : (item.masked_value || 'anthropic/claude-sonnet-4-5');
                const isTyping = inputValues[item.key] !== undefined && inputValues[item.key] !== item.masked_value;
                const isSaving = savingKey === item.key;

                return (
                  <div key={item.key} className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Claude 3.5 Sonnet (Recommended)', val: 'anthropic/claude-sonnet-4-5' },
                        { label: 'GPT-4o (OpenAI)', val: 'openai/gpt-4o' },
                        { label: 'Llama 3.3 70B (Groq)', val: 'groq/llama-3.3-70b-versatile' },
                        { label: 'Gemini 1.5 Pro', val: 'gemini/gemini-1.5-pro' }
                      ].map(preset => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => handleInputChange(item.key, preset.val)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${
                            currentVal === preset.val
                              ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                              : 'bg-[#070b14] border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => handleInputChange(item.key, e.target.value)}
                        placeholder="e.g. anthropic/claude-sonnet-4-5"
                        className="flex-1 bg-[#070b14] border border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] rounded-lg px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveSetting(item.key)}
                        disabled={!isTyping || isSaving}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          isTyping
                            ? 'bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md cursor-pointer'
                            : 'bg-slate-800 text-slate-500 border border-slate-800 cursor-not-allowed'
                        }`}
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Save Model</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Cloud Database & Connection Manager */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Database & Managed Cloud Connection</h2>
                  <p className="text-xs text-slate-400">PostgreSQL state storage, telemetry, and encrypted secrets</p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                PostgreSQL 15+
              </span>
            </div>

            <div className="p-6 space-y-5">
              {/* Active Connection Card */}
              {dbStatus && (
                <div className="p-4 rounded-xl bg-[#070b14] border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${dbStatus.is_connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                      <span className="text-xs font-bold text-white">
                        {dbStatus.is_connected ? 'Active Connection' : 'Connection Failed'}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {dbStatus.provider}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      {dbStatus.latency_ms !== null && (
                        <span className="text-emerald-400 font-bold">Latency: {dbStatus.latency_ms}ms</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${
                        dbStatus.ssl_enabled 
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/25' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {dbStatus.ssl_enabled ? 'SSL Mode: Active' : 'SSL Mode: Standard'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-semibold uppercase text-slate-500">Current Connection URI (Password Masked)</label>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 break-all select-all">
                      {dbStatus.url_masked}
                    </div>
                  </div>
                </div>
              )}

              {/* Infrastructure Security Notice */}
              <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800/90 space-y-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Infrastructure & Helm Managed Connection
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  To strictly prevent credential leakage, database connections cannot be configured or modified through the web interface. 
                  In Kubernetes production, the connection string is injected securely via Helm <code className="text-sky-300 font-mono">values.yaml</code> or Kubernetes Secrets:
                </p>
                <div className="p-2.5 rounded-lg bg-[#070b14] border border-slate-800 text-[11px] font-mono text-slate-300">
                  <span className="text-slate-500"># deploy/helm/barely/values.yaml</span><br />
                  <span className="text-emerald-400">externalDatabase:</span><br />
                  &nbsp;&nbsp;<span className="text-emerald-400">enabled:</span> <span className="text-white">true</span><br />
                  &nbsp;&nbsp;<span className="text-emerald-400">url:</span> <span className="text-amber-300">&quot;postgresql://barelyadmin:pass@your-rds.amazonaws.com:5432/barelydb?sslmode=require&quot;</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Agent Defaults */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Agent Defaults</h2>
                <p className="text-xs text-slate-400">Default settings applied to new test executions</p>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {defaultSettings.map(item => {
                const isTyping = inputValues[item.key] !== undefined && inputValues[item.key] !== item.masked_value;
                const isSaving = savingKey === item.key;
                const currentVal = inputValues[item.key] !== undefined ? inputValues[item.key] : (item.masked_value || '');

                return (
                  <div key={item.key} className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 space-y-2">
                    <label className="text-xs font-bold text-slate-300">{item.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => handleInputChange(item.key, e.target.value)}
                        placeholder={item.placeholder}
                        className="flex-1 bg-slate-950 border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveSetting(item.key)}
                        disabled={!isTyping || isSaving}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                          isTyping
                            ? 'bg-[#0278ff] text-white hover:bg-[#0062d6]'
                            : 'bg-slate-800 text-slate-500 border border-slate-800 cursor-not-allowed'
                        }`}
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
