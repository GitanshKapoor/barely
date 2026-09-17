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
  X,
  Copy,
  CheckCheck,
  BookOpen,
  Terminal
} from 'lucide-react';
import { formatModelName } from '../../utils/models';

interface SettingItem {
  key: string;
  label: string;
  category: string;
  placeholder: string;
  is_secret: boolean;
  is_configured: boolean;
  source: 'database' | 'environment' | 'kubernetes' | 'none';
  is_read_only?: boolean;
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

interface SecretsModeInfo {
  mode: 'ui' | 'helm';
  is_locked_by_env: boolean;
  source: string;
  description: string;
}

interface DeploymentInfo {
  is_kubernetes: boolean;
  mode: 'kubernetes' | 'standalone';
  secrets_mode?: SecretsModeInfo;
  provider_name: string;
  subtext: string;
  secrets_dir?: string | null;
  has_volume_mount: boolean;
}

interface SettingsResponse {
  settings: SettingItem[];
  database: DatabaseStatus;
  deployment?: DeploymentInfo;
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
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [activeMode, setActiveMode] = useState<'ui' | 'helm'>('ui');
  const [switchingMode, setSwitchingMode] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Model configuration states
  const [modelNameInput, setModelNameInput] = useState<string>('');
  const [testingModel, setTestingModel] = useState<boolean>(false);
  const [savingModel, setSavingModel] = useState<boolean>(false);
  const [modelTestResult, setModelTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isEditModelModalOpen, setIsEditModelModalOpen] = useState<boolean>(false);

  // Enterprise ESO Guide state
  const [isEsoGuideModalOpen, setIsEsoGuideModalOpen] = useState<boolean>(false);
  const [activeEsoTab, setActiveEsoTab] = useState<'aws' | 'vault' | 'azure' | 'gcp'>('aws');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    showToast(`Copied ${label} snippet to clipboard!`, 'info');
    setTimeout(() => setCopiedSnippet(null), 3000);
  };

  const handleSwitchMode = async (newMode: 'ui' | 'helm') => {
    if (switchingMode || activeMode === newMode) return;
    if (deployment?.secrets_mode?.is_locked_by_env) {
      showToast('Secrets mode is locked by BARELY_SECRETS_MODE in Helm values.', 'error');
      return;
    }

    setSwitchingMode(true);
    try {
      const res = await fetch(`${apiUrl}/api/settings/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update secrets mode');

      setActiveMode(newMode);
      showToast(
        newMode === 'helm'
          ? 'Switched to Helm / Kubernetes Mode. UI secret editing auto-disabled!'
          : 'Switched to Web UI Mode. Secret editing unlocked in PostgreSQL!',
        'success'
      );
      await fetchSettings();
    } catch (err: any) {
      showToast(`Error switching mode: ${err.message}`, 'error');
    } finally {
      setSwitchingMode(false);
    }
  };

  const fetchSettings = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`${apiUrl}/api/settings`);
      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      const data: SettingsResponse = await res.json();
      setSettings(data.settings);
      setDbStatus(data.database);
      setDeployment(data.deployment || null);

      if (data.deployment?.secrets_mode?.mode) {
        setActiveMode(data.deployment.secrets_mode.mode);
      }

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

      {/* Dynamic Deployment & Secrets Security Banner */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg transition-all ${
        deployment?.is_kubernetes
          ? 'bg-gradient-to-r from-cyan-950/40 via-[#070b14] to-blue-950/30 border-cyan-500/30'
          : 'bg-gradient-to-r from-blue-950/40 via-[#070b14] to-emerald-950/30 border-blue-500/30'
      }`}>
        <div className="flex items-start gap-3.5">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
            deployment?.is_kubernetes
              ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              : 'bg-blue-500/15 border-blue-500/30 text-[#0278ff]'
          }`}>
            {deployment?.is_kubernetes ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-bold text-white flex items-center gap-2 flex-wrap">
              <span>{deployment?.is_kubernetes ? 'Enterprise Mode: Helm & Kubernetes Secrets (ESO)' : 'Zero-Leak Cryptographic Protection Active'}</span>
              <span className={`px-2 py-0.2 rounded-full font-mono text-[10px] border ${
                deployment?.is_kubernetes
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              }`}>
                {deployment?.is_kubernetes ? '⎈ Kubernetes Managed' : 'AES-256 Authenticated'}
              </span>
            </p>
            <p className="text-slate-400 leading-relaxed max-w-2xl">
              {deployment?.is_kubernetes
                ? 'API keys are synchronized from your cloud vault (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault) via External Secrets Operator. Keys are injected directly into the runtime container and locked from UI tampering.'
                : 'API keys and sensitive secrets are automatically encrypted with symmetric cipher before storing in PostgreSQL. Raw keys are never stored in plaintext and never transmitted to the browser.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEsoGuideModalOpen(true)}
          className="self-start sm:self-auto px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500/40 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>Cloud Vault &amp; ESO Guide</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 rounded-xl bg-[#0a0f1d] border border-slate-800 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-[#0278ff] animate-spin" />
          <p className="text-xs text-slate-400">Loading encrypted platform settings...</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 0: Secrets Management Mode Switcher */}
          <div className="rounded-xl border border-slate-800 bg-[#0a0f1d] p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">Secrets Management Mode</h2>
                  {deployment?.secrets_mode?.is_locked_by_env && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Enforced by Helm (values.yaml)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Choose how credentials are supplied. When Helm mode is active, manual UI editing is automatically disabled to prevent drift.
                </p>
              </div>

              {switchingMode && (
                <div className="flex items-center gap-1.5 text-xs text-[#0278ff] shrink-0 font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Switching mode...</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: Web UI & Cloud Database */}
              <div
                onClick={() => !deployment?.secrets_mode?.is_locked_by_env && handleSwitchMode('ui')}
                className={`p-4 rounded-xl border transition-all relative ${
                  activeMode === 'ui'
                    ? 'bg-gradient-to-br from-emerald-950/30 to-[#070b14] border-emerald-500/50 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30'
                    : 'bg-[#070b14] border-slate-800 hover:border-slate-700 opacity-75 hover:opacity-100 cursor-pointer'
                } ${deployment?.secrets_mode?.is_locked_by_env ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                      activeMode === 'ui'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Web UI &amp; Cloud Database</span>
                        {activeMode === 'ui' && (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-emerald-400/90 font-medium">Full Read/Write Access</span>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                    activeMode === 'ui'
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-700 bg-slate-900'
                  }`}>
                    {activeMode === 'ui' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                  Enter and edit API keys directly from the web browser. Secrets are encrypted with AES-256 authenticated cipher at rest in PostgreSQL.
                </p>
              </div>

              {/* Option 2: Helm & Kubernetes Secrets */}
              <div
                onClick={() => !deployment?.secrets_mode?.is_locked_by_env && handleSwitchMode('helm')}
                className={`p-4 rounded-xl border transition-all relative ${
                  activeMode === 'helm'
                    ? 'bg-gradient-to-br from-cyan-950/30 to-[#070b14] border-cyan-500/50 shadow-lg shadow-cyan-500/5 ring-1 ring-cyan-500/30'
                    : 'bg-[#070b14] border-slate-800 hover:border-slate-700 opacity-75 hover:opacity-100 cursor-pointer'
                } ${deployment?.secrets_mode?.is_locked_by_env ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                      activeMode === 'helm'
                        ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Helm &amp; Kubernetes Secrets</span>
                        {activeMode === 'helm' && (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-cyan-400/90 font-medium">UI Editing Auto-Disabled (Read-Only)</span>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-1 ${
                    activeMode === 'helm'
                      ? 'border-cyan-500 bg-cyan-500'
                      : 'border-slate-700 bg-slate-900'
                  }`}>
                    {activeMode === 'helm' && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                  Supplied via Helm values.yaml, native K8s Secrets, or ESO. All secret inputs are automatically disabled in the UI to prevent drift.
                </p>
              </div>
            </div>

            {/* Banner when Helm Mode is active */}
            {activeMode === 'helm' && (
              <div className="p-3 rounded-lg bg-cyan-950/25 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    <strong>Helm Mode Active:</strong> UI secret inputs below are auto-disabled. Configure secrets in Helm <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-200">values.yaml</code> or native K8s Secret.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEsoGuideModalOpen(true)}
                  className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition-colors shrink-0 self-start sm:self-auto cursor-pointer flex items-center gap-1.5"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>View K8s Manifests</span>
                </button>
              </div>
            )}
          </div>

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
                {activeMode === 'helm' ? 'Mode: Helm / Kubernetes (UI Auto-Disabled)' : 'Priority: DB Override > .env'}
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
                const isReadOnly = item.is_read_only || item.source === 'kubernetes' || activeMode === 'helm';

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
                          item.source === 'kubernetes' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                              ⎈ Helm / K8s Secret (ESO)
                            </span>
                          ) : item.source === 'database' ? (
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
                          onChange={(e) => !isReadOnly && handleInputChange(item.key, e.target.value)}
                          disabled={isReadOnly}
                          placeholder={item.is_configured ? item.masked_value : item.placeholder}
                          className={`w-full border rounded-lg pl-3.5 pr-10 py-2 text-xs font-mono outline-none transition-all ${
                            isReadOnly
                              ? 'bg-slate-900/60 border-slate-800/80 text-slate-400 cursor-not-allowed placeholder:text-slate-500'
                              : 'bg-[#070b14] border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] text-white placeholder:text-slate-600'
                          }`}
                          title={isReadOnly ? 'Managed externally by Helm / Kubernetes Secret (ESO)' : undefined}
                        />
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => togglePlaintext(item.key)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                            title={isPlain ? 'Hide value' : 'Show value'}
                          >
                            {isPlain ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 justify-end">
                        {isReadOnly ? (
                          /* Helm-managed Read-Only Indicator */
                          <span 
                            className="px-2.5 py-2 rounded-lg text-xs font-medium bg-slate-900/80 text-slate-400 border border-slate-800 flex items-center gap-1.5 select-none"
                            title="Managed externally via Helm / Kubernetes Secret (ESO)"
                          >
                            <Lock className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="hidden sm:inline">Helm Injected</span>
                          </span>
                        ) : (
                          /* Save Button for DB / Env overrides */
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
                        )}

                        {/* Test Connection Button — Active for ALL configured keys! */}
                        <button
                          type="button"
                          onClick={() => testKey(item.key)}
                          disabled={isTesting || (!item.is_configured && !isTyping)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          title="Test key against provider"
                        >
                          {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0278ff]" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                          <span>Test</span>
                        </button>

                        {/* Clear Override Button (only if active in DB) */}
                        {!isReadOnly && item.source === 'database' && (
                          <button
                            type="button"
                            onClick={() => deleteSetting(item.key)}
                            disabled={isDeleting}
                            className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
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

      {/* Enterprise ESO Guide Modal */}
      {isEsoGuideModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEsoGuideModalOpen(false);
          }}
        >
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-left flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Enterprise Cloud Vault &amp; ESO Integration
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                      CNCF Standard
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Sync cloud secrets into Kubernetes via External Secrets Operator without hardcoding credentials
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEsoGuideModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Provider Tabs */}
            <div className="flex border-b border-slate-800 px-6 bg-slate-950/40 shrink-0 gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveEsoTab('aws')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
                  activeEsoTab === 'aws'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🟧 AWS Secrets Manager</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveEsoTab('azure')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
                  activeEsoTab === 'azure'
                    ? 'border-blue-400 text-blue-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🟦 Azure Key Vault</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveEsoTab('vault')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
                  activeEsoTab === 'vault'
                    ? 'border-indigo-400 text-indigo-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🗝️ HashiCorp Vault</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveEsoTab('gcp')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
                  activeEsoTab === 'gcp'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>☁️ GCP Secret Manager</span>
              </button>
            </div>

            {/* Modal Body with Code Snippets */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              
              {/* Architecture Context Banner */}
              <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-slate-300 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white">How External Secrets Operator (ESO) Works:</p>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    ESO runs as an in-cluster controller. It securely connects to your cloud vault using native IAM roles (AWS IRSA, Azure Workload Identity, or K8s Service Accounts) and keeps a Kubernetes Secret named <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">barely-secrets</code> synchronized in real-time. Barely mounts this secret directly into its runtime container with zero credential exposure.
                  </p>
                </div>
              </div>

              {/* Tab 1: AWS Secrets Manager */}
              {activeEsoTab === 'aws' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">AWS Secrets Manager Manifest (IRSA):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
`apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: barely/production
        property: ANTHROPIC_API_KEY
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: barely/production
        property: OPENAI_API_KEY`,
                        'AWS Secrets Manager'
                      )}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                    >
                      {copiedSnippet === 'AWS Secrets Manager' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'AWS Secrets Manager' ? 'Copied!' : 'Copy YAML'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`# 1. ClusterSecretStore using AWS IAM Roles for Service Accounts (IRSA)
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
# 2. ExternalSecret generating 'barely-secrets' in Kubernetes
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: barely/production
        property: ANTHROPIC_API_KEY
    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: barely/production
        property: OPENAI_API_KEY`}
                  </pre>
                </div>
              )}

              {/* Tab 2: Azure Key Vault */}
              {activeEsoTab === 'azure' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Azure Key Vault Manifest (Workload Identity):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
`apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-key-vault
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: "https://my-barely-vault.vault.azure.net"
      serviceAccountRef:
        name: barely-eso-sa
        namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-key-vault
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: ANTHROPIC-API-KEY`,
                        'Azure Key Vault'
                      )}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                    >
                      {copiedSnippet === 'Azure Key Vault' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'Azure Key Vault' ? 'Copied!' : 'Copy YAML'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`# 1. ClusterSecretStore using Azure Workload Identity (Zero hardcoded keys)
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-key-vault
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: "https://my-barely-vault.vault.azure.net"
      serviceAccountRef:
        name: barely-eso-sa
        namespace: default
---
# 2. ExternalSecret generating 'barely-secrets' in Kubernetes
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-key-vault
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: ANTHROPIC-API-KEY`}
                  </pre>
                </div>
              )}

              {/* Tab 3: HashiCorp Vault */}
              {activeEsoTab === 'vault' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">HashiCorp Vault Manifest (Kubernetes Auth):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
`apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: hashicorp-vault
spec:
  provider:
    vault:
      server: "https://vault.internal:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "barely-role"
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: hashicorp-vault
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  dataFrom:
    - extract:
        key: barely/production`,
                        'HashiCorp Vault'
                      )}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                    >
                      {copiedSnippet === 'HashiCorp Vault' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'HashiCorp Vault' ? 'Copied!' : 'Copy YAML'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`# 1. ClusterSecretStore using HashiCorp Vault Kubernetes Service Account Auth
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: hashicorp-vault
spec:
  provider:
    vault:
      server: "https://vault.internal:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "barely-role"
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
# 2. ExternalSecret generating 'barely-secrets' in Kubernetes
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: hashicorp-vault
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  dataFrom:
    - extract:
        key: barely/production`}
                  </pre>
                </div>
              )}

              {/* Tab 4: GCP Secret Manager */}
              {activeEsoTab === 'gcp' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Google Cloud Secret Manager Manifest (Workload Identity):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
`apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: gcp-secret-manager
spec:
  provider:
    gcpsm:
      projectID: my-gcp-project
      auth:
        workloadIdentity:
          clusterLocation: us-central1
          clusterName: barely-cluster
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: gcp-secret-manager
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: barely_anthropic_api_key`,
                        'GCP Secret Manager'
                      )}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                    >
                      {copiedSnippet === 'GCP Secret Manager' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'GCP Secret Manager' ? 'Copied!' : 'Copy YAML'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`# 1. ClusterSecretStore using Google Cloud Workload Identity
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: gcp-secret-manager
spec:
  provider:
    gcpsm:
      projectID: my-gcp-project
      auth:
        workloadIdentity:
          clusterLocation: us-central1
          clusterName: barely-cluster
          serviceAccountRef:
            name: barely-eso-sa
            namespace: default
---
# 2. ExternalSecret generating 'barely-secrets' in Kubernetes
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: barely-cloud-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: gcp-secret-manager
    kind: ClusterSecretStore
  target:
    name: barely-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: barely_anthropic_api_key`}
                  </pre>
                </div>
              )}

              {/* Helm Consumption values.yaml */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Helm values.yaml Integration:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(
`# Barely Helm values.yaml
secrets:
  # Reference the Kubernetes secret generated by ESO
  existingSecret: "barely-secrets"
  # Mount secret files for hot-reloading without pod restarts
  mountPath: "/etc/secrets/barely"`,
                      'Helm values.yaml'
                    )}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                  >
                    {copiedSnippet === 'Helm values.yaml' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSnippet === 'Helm values.yaml' ? 'Copied!' : 'Copy YAML'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
{`# Configure Barely Helm chart to consume the ESO-generated secret:
secrets:
  existingSecret: "barely-secrets"
  mountPath: "/etc/secrets/barely"`}
                </pre>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                Follows CNCF and enterprise GitOps security guidelines
              </span>
              <button
                type="button"
                onClick={() => setIsEsoGuideModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md cursor-pointer transition-all"
              >
                Close Guide
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
