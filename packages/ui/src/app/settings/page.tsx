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
  Lock,
  Zap,
  Info,
  ExternalLink,
  Pencil,
  X
} from 'lucide-react';
import { formatModelName } from '../../utils/models';

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
  is_connected: boolean;
  provider_name?: string;
  storage_type?: 'docker' | 'gcp' | 'aws' | 'azure' | 'neon' | 'supabase' | 'cloud';
  subtext?: string;
  chip?: string;
  engine?: string;
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

  // Model configuration states
  const [modelNameInput, setModelNameInput] = useState<string>('');
  const [testingModel, setTestingModel] = useState<boolean>(false);
  const [savingModel, setSavingModel] = useState<boolean>(false);
  const [modelTestResult, setModelTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isEditModelModalOpen, setIsEditModelModalOpen] = useState<boolean>(false);

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

      const defaultModelSetting = data.settings.find(s => s.key === 'DEFAULT_MODEL');
      if (defaultModelSetting && defaultModelSetting.masked_value) {
        setModelNameInput(prev => prev ? prev : defaultModelSetting.masked_value);
      }
    } catch (err: any) {
      showToast(`Failed to load settings: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl]);

  const handleTestModel = async () => {
    const target = modelNameInput.trim();
    if (!target) {
      showToast('Please enter a model name to test', 'error');
      return;
    }
    setTestingModel(true);
    setModelTestResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/settings/test-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: target })
      });
      const data = await res.json();
      if (data.success) {
        setModelTestResult({ success: true, message: data.message });
        showToast(data.message, 'success');
      } else {
        setModelTestResult({ success: false, message: data.error || 'Model test failed' });
        showToast(data.error || 'Model test failed', 'error');
      }
    } catch (err: any) {
      setModelTestResult({ success: false, message: err.message });
      showToast(`Test error: ${err.message}`, 'error');
    } finally {
      setTestingModel(false);
    }
  };

  const handleSaveModel = async () => {
    const target = modelNameInput.trim();
    if (!target) {
      showToast('Please enter a model name', 'error');
      return;
    }
    setSavingModel(true);
    try {
      const res = await fetch(`${apiUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'DEFAULT_MODEL', value: target })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save model');
      }
      showToast(`Default AI model updated to '${formatModelName(target)}'`, 'success');
      setIsEditModelModalOpen(false);
      setModelTestResult(null);
      await fetchSettings();
    } catch (err: any) {
      showToast(`Error saving model: ${err.message}`, 'error');
    } finally {
      setSavingModel(false);
    }
  };

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
  const defaultSettings = settings.filter(s => s.category === 'defaults');
  const activeModel = settings.find(s => s.key === 'DEFAULT_MODEL')?.masked_value || 'anthropic/claude-sonnet-4-5';

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

          {/* Section 2: AI Agent Model Configuration */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">AI Agent Model</h2>
                  <p className="text-xs text-slate-400">Foundation LLM used for test planning and DOM interaction</p>
                </div>
              </div>
              
              {/* Current Default Badge with Pencil Edit Icon */}
              <div className="flex items-center gap-2 bg-[#070b14] border border-purple-500/30 px-3 py-1.5 rounded-lg shadow-sm">
                <span className="text-[11px] text-slate-400 font-medium">Active Default:</span>
                <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  {formatModelName(activeModel)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setModelNameInput(activeModel);
                    setModelTestResult(null);
                    setIsEditModelModalOpen(true);
                  }}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-purple-300 transition-colors ml-0.5 cursor-pointer"
                  title="Edit Default Model"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Clean Model Card View */}
            <div className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#070b14] border border-slate-800/80">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base font-bold text-white tracking-tight">
                      {formatModelName(activeModel)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                      Default Model
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Default multi-modal foundation model used across all test executions.
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 pt-0.5">
                    API Slug: <span className="text-slate-400">{activeModel}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setModelNameInput(activeModel);
                    setModelTestResult(null);
                    setIsEditModelModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-purple-500/40 flex items-center gap-2 transition-all shadow-sm shrink-0 self-start sm:self-auto cursor-pointer"
                  title="Edit Default AI Model"
                >
                  <Pencil className="w-3.5 h-3.5 text-purple-400" />
                  <span>Edit Model</span>
                </button>
              </div>
            </div>
          </div>

          {/* Edit Model Popup Modal */}
          {isEditModelModalOpen && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsEditModelModalOpen(false);
                  setModelTestResult(null);
                }
              }}
            >
              <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-left">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center border border-purple-500/30">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Configure AI Agent Model</h3>
                      <p className="text-[11px] text-slate-400">Set the default model and verify connectivity with a 1-token test</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModelModalOpen(false);
                      setModelTestResult(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4">
                  {/* Display Name Live Preview */}
                  <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Display Name:</span>
                    <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                      {formatModelName(modelNameInput.trim() || activeModel)}
                    </span>
                  </div>

                  {/* Model Identifier input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Model Identifier (API Slug)
                    </label>
                    <input
                      type="text"
                      value={modelNameInput}
                      onChange={(e) => setModelNameInput(e.target.value)}
                      placeholder="e.g. anthropic/claude-sonnet-4-5 or groq/llama-3.3-70b-versatile"
                      className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] rounded-lg px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 outline-none transition-all"
                      autoFocus
                    />
                  </div>

                  {/* 1-Token Test Action */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">Verify credentials &amp; quota before saving</span>
                    <button
                      type="button"
                      onClick={handleTestModel}
                      disabled={testingModel || !modelNameInput.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title="Run a 1-token test ping"
                    >
                      {testingModel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0278ff]" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>Test (1 token)</span>
                    </button>
                  </div>

                  {/* Test Result Feedback */}
                  {modelTestResult && (
                    <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      modelTestResult.success 
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' 
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    }`}>
                      {modelTestResult.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono text-[11px] break-all">{modelTestResult.message}</span>
                    </div>
                  )}

                  {/* Reference Documentation Links */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                    <span className="font-semibold text-slate-500">Model docs:</span>
                    <a
                      href="https://console.groq.com/docs/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      Groq Models <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-slate-700">·</span>
                    <a
                      href="https://docs.anthropic.com/en/docs/about-claude/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      Claude Models <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-slate-700">·</span>
                    <a
                      href="https://platform.openai.com/docs/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      OpenAI Models <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-slate-700">·</span>
                    <a
                      href="https://ai.google.dev/gemini-api/docs/models/gemini"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      Gemini Models <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModelModalOpen(false);
                      setModelTestResult(null);
                    }}
                    disabled={savingModel}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveModel}
                    disabled={savingModel || !modelNameInput.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    {savingModel ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Set as Default</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Database Connection Status */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">Database Connection</h2>
                  <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                    {dbStatus?.chip || 'PostgreSQL 15 (TLS)'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {dbStatus?.subtext || 'PostgreSQL state storage & telemetry'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Dynamic Provider Badge */}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold font-mono border flex items-center gap-1.5 transition-all ${
                dbStatus?.storage_type === 'gcp'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  : dbStatus?.storage_type === 'aws'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : dbStatus?.storage_type === 'azure'
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                  : dbStatus?.storage_type === 'supabase' || dbStatus?.storage_type === 'neon'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
              }`}>
                {dbStatus?.storage_type === 'gcp' && <span>☁️</span>}
                {dbStatus?.storage_type === 'aws' && <span>🟧</span>}
                {dbStatus?.storage_type === 'azure' && <span>🟦</span>}
                {(dbStatus?.storage_type === 'supabase' || dbStatus?.storage_type === 'neon') && <span>⚡</span>}
                {dbStatus?.storage_type === 'docker' && <span>🐳</span>}
                {!['gcp', 'aws', 'azure', 'supabase', 'neon', 'docker'].includes(dbStatus?.storage_type || '') && <span>☁️</span>}
                <span>{dbStatus?.provider_name || 'Docker (Local)'}</span>
              </span>

              {/* Live Connection Status Badge */}
              {dbStatus?.is_connected ? (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  Disconnected
                </span>
              )}
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
