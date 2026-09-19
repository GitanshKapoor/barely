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
  Terminal, 
  Bell, 
  BellOff,
  Send,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Sliders,
  Layers,
  Server,
  Box,
  Ban,
  Cloud
} from 'lucide-react';
import { formatModelName } from '../../utils/models';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  supports_vision?: boolean;
  recommended?: boolean;
  context_window?: string;
  description?: string;
  dynamic?: boolean;
  enabled?: boolean;
  configured?: boolean;
}

interface ProviderSyncStatus {
  configured: boolean;
  dynamic: boolean;
  count?: number;
  error?: string;
}

// In-memory module cache to guarantee instantaneous 0ms page loads on repeat navigations
let cachedSettingsData: SettingsResponse | null = null;
let cachedIntegrationsData: any = null;
let cachedModelsData: { models?: ModelOption[]; sync_status?: Record<string, ProviderSyncStatus>; default_model?: string } | null = null;

// Hydrate from sessionStorage on browser initial load to prevent cold skeleton flashes
if (typeof window !== 'undefined') {
  try {
    const s = sessionStorage.getItem('barely_settings_cache');
    if (s && !cachedSettingsData) cachedSettingsData = JSON.parse(s);
    const i = sessionStorage.getItem('barely_integrations_cache');
    if (i && !cachedIntegrationsData) cachedIntegrationsData = JSON.parse(i);
    const m = sessionStorage.getItem('barely_models_cache');
    if (m && !cachedModelsData) cachedModelsData = JSON.parse(m);
  } catch {}
}

interface SettingItem {
  key: string;
  label: string;
  category: string;
  placeholder: string;
  is_secret: boolean;
  is_configured: boolean;
  source: 'database' | 'environment' | 'kubernetes' | 'none';
  is_read_only?: boolean;
  is_infra_managed?: boolean;
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
  execution_engine?: {
    mode: 'worker_pool' | 'k8s_job';
    max_parallel_pods: number;
    cluster: any;
    is_k8s_available: boolean;
    mode_description?: string;
  };
}

const PROVIDER_INFO: Record<string, { provider: string; model: string; desc: string }> = {
  ANTHROPIC_API_KEY: {
    provider: 'anthropic',
    model: 'anthropic/claude-3-7-sonnet',
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
    model: 'gemini/gemini-2.0-flash',
    desc: 'Massive context window & rapid multimodal web inspection'
  }
};

export default function SettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [settings, setSettings] = useState<SettingItem[]>(() => cachedSettingsData?.settings || []);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(() => cachedSettingsData?.database || null);
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(() => cachedSettingsData?.deployment || null);
  const [loading, setLoading] = useState(() => !cachedSettingsData);
  const [refreshing, setRefreshing] = useState(false);

  // Model configuration states
  const [modelNameInput, setModelNameInput] = useState<string>(() => {
    const defaultModelSetting = cachedSettingsData?.settings?.find(s => s.key === 'DEFAULT_MODEL');
    return defaultModelSetting?.masked_value || 'anthropic/claude-3-7-sonnet';
  });
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(() => cachedModelsData?.models || []);
  const [syncStatus, setSyncStatus] = useState<Record<string, ProviderSyncStatus>>(() => cachedModelsData?.sync_status || {});
  const [selectedModelType, setSelectedModelType] = useState<string>('preset');
  const [customModelSlug, setCustomModelSlug] = useState<string>('');
  const [testingModel, setTestingModel] = useState<boolean>(false);
  const [savingModel, setSavingModel] = useState<boolean>(false);
  const [deletingModel, setDeletingModel] = useState<boolean>(false);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<boolean>(false);
  const [modelTestResult, setModelTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);
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

  // Enterprise Integrations States
  const [jiraHost, setJiraHost] = useState(() => cachedIntegrationsData?.integrations?.jira?.host || '');
  const [jiraEmail, setJiraEmail] = useState(() => cachedIntegrationsData?.integrations?.jira?.email || '');
  const [jiraToken, setJiraToken] = useState('');
  const [jiraProjectKey, setJiraProjectKey] = useState(() => cachedIntegrationsData?.integrations?.jira?.project_key || 'QA');
  const [jiraIssueType, setJiraIssueType] = useState(() => cachedIntegrationsData?.integrations?.jira?.issue_type || 'Bug');
  const [jiraAutoCreate, setJiraAutoCreate] = useState(() => Boolean(cachedIntegrationsData?.integrations?.jira?.auto_create));
  const [jiraConfigured, setJiraConfigured] = useState(() => Boolean(cachedIntegrationsData?.integrations?.jira?.configured));
  const [jiraMaskedToken, setJiraMaskedToken] = useState(() => cachedIntegrationsData?.integrations?.jira?.masked_token || '');
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [testingJira, setTestingJira] = useState(false);
  const [savingJira, setSavingJira] = useState(false);
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deletingJira, setDeletingJira] = useState(false);
  const [confirmDeleteJira, setConfirmDeleteJira] = useState(false);

  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [slackNotifyOn, setSlackNotifyOn] = useState(() => cachedIntegrationsData?.integrations?.slack?.notify_on || 'failure_only');
  const [slackConfigured, setSlackConfigured] = useState(() => Boolean(cachedIntegrationsData?.integrations?.slack?.configured));
  const [slackMaskedWebhook, setSlackMaskedWebhook] = useState(() => cachedIntegrationsData?.integrations?.slack?.masked_webhook || '');
  const [showSlackWebhook, setShowSlackWebhook] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deletingSlack, setDeletingSlack] = useState(false);
  const [confirmDeleteSlack, setConfirmDeleteSlack] = useState(false);

  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState('');
  const [teamsNotifyOn, setTeamsNotifyOn] = useState(() => cachedIntegrationsData?.integrations?.teams?.notify_on || 'failure_only');
  const [teamsConfigured, setTeamsConfigured] = useState(() => Boolean(cachedIntegrationsData?.integrations?.teams?.configured));
  const [teamsMaskedWebhook, setTeamsMaskedWebhook] = useState(() => cachedIntegrationsData?.integrations?.teams?.masked_webhook || '');
  const [showTeamsWebhook, setShowTeamsWebhook] = useState(false);
  const [testingTeams, setTestingTeams] = useState(false);
  const [savingTeams, setSavingTeams] = useState(false);
  const [teamsTestResult, setTeamsTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deletingTeams, setDeletingTeams] = useState(false);
  const [confirmDeleteTeams, setConfirmDeleteTeams] = useState(false);

  // General Notification Defaults
  const [defaultNotificationMechanism, setDefaultNotificationMechanism] = useState<'both' | 'slack' | 'teams' | 'none'>(() => cachedIntegrationsData?.integrations?.default_notification_mechanism || 'both');
  const [savingDefaultMechanism, setSavingDefaultMechanism] = useState(false);

  // Execution Engine & Pod Isolation States
  const [executionMode, setExecutionMode] = useState<'worker_pool' | 'k8s_job'>(() => cachedSettingsData?.execution_engine?.mode || 'worker_pool');
  const [maxParallelPods, setMaxParallelPods] = useState<number>(() => cachedSettingsData?.execution_engine?.max_parallel_pods || 10);
  const [savingEngine, setSavingEngine] = useState(false);
  const [engineClusterStatus, setEngineClusterStatus] = useState<any>(() => cachedSettingsData?.execution_engine?.cluster || null);
  const [isK8sAvailable, setIsK8sAvailable] = useState<boolean>(() => Boolean(cachedSettingsData?.execution_engine?.is_k8s_available));
  const [showConcurrencyInfo, setShowConcurrencyInfo] = useState(false);

  // Section Collapse and Category Navigation States (default to collapsed)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    secrets: true,
    model: true,
    execution: true,
    jira: true,
    notifications: true,
    defaults: true,
    database: true,
  });
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAllSections = () => {
    setCollapsedSections({
      secrets: false,
      model: false,
      execution: false,
      jira: false,
      notifications: false,
      defaults: false,
      database: false,
    });
  };

  const collapseAllSections = () => {
    setCollapsedSections({
      secrets: true,
      model: true,
      execution: true,
      jira: true,
      notifications: true,
      defaults: true,
      database: true,
    });
  };

  const allCollapsed = Object.values(collapsedSections).every(Boolean);

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

  const fetchSettings = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [res, intgRes, modelsRes] = await Promise.all([
        fetch(`${apiUrl}/api/settings`),
        fetch(`${apiUrl}/api/integrations`).catch(ie => {
          console.error('Failed to load integrations:', ie);
          return null;
        }),
        fetch(`${apiUrl}/api/models`).catch(me => {
          console.error('Failed to load models:', me);
          return null;
        })
      ]);

      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      const data: SettingsResponse = await res.json();
      cachedSettingsData = data;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('barely_settings_cache', JSON.stringify(data));
        } catch {}
      }
      setSettings(data.settings);
      setDbStatus(data.database);
      setDeployment(data.deployment || null);

      const defaultModelSetting = data.settings.find(s => s.key === 'DEFAULT_MODEL');
      if (defaultModelSetting && defaultModelSetting.masked_value) {
        setModelNameInput(prev => prev ? prev : defaultModelSetting.masked_value);
      }

      if (modelsRes && modelsRes.ok) {
        const modelsData = await modelsRes.json();
        cachedModelsData = modelsData;
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('barely_models_cache', JSON.stringify(modelsData));
          } catch {}
        }
        if (modelsData.models && Array.isArray(modelsData.models)) {
          setAvailableModels(modelsData.models);
        }
        if (modelsData.sync_status) {
          setSyncStatus(modelsData.sync_status);
        }
      }

      // Process enterprise integrations configuration
      if (intgRes && intgRes.ok) {
        const intgData = await intgRes.json();
        cachedIntegrationsData = intgData;
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('barely_integrations_cache', JSON.stringify(intgData));
          } catch {}
        }
        const intg = intgData.integrations;
        if (intg?.jira) {
          setJiraHost(intg.jira.host || '');
          setJiraEmail(intg.jira.email || '');
          setJiraProjectKey(intg.jira.project_key || 'QA');
          setJiraIssueType(intg.jira.issue_type || 'Bug');
          setJiraAutoCreate(Boolean(intg.jira.auto_create));
          setJiraConfigured(Boolean(intg.jira.configured));
          setJiraMaskedToken(intg.jira.masked_token || '');
        }
        if (intg?.slack) {
          setSlackNotifyOn(intg.slack.notify_on || 'failure_only');
          setSlackConfigured(Boolean(intg.slack.configured));
          setSlackMaskedWebhook(intg.slack.masked_webhook || '');
        }
        if (intg?.teams) {
          setTeamsNotifyOn(intg.teams.notify_on || 'failure_only');
          setTeamsConfigured(Boolean(intg.teams.configured));
          setTeamsMaskedWebhook(intg.teams.masked_webhook || '');
        }
        if (intg?.default_notification_mechanism) {
          setDefaultNotificationMechanism(intg.default_notification_mechanism as any);
        }
      }

      if (data.execution_engine) {
        setExecutionMode(data.execution_engine.mode || 'worker_pool');
        if (data.execution_engine.max_parallel_pods) {
          setMaxParallelPods(Number(data.execution_engine.max_parallel_pods));
        }
        setEngineClusterStatus(data.execution_engine.cluster || null);
        setIsK8sAvailable(Boolean(data.execution_engine.is_k8s_available));
      }
    } catch (err: any) {
      showToast(`Failed to load settings: ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl]);

  const handleSaveEngine = async (modeToSave?: 'worker_pool' | 'k8s_job', podsToSave?: number) => {
    const targetMode = modeToSave || executionMode;
    const targetPods = podsToSave !== undefined ? podsToSave : maxParallelPods;
    setSavingEngine(true);
    try {
      const res = await fetch(`${apiUrl}/api/execution-engine/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: targetMode,
          max_parallel_pods: targetPods
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update execution engine');
      setExecutionMode(data.engine.mode);
      setMaxParallelPods(data.engine.max_parallel_pods);
      setEngineClusterStatus(data.engine.cluster);
      setIsK8sAvailable(data.engine.is_k8s_available);
      showToast(
        targetMode === 'k8s_job'
          ? 'Switched to Kubernetes Ephemeral Pods (1 Test per Non-Root Pod)!'
          : 'Switched to Persistent Worker Pool (Shared Daemon Workers)!',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update execution settings', 'error');
    } finally {
      setSavingEngine(false);
    }
  };

  const handleTestModel = async () => {
    const target = modelNameInput.trim();
    if (!target) {
      showToast('Please enter a model name to test', 'error');
      return;
    }
    setTestingModel(true);
    setModelTestResult(null);
    try {
      let keyToPass: string | undefined = undefined;
      const lower = target.toLowerCase();
      if (lower.startsWith('anthropic') || lower.includes('claude')) {
        keyToPass = inputValues['ANTHROPIC_API_KEY']?.trim();
      } else if (lower.startsWith('openai') || lower.includes('gpt') || lower.startsWith('o1') || lower.startsWith('o3')) {
        keyToPass = inputValues['OPENAI_API_KEY']?.trim();
      } else if (lower.startsWith('groq') || lower.includes('llama') || lower.includes('mixtral') || lower.includes('deepseek')) {
        keyToPass = inputValues['GROQ_API_KEY']?.trim();
      } else if (lower.startsWith('gemini')) {
        keyToPass = inputValues['GEMINI_API_KEY']?.trim();
      }

      const payload: any = { model: target };
      if (keyToPass) {
        payload.api_key = keyToPass;
      }

      const res = await fetch(`${apiUrl}/api/settings/test-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      setModelSaveError('Please enter a model name');
      showToast('Please enter a model name', 'error');
      return;
    }
    setSavingModel(true);
    setModelSaveError(null);
    try {
      const res = await fetch(`${apiUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'DEFAULT_MODEL', value: target })
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = err.detail || 'Failed to save model';
        setModelSaveError(msg);
        showToast(msg, 'error');
        return;
      }
      showToast(`Default AI model updated to '${formatModelName(target)}'`, 'success');
      setIsEditModelModalOpen(false);
      setModelTestResult(null);
      setModelSaveError(null);
      await fetchSettings();
    } catch (err: any) {
      const msg = err.message || 'Error saving model';
      setModelSaveError(msg);
      showToast(`Error saving model: ${msg}`, 'error');
    } finally {
      setSavingModel(false);
    }
  };

  const openEditModelModal = () => {
    const current = activeModel;
    setModelNameInput(current);
    const existsInPresets = availableModels.some(m => m.id === current);
    if (existsInPresets) {
      setSelectedModelType(current);
      setCustomModelSlug('');
    } else {
      setSelectedModelType('custom');
      setCustomModelSlug(current);
    }
    setModelTestResult(null);
    setModelSaveError(null);
    setIsEditModelModalOpen(true);
  };

  const handleDeleteModelConfig = async () => {
    setDeletingModel(true);
    try {
      const res = await fetch(`${apiUrl}/api/settings/DEFAULT_MODEL`, {
        method: 'DELETE'
      });
      if (!res.ok && res.status !== 404) {
        throw new Error('Failed to delete model configuration');
      }
      showToast('Model configuration deleted. Reset to system default.', 'success');
      setModelNameInput('anthropic/claude-3-7-sonnet');
      setSelectedModelType('anthropic/claude-3-7-sonnet');
      setCustomModelSlug('');
      setIsEditModelModalOpen(false);
      setConfirmDeleteModel(false);
      await fetchSettings();
    } catch (err: any) {
      showToast(`Error deleting model config: ${err.message}`, 'error');
    } finally {
      setDeletingModel(false);
    }
  };

  const handleTestJira = async () => {
    setTestingJira(true);
    setJiraTestResult(null);
    try {
      const payload: any = {
        provider: 'jira',
        jira_host: jiraHost.trim(),
        jira_email: jiraEmail.trim(),
        jira_project_key: jiraProjectKey.trim().toUpperCase()
      };
      if (jiraToken.trim()) {
        payload.jira_api_token = jiraToken.trim();
      }
      const res = await fetch(`${apiUrl}/api/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setJiraTestResult({ success: data.success, message: data.message || (data.success ? 'Jira connected successfully!' : 'Connection test failed') });
      if (data.success) {
        showToast(data.message || 'Jira connection verified!', 'success');
      } else {
        showToast(data.message || 'Jira verification failed', 'error');
      }
    } catch (e: any) {
      setJiraTestResult({ success: false, message: e.message || 'Network error' });
      showToast(`Jira test error: ${e.message}`, 'error');
    } finally {
      setTestingJira(false);
    }
  };

  const handleSaveJira = async () => {
    setSavingJira(true);
    try {
      const payload: any = {
        jira_host: jiraHost.trim(),
        jira_email: jiraEmail.trim(),
        jira_project_key: jiraProjectKey.trim().toUpperCase(),
        jira_issue_type: jiraIssueType.trim(),
        jira_auto_create: jiraAutoCreate
      };
      if (jiraToken.trim()) {
        payload.jira_api_token = jiraToken.trim();
      }
      const res = await fetch(`${apiUrl}/api/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Jira configuration saved and encrypted securely!', 'success');
        setJiraToken('');
        await fetchSettings();
      } else {
        showToast(data.detail || data.error || 'Failed to save Jira settings', 'error');
      }
    } catch (e: any) {
      showToast(`Save error: ${e.message}`, 'error');
    } finally {
      setSavingJira(false);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    setSlackTestResult(null);
    try {
      const payload: any = { provider: 'slack' };
      if (slackWebhookUrl.trim()) {
        payload.slack_webhook_url = slackWebhookUrl.trim();
      }
      const res = await fetch(`${apiUrl}/api/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setSlackTestResult({ success: data.success, message: data.message || (data.success ? 'Slack ping sent!' : 'Slack test failed') });
      if (data.success) {
        showToast('Slack test card delivered!', 'success');
      } else {
        showToast(data.message || 'Slack test failed', 'error');
      }
    } catch (e: any) {
      setSlackTestResult({ success: false, message: e.message });
      showToast(`Slack test error: ${e.message}`, 'error');
    } finally {
      setTestingSlack(false);
    }
  };

  const handleSaveSlack = async () => {
    setSavingSlack(true);
    try {
      const payload: any = { slack_notify_on: slackNotifyOn };
      if (slackWebhookUrl.trim()) {
        payload.slack_webhook_url = slackWebhookUrl.trim();
      }
      const res = await fetch(`${apiUrl}/api/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Slack settings saved!', 'success');
        setSlackWebhookUrl('');
        await fetchSettings();
      } else {
        showToast(data.detail || data.error || 'Failed to save Slack settings', 'error');
      }
    } catch (e: any) {
      showToast(`Save error: ${e.message}`, 'error');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestTeams = async () => {
    setTestingTeams(true);
    setTeamsTestResult(null);
    try {
      const payload: any = { provider: 'teams' };
      if (teamsWebhookUrl.trim()) {
        payload.teams_webhook_url = teamsWebhookUrl.trim();
      }
      const res = await fetch(`${apiUrl}/api/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setTeamsTestResult({ success: data.success, message: data.message || (data.success ? 'Teams ping sent!' : 'Teams test failed') });
      if (data.success) {
        showToast('Microsoft Teams test card delivered!', 'success');
      } else {
        showToast(data.message || 'Teams test failed', 'error');
      }
    } catch (e: any) {
      setTeamsTestResult({ success: false, message: e.message });
      showToast(`Teams test error: ${e.message}`, 'error');
    } finally {
      setTestingTeams(false);
    }
  };

  const handleSaveTeams = async () => {
    setSavingTeams(true);
    try {
      const payload: any = { teams_notify_on: teamsNotifyOn };
      if (teamsWebhookUrl.trim()) {
        payload.teams_webhook_url = teamsWebhookUrl.trim();
      }
      const res = await fetch(`${apiUrl}/api/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Microsoft Teams settings saved!', 'success');
        setTeamsWebhookUrl('');
        await fetchSettings();
      } else {
        showToast(data.detail || data.error || 'Failed to save Teams settings', 'error');
      }
    } catch (e: any) {
      showToast(`Save error: ${e.message}`, 'error');
    } finally {
      setSavingTeams(false);
    }
  };

  const handleSaveDefaultMechanism = async (newMechanism?: 'both' | 'slack' | 'teams' | 'none') => {
    const val = newMechanism || defaultNotificationMechanism;
    setSavingDefaultMechanism(true);
    try {
      const res = await fetch(`${apiUrl}/api/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_notification_mechanism: val })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Default notification channel updated to ${val.toUpperCase()}!`, 'success');
        setDefaultNotificationMechanism(val);
      } else {
        showToast(data.detail || data.error || 'Failed to update default notification channel', 'error');
      }
    } catch (e: any) {
      showToast(`Save error: ${e.message}`, 'error');
    } finally {
      setSavingDefaultMechanism(false);
    }
  };

  const handleDeleteIntegration = async (provider: 'slack' | 'teams' | 'jira') => {
    if (provider === 'slack') setDeletingSlack(true);
    else if (provider === 'teams') setDeletingTeams(true);
    else if (provider === 'jira') setDeletingJira(true);

    try {
      const res = await fetch(`${apiUrl}/api/integrations/${provider}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Failed to delete ${provider} integration`);
      }

      showToast(data.message || `${provider.toUpperCase()} integration removed`, 'success');

      if (provider === 'slack') {
        setSlackWebhookUrl('');
        setSlackMaskedWebhook('');
        setSlackConfigured(false);
        setSlackNotifyOn('failure_only');
        setSlackTestResult(null);
        setConfirmDeleteSlack(false);
      } else if (provider === 'teams') {
        setTeamsWebhookUrl('');
        setTeamsMaskedWebhook('');
        setTeamsConfigured(false);
        setTeamsNotifyOn('failure_only');
        setTeamsTestResult(null);
        setConfirmDeleteTeams(false);
      } else if (provider === 'jira') {
        setJiraHost('');
        setJiraEmail('');
        setJiraToken('');
        setJiraMaskedToken('');
        setJiraProjectKey('QA');
        setJiraIssueType('Bug');
        setJiraAutoCreate(false);
        setJiraConfigured(false);
        setJiraTestResult(null);
        setConfirmDeleteJira(false);
      }

      await fetchSettings();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      if (provider === 'slack') setDeletingSlack(false);
      else if (provider === 'teams') setDeletingTeams(false);
      else if (provider === 'jira') setDeletingJira(false);
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
      if (info.model) {
        payload.model = info.model;
      }
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
  const defaultModelSetting = settings.find(s => s.key === 'DEFAULT_MODEL');
  const activeModel = defaultModelSetting?.masked_value || 'anthropic/claude-3-7-sonnet';
  const activeModelObj = availableModels.find(m => m.id === activeModel);
  const isModelOverridden = defaultModelSetting?.source === 'database' || activeModel !== 'anthropic/claude-3-7-sonnet';

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
                {deployment?.is_kubernetes ? 'Kubernetes Managed' : 'AES-256 Authenticated'}
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

      {/* Sticky Section Menu & Collapse All / Expand All Bar (Always rendered instantly) */}
      <div className="sticky top-16 z-20 -mx-1 px-3 py-2 bg-[#070b14]/95 backdrop-blur-md border border-slate-800 rounded-xl flex items-center justify-between gap-2.5 overflow-x-auto shadow-2xl">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Sliders className="w-3 h-3 text-[#0278ff]" />
            <span className="hidden sm:inline">Sections:</span>
          </span>
          {[
            { id: 'all', label: 'All', icon: Layers },
            { id: 'secrets', label: 'Secrets & Keys', icon: Key, color: 'text-amber-400' },
            { id: 'model', label: 'AI Model', icon: Cpu, color: 'text-purple-400' },
            { id: 'execution', label: 'Pod Execution', icon: ShieldCheck, color: 'text-emerald-400' },
            { id: 'jira', label: 'Issue Tracking (Jira)', icon: Zap, color: 'text-[#2684ff]' },
            { id: 'notifications', label: 'Alerts & Webhooks', icon: Bell, color: 'text-amber-400' },
            { id: 'defaults', label: 'Defaults', icon: Sliders, color: 'text-slate-400' },
            { id: 'database', label: 'Database', icon: Database, color: 'text-cyan-400' },
          ].map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.id !== 'all') {
                    setCollapsedSections(prev => ({ ...prev, [cat.id]: false }));
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === cat.id
                    ? 'bg-[#0278ff] text-white shadow-sm shadow-blue-500/25'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${activeCategory === cat.id ? 'text-white' : cat.color || 'text-slate-400'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={allCollapsed ? expandAllSections : collapseAllSections}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-sm ml-auto"
          title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
        >
          <ChevronsUpDown className="w-3.5 h-3.5 text-[#0278ff]" />
          <span>{allCollapsed ? 'Expand All' : 'Collapse All'}</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-4 pt-1">
          {[
            { label: 'Secrets & API Keys Management', icon: Key, color: 'text-amber-400' },
            { label: 'Default AI Model Configuration', icon: Cpu, color: 'text-purple-400' },
            { label: 'Execution Engine & Pod Concurrency', icon: ShieldCheck, color: 'text-emerald-400' },
            { label: 'Atlassian Jira Cloud Integration', icon: Zap, color: 'text-[#2684ff]' },
            { label: 'Incident Notifications (Slack & Teams)', icon: Bell, color: 'text-amber-400' },
            { label: 'Default Test Configurations', icon: Sliders, color: 'text-slate-400' },
            { label: 'Database & Storage Status', icon: Database, color: 'text-cyan-400' },
          ].map(skeleton => {
            const Icon = skeleton.icon;
            return (
              <div key={skeleton.label} className="rounded-xl border border-slate-800/80 bg-[#0a0f1d] px-6 py-4 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${skeleton.color} opacity-70`} />
                  <span className="text-sm font-semibold text-slate-400">{skeleton.label}</span>
                </div>
                <div className="w-4 h-4 rounded bg-slate-800/60"></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 1: Secrets & API Keys Management */}
          <div id="section-secrets" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'secrets' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('secrets')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">Secrets &amp; API Keys Management</h2>
                      <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/25 shrink-0">
                        Zero-Config Auto-Detect
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">Configure runtime credentials, cloud secrets sync, and LLM provider keys</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  {collapsedSections.secrets && (
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800 hidden sm:inline-flex items-center gap-1.5 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${apiKeys.some(k => k.is_configured) ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      {apiKeys.filter(k => k.is_configured).length} / {apiKeys.length} Configured
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={collapsedSections.secrets ? "Expand Secrets section" : "Collapse Secrets section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.secrets ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-blue-400" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.secrets && (
                <div className="p-6 space-y-6">
                  {/* LLM Provider API Keys with Zero-Config Discovery */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Zero-Config Secrets Discovery</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/25">
                            Auto-Detect Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Keys mounted via Kubernetes Secrets, Vault, or environment variables are locked automatically. Custom keys can be entered below and are encrypted with AES-256 in PostgreSQL.
                        </p>
                      </div>

                      <div className="relative shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setIsEsoGuideModalOpen(!isEsoGuideModalOpen)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm ${
                            isEsoGuideModalOpen
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                          <span>K8s Vault Guide</span>
                        </button>

                        {/* Floating Popup (Anchored popover without dark screen backdrop) */}
                        {isEsoGuideModalOpen && (
                          <>
                            {/* Transparent click-outside overlay (NO dark background, NO blur) */}
                            <div 
                              className="fixed inset-0 z-40 bg-transparent cursor-default"
                              onClick={() => setIsEsoGuideModalOpen(false)}
                            />

                            <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[580px] md:w-[680px] max-w-[92vw] bg-[#0a0f1d] border border-slate-700 shadow-2xl rounded-2xl z-50 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]">
                              
                              {/* Popup Header */}
                              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/40">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                                    <Terminal className="w-3.5 h-3.5" />
                                  </div>
                                  <div>
                                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                                      Enterprise Cloud Vault &amp; ESO Integration
                                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 font-semibold">
                                        CNCF Standard
                                      </span>
                                    </h3>
                                    <p className="text-[10px] text-slate-400">
                                      Sync cloud secrets into Kubernetes via External Secrets Operator without hardcoding credentials
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIsEsoGuideModalOpen(false)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Provider Tabs */}
                              <div className="flex border-b border-slate-800 px-5 bg-slate-950/50 shrink-0 gap-1 overflow-x-auto">
                                <button
                                  type="button"
                                  onClick={() => setActiveEsoTab('aws')}
                                  className={`py-2 px-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                                    activeEsoTab === 'aws'
                                      ? 'border-amber-400 text-amber-300'
                                      : 'border-transparent text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                  <span>AWS Secrets Manager</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveEsoTab('azure')}
                                  className={`py-2 px-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                                    activeEsoTab === 'azure'
                                      ? 'border-blue-400 text-blue-300'
                                      : 'border-transparent text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                  <span>Azure Key Vault</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveEsoTab('vault')}
                                  className={`py-2 px-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                                    activeEsoTab === 'vault'
                                      ? 'border-indigo-400 text-indigo-300'
                                      : 'border-transparent text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                                  <span>HashiCorp Vault</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveEsoTab('gcp')}
                                  className={`py-2 px-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                                    activeEsoTab === 'gcp'
                                      ? 'border-emerald-400 text-emerald-300'
                                      : 'border-transparent text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                  <span>GCP Secret Manager</span>
                                </button>
                              </div>

                              {/* Popup Body */}
                              <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
                                
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

                              {/* Popup Footer */}
                              <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between shrink-0">
                                <span className="text-[10px] text-slate-500">
                                  Follows CNCF and enterprise GitOps security guidelines
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setIsEsoGuideModalOpen(false)}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md cursor-pointer transition-all"
                                >
                                  Close
                                </button>
                              </div>

                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3.5">
              {apiKeys.map((item) => {
                const info = PROVIDER_INFO[item.key];
                const isTyping = inputValues[item.key] !== undefined && inputValues[item.key].length > 0;
                const isPlain = showPlaintext[item.key] || false;
                const isSaving = savingKey === item.key;
                const isTesting = testingKey === item.key;
                const isDeleting = deletingKey === item.key;
                const isReadOnly = Boolean(item.is_infra_managed || item.source === 'kubernetes' || (item.source === 'environment' && isK8sAvailable));

                return (
                  <div 
                    key={item.key} 
                    className="p-4 sm:p-5 rounded-xl bg-[#070b14] border border-slate-800/90 hover:border-slate-700/80 transition-all space-y-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold font-mono text-slate-100 tracking-wide">
                            {item.key}
                          </label>
                          <span className="text-[11px] text-slate-400 font-medium">
                            ({item.label})
                          </span>
                        </div>
                        {info && (
                          <p className="text-[11px] text-slate-400 leading-relaxed">{info.desc}</p>
                        )}
                      </div>

                      {/* Status Chip */}
                      <div className="flex items-center gap-1.5">
                        {item.is_configured ? (
                          isReadOnly ? (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5" title="Mounted via Kubernetes Secret / Environment. Locked against UI overwrites.">
                              <Lock className="w-3 h-3 text-cyan-400" /> Managed via Infra (Locked)
                            </span>
                          ) : item.source === 'database' ? (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                              <Lock className="w-3 h-3 text-emerald-400" /> Encrypted in DB (AES-256)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                              Environment (.env)
                            </span>
                          )
                        ) : (
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-800/80 text-slate-400 border border-slate-700/70">
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Input and Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-0.5">
                      <div className="relative flex-1">
                        <input
                          type={isPlain ? 'text' : 'password'}
                          value={inputValues[item.key] !== undefined ? inputValues[item.key] : ''}
                          onChange={(e) => !isReadOnly && handleInputChange(item.key, e.target.value)}
                          disabled={isReadOnly}
                          placeholder={item.is_configured ? item.masked_value : item.placeholder}
                          className={`w-full border rounded-lg pl-3.5 pr-10 py-2.5 text-xs font-mono outline-none transition-all ${
                            isReadOnly
                              ? 'bg-[#0a0f1d] border-slate-800 text-slate-400 cursor-not-allowed placeholder:text-slate-500'
                              : 'bg-[#0a0f1d] border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] text-white placeholder:text-slate-600'
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
                          /* Infra-managed Read-Only Indicator */
                          <span 
                            className="px-3 py-2.5 rounded-lg text-xs font-medium bg-[#0a0f1d] text-slate-400 border border-slate-800 flex items-center gap-1.5 select-none"
                            title="Managed externally via Kubernetes Secret (ESO) or Infrastructure Environment"
                          >
                            <Lock className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="hidden sm:inline">Infra Locked</span>
                          </span>
                        ) : (
                          /* Save Button for DB / Env overrides */
                          <button
                            type="button"
                            onClick={() => saveSetting(item.key)}
                            disabled={!isTyping || isSaving}
                            className={`px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
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
                          className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                            className="p-2.5 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
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
        </div>
      )}
    </div>

          {/* Section 2: AI Agent Model Configuration */}
          <div id="section-model" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'model' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('model')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">AI Agent Model</h2>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                        Multi-Modal LLM
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">Foundation LLM used for test planning and DOM interaction</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  {/* Current Default Badge with Pencil Edit Icon */}
                  <div className="flex items-center gap-2 bg-[#070b14] border border-purple-500/30 px-3 py-1.5 rounded-lg shadow-sm">
                    <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Active Default:</span>
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                      {formatModelName(activeModel)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModelModal();
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-purple-300 transition-colors ml-0.5 cursor-pointer"
                      title="Edit Default Model"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {isModelOverridden && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteModelConfig();
                        }}
                        disabled={deletingModel}
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors ml-0.5 cursor-pointer disabled:opacity-50"
                        title="Delete model configuration and reset to default"
                      >
                        {deletingModel ? (
                          <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={collapsedSections.model ? "Expand Model section" : "Collapse Model section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.model ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-purple-400" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.model && (
                <div className="p-6 space-y-6">
                  {/* Active Default Model Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#070b14] border border-slate-800/80">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-base font-bold text-white tracking-tight">
                          {formatModelName(activeModel)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                          Default Model
                        </span>
                        {activeModelObj?.dynamic && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Live Dynamic
                          </span>
                        )}
                        {activeModelObj?.context_window && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                            {activeModelObj.context_window} Context
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {activeModelObj?.description || "Default multi-modal foundation model used across all test executions."}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 pt-0.5">
                        API Slug: <span className="text-slate-400">{activeModel}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0 self-start sm:self-auto">
                      {isModelOverridden && (
                        confirmDeleteModel ? (
                          <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1 text-xs">
                            <span className="text-rose-300 text-[11px] font-medium">Delete config?</span>
                            <button
                              type="button"
                              onClick={handleDeleteModelConfig}
                              disabled={deletingModel}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              {deletingModel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteModel(false)}
                              disabled={deletingModel}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteModel(true)}
                            disabled={deletingModel || savingModel}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete model configuration and reset to default"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Config</span>
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={openEditModelModal}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-purple-500/40 flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                        title="Edit Default AI Model"
                      >
                        <Pencil className="w-3.5 h-3.5 text-purple-400" />
                        <span>Edit Model</span>
                      </button>
                    </div>
                  </div>

                  {/* Provider Discovery & Live Sync Status Cards */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Provider Discovery &amp; Live Sync
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Automatically discovers newly supported models and filters out non-chat / deprecated models in real time when API keys are configured.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { id: 'anthropic', name: 'Anthropic Claude', keyName: 'ANTHROPIC_API_KEY' },
                        { id: 'groq', name: 'Groq LPUs', keyName: 'GROQ_API_KEY' },
                        { id: 'openai', name: 'OpenAI', keyName: 'OPENAI_API_KEY' },
                        { id: 'gemini', name: 'Google Gemini', keyName: 'GEMINI_API_KEY' },
                      ].map(p => {
                        const status = syncStatus[p.id];
                        const isDyn = Boolean(status?.dynamic);
                        const isConfigured = Boolean(status?.configured);
                        const count = status?.count || availableModels.filter(m => m.provider === p.id).length;

                        return (
                          <div key={p.id} className="p-3.5 rounded-xl bg-[#070b14] border border-slate-800/80 flex flex-col justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-200">{p.name}</span>
                                {isDyn ? (
                                  <span className="flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    Live
                                  </span>
                                ) : isConfigured ? (
                                  <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                                    Active
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50">
                                    Offline
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {isDyn 
                                  ? `${count} active models discovered` 
                                  : isConfigured 
                                  ? `${count} models (catalog)` 
                                  : 'API key not configured'}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                              <span className="text-slate-500 font-mono">
                                {isConfigured ? 'Sync: Enabled' : 'Key missing'}
                              </span>
                              {!isConfigured && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCollapsedSections(prev => ({ ...prev, secrets: false }));
                                    const el = document.getElementById('section-secrets');
                                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  className="text-[#0278ff] hover:underline font-medium cursor-pointer flex items-center gap-0.5"
                                >
                                  Configure ↗
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

          {/* Edit Model Popup Modal */}
          {isEditModelModalOpen && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsEditModelModalOpen(false);
                  setModelTestResult(null);
                  setModelSaveError(null);
                }
              }}
            >
              <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-left">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center border border-purple-500/30">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Configure AI Agent Model</h3>
                      <p className="text-[11px] text-slate-400">Select an active foundation model or specify a custom endpoint slug</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModelModalOpen(false);
                      setModelTestResult(null);
                      setModelSaveError(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                  {/* Model Selection Mode / Dropdown */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Select AI Model
                    </label>
                    <div className="relative">
                      <select
                        value={selectedModelType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedModelType(val);
                          if (val !== 'custom') {
                            setModelNameInput(val);
                          } else {
                            setModelNameInput(customModelSlug || '');
                          }
                          setModelTestResult(null);
                          setModelSaveError(null);
                        }}
                        className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] rounded-lg px-3.5 py-2.5 text-xs text-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        {availableModels.filter(m => m.provider === 'anthropic' && m.enabled !== false).length > 0 && (
                          <optgroup label="Anthropic (High Reasoning)">
                            {availableModels
                              .filter(m => m.provider === 'anthropic' && m.enabled !== false)
                              .map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.recommended ? '★ (Recommended)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}

                        {availableModels.filter(m => m.provider === 'openai' && m.enabled !== false).length > 0 && (
                          <optgroup label="OpenAI (Vision Grounding)">
                            {availableModels
                              .filter(m => m.provider === 'openai' && m.enabled !== false)
                              .map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.recommended ? '★ (Recommended)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}

                        {availableModels.filter(m => m.provider === 'gemini' && m.enabled !== false).length > 0 && (
                          <optgroup label="Google Gemini (Long Context & Vision)">
                            {availableModels
                              .filter(m => m.provider === 'gemini' && m.enabled !== false)
                              .map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.recommended ? '★ (Recommended)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}

                        {availableModels.filter(m => m.provider === 'groq' && m.enabled !== false).length > 0 && (
                          <optgroup label="Groq (High-Speed LPU)">
                            {availableModels
                              .filter(m => m.provider === 'groq' && m.enabled !== false)
                              .map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} {m.recommended ? '★ (Recommended)' : ''}
                                </option>
                              ))}
                          </optgroup>
                        )}

                        <optgroup label="Custom / Self-Hosted">
                          <option value="custom">✎ Custom Model Identifier...</option>
                        </optgroup>
                      </select>

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Custom Model Input if custom is chosen */}
                  {selectedModelType === 'custom' && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Custom Model Identifier (API Slug)
                      </label>
                      <input
                        type="text"
                        value={customModelSlug}
                        onChange={(e) => {
                          setCustomModelSlug(e.target.value);
                          setModelNameInput(e.target.value);
                        }}
                        placeholder="e.g. anthropic/claude-3-7-sonnet or groq/llama-3.3-70b-versatile"
                        className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] focus:ring-1 focus:ring-[#0278ff] rounded-lg px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 outline-none transition-all"
                        autoFocus
                      />
                    </div>
                  )}

                  {/* Selected Model Details Preview */}
                  {(() => {
                    const selObj = availableModels.find(m => m.id === modelNameInput.trim());
                    return (
                      <div className="p-3.5 rounded-xl bg-[#070b14] border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs text-slate-400 font-medium">Display Name:</span>
                          <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                            {formatModelName(modelNameInput.trim() || activeModel)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">
                          <span>Target Slug:</span>
                          <span className="text-slate-300 font-semibold">{modelNameInput.trim() || '—'}</span>
                        </div>
                        {selObj && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px] font-mono">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {selObj.provider.toUpperCase()}
                            </span>
                            {selObj.context_window && (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {selObj.context_window} Context
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded border ${
                              selObj.supports_vision 
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' 
                                : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            }`}>
                              {selObj.supports_vision ? '👁 Multimodal Vision' : '⚡ Text Reasoning'}
                            </span>
                            {selObj.dynamic && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Live Dynamic
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
                    <div className={`p-3.5 rounded-xl border text-xs ${
                      modelTestResult.success 
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}>
                      <div className="flex items-center gap-2 font-semibold text-xs">
                        {modelTestResult.success ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span>{modelTestResult.success ? '1-Token Verification Succeeded' : 'Model Verification Error'}</span>
                      </div>
                      <div className="mt-2 font-mono text-[11px] leading-relaxed break-words text-slate-200 bg-black/40 p-2.5 rounded-lg border border-white/5">
                        {modelTestResult.message}
                      </div>
                    </div>
                  )}

                  {/* Save Error Feedback */}
                  {modelSaveError && (
                    <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-300 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-rose-200">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Failed to Save Model</span>
                      </div>
                      <div className="mt-2 font-mono text-[11px] leading-relaxed break-words text-slate-200 bg-black/40 p-2.5 rounded-lg border border-white/5">
                        {modelSaveError}
                      </div>
                    </div>
                  )}

                  {/* Reference Documentation Links */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                    <span className="font-semibold text-slate-500">Model docs:</span>
                    <a
                      href="https://docs.anthropic.com/en/docs/about-claude/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      Claude <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-slate-700">·</span>
                    <a
                      href="https://console.groq.com/docs/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      Groq <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-slate-700">·</span>
                    <a
                      href="https://platform.openai.com/docs/models"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      OpenAI <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <span className="text-slate-700">·</span>
                    <a
                      href="https://ai.google.dev/gemini-api/docs/models/gemini"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0278ff] hover:underline flex items-center gap-0.5"
                    >
                      Gemini <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between gap-2.5">
                  <div>
                    {isModelOverridden && (
                      <button
                        type="button"
                        onClick={handleDeleteModelConfig}
                        disabled={savingModel || deletingModel}
                        className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Delete custom model configuration and reset to platform default"
                      >
                        {deletingModel ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Delete Config</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModelModalOpen(false);
                        setModelTestResult(null);
                        setModelSaveError(null);
                      }}
                      disabled={savingModel || deletingModel}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveModel}
                      disabled={savingModel || deletingModel || !modelNameInput.trim()}
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
            </div>
          )}

          {/* Section 3: Execution Engine & Ephemeral Pod Isolation */}
          <div id="section-execution" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'execution' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('execution')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">Execution Engine &amp; Ephemeral Pod Isolation</h2>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold shrink-0">
                        CNCF Restricted PSS
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">
                      Configure test execution boundaries: persistent shared daemon pool vs. single-use non-root Kubernetes pods
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  {/* Unified Active Status Pill */}
                  {isK8sAvailable ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{executionMode === 'k8s_job' ? `K8s Pods (Max: ${maxParallelPods || 10})` : 'Worker Pool (K8s Ready)'}</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5" title="Running in Docker Compose mode. Tests execute in persistent daemon worker pool.">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>Docker Fallback · Worker Pool</span>
                    </span>
                  )}

                  <button
                    type="button"
                    aria-label={collapsedSections.execution ? "Expand Execution section" : "Collapse Execution section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.execution ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-emerald-400" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.execution && (
                <div className="p-6 space-y-6">
                  {/* Mode Selection Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Shared Worker Pool Option */}
                    <div
                      onClick={() => {
                        setExecutionMode('worker_pool');
                        handleSaveEngine('worker_pool');
                      }}
                      className={`p-5 rounded-xl border transition-all cursor-pointer relative ${
                        executionMode === 'worker_pool'
                          ? 'bg-blue-950/20 border-[#0278ff] shadow-lg shadow-blue-500/10'
                          : 'bg-[#070b14] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                            executionMode === 'worker_pool' ? 'bg-[#0278ff]/20 text-[#0278ff]' : 'bg-slate-800 text-slate-400'
                          }`}>
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                              Persistent Worker Pool
                              {executionMode === 'worker_pool' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0278ff]"></span>
                              )}
                            </h4>
                            <p className="text-[11px] text-slate-400">Shared Daemon Workers</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          executionMode === 'worker_pool'
                            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                            : 'bg-slate-800/80 text-slate-500 border-slate-800'
                        }`}>
                          {executionMode === 'worker_pool' ? 'ACTIVE' : 'SELECT'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                        Long-running worker pods polling the PostgreSQL database queue. Reuses browser instances for fastest test startup (&lt;100ms) and minimal cluster resource overhead.
                      </p>

                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 inline-flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-amber-400" />
                          Sub-second Startup
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 inline-flex items-center gap-1.5">
                          <Box className="w-3 h-3 text-slate-400" />
                          Low CPU/RAM Overhead
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 inline-flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 text-blue-400" />
                          Shared Process Tree
                        </span>
                      </div>
                    </div>

                    {/* 2. Kubernetes Ephemeral Pods Option */}
                    <div
                      onClick={() => {
                        if (!isK8sAvailable) {
                          showToast('Kubernetes cluster not detected. Running in Docker Compose mode. Ephemeral pods require a Kubernetes/Helm deployment.', 'info');
                          return;
                        }
                        setExecutionMode('k8s_job');
                        handleSaveEngine('k8s_job');
                      }}
                      className={`p-5 rounded-xl border transition-all relative ${
                        !isK8sAvailable
                          ? 'bg-[#070b14]/60 border-slate-800/60 opacity-60 cursor-not-allowed'
                          : executionMode === 'k8s_job'
                          ? 'bg-emerald-950/20 border-emerald-500 shadow-lg shadow-emerald-500/10 cursor-pointer'
                          : 'bg-[#070b14] border-slate-800 hover:border-slate-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                            executionMode === 'k8s_job' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            <ShieldCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                              Kubernetes Isolated Pods
                              {executionMode === 'k8s_job' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              )}
                            </h4>
                            <p className="text-[11px] text-slate-400">1 Ephemeral Pod per Test Run</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          !isK8sAvailable
                            ? 'bg-slate-800/90 text-slate-500 border-slate-700'
                            : executionMode === 'k8s_job'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800/80 text-slate-500 border-slate-800'
                        }`}>
                          {!isK8sAvailable ? 'REQUIRES K8S' : executionMode === 'k8s_job' ? 'ACTIVE' : 'SELECT'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                        Spawns a dedicated, single-use Kubernetes <code className="text-emerald-300 font-mono">batch/v1 Job</code> Pod per test execution. Guarantees complete Linux namespace, process tree, and memory isolation.
                      </p>

                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap gap-2 text-[10px] font-mono text-emerald-300">
                        <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 inline-flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-emerald-400" />
                          Non-Root (UID 10001)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 inline-flex items-center gap-1.5">
                          <Ban className="w-3 h-3 text-emerald-400" />
                          drop: ALL
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 inline-flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          /dev/shm 1Gi
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Concurrency Limit: Display-only card with clean QA/Dev view and (i) info popover */}
                  <div className="p-4 rounded-xl bg-[#070b14] border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span>Max Concurrent {isK8sAvailable ? 'Runner Pods' : 'Workers'}: {maxParallelPods || 10}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 font-semibold">
                          {isK8sAvailable ? 'Helm Managed' : 'Environment (.env)'}
                        </span>

                        {/* Interactive (i) Info Tooltip / Popover Button */}
                        <div className="relative inline-flex items-center group">
                          <button
                            type="button"
                            onClick={() => setShowConcurrencyInfo(!showConcurrencyInfo)}
                            className="w-4 h-4 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 flex items-center justify-center transition-colors focus:outline-none cursor-pointer"
                            title="View Infrastructure & Capacity Details"
                            aria-label="Infrastructure details"
                          >
                            <Info className="w-2.5 h-2.5" />
                          </button>

                          {/* Floating Popover on hover or click */}
                          <div
                            className={`absolute left-0 top-full mt-2 w-72 sm:w-80 p-3.5 rounded-xl bg-[#0a0f1d] border border-slate-700/90 shadow-2xl backdrop-blur-md z-40 text-xs text-slate-300 space-y-2.5 ${
                              showConcurrencyInfo ? 'block' : 'hidden group-hover:block'
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                              <span className="font-semibold text-white flex items-center gap-1.5 text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                                Infrastructure &amp; Concurrency Details
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowConcurrencyInfo(false);
                                }}
                                className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {isK8sAvailable ? (
                                <>Configured in Helm <code className="text-cyan-300 font-mono text-[10px]">values.yaml</code> via <code className="text-cyan-300 font-mono text-[10px]">execution.maxParallelPods</code>.</>
                              ) : (
                                <>Configured in <code className="text-cyan-300 font-mono text-[10px]">.env</code> via <code className="text-cyan-300 font-mono text-[10px]">MAX_PARALLEL_PODS</code>.</>
                              )}
                            </p>
                            <div className="p-2 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400">
                              Capacity limit: {maxParallelPods || 10} {isK8sAvailable ? 'pods' : 'workers'} × 2.5GB RAM = {(maxParallelPods || 10) * 2.5}GB allocated memory.
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              When runs exceed this capacity, extra runs are placed in a managed FIFO queue and auto-start as soon as a running {isK8sAvailable ? 'pod' : 'worker'} completes.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Clean single-line description for Dev & QA */}
                      <p className="text-xs text-slate-400">
                        Maximum number of test runs that can execute simultaneously. Additional runs queue automatically.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
                      <div className="text-right px-3.5 py-2 rounded-lg bg-slate-900/90 border border-slate-800">
                        <div className="text-lg font-black font-mono text-cyan-400 leading-tight">
                          {maxParallelPods || 10} {isK8sAvailable ? 'Pods' : 'Workers'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">Capacity Limit</div>
                      </div>
                    </div>
                  </div>

                  {/* Enterprise Security Hardening & Pod Sandbox Specifications */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Pod Security Standards &amp; Isolation Guarantees</span>
                      </h4>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                        PSS: Restricted Level
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Process Context</span>
                        <p className="font-mono text-emerald-300 font-semibold">runAsNonRoot: true</p>
                        <p className="text-[10px] text-slate-500">UID: 10001 / GID: 10001 (barely user)</p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Privilege Escalation</span>
                        <p className="font-mono text-emerald-300 font-semibold">allowPrivilegeEscalation: false</p>
                        <p className="text-[10px] text-slate-500">Zero root elevation or setuid vectors</p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Linux Capabilities</span>
                        <p className="font-mono text-emerald-300 font-semibold">drop: [&quot;ALL&quot;]</p>
                        <p className="text-[10px] text-slate-500">All kernel capabilities dropped</p>
                      </div>

                      <div className="p-3 rounded-lg bg-[#070b14] border border-slate-800/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Chromium Memory IPC</span>
                        <p className="font-mono text-emerald-300 font-semibold">/dev/shm (1Gi RAM Disk)</p>
                        <p className="text-[10px] text-slate-500">Prevents headless browser bus error crashes</p>
                      </div>
                    </div>

                    <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2 border-t border-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        <span>Target Namespace: <code className="text-cyan-300 font-mono">{engineClusterStatus?.namespace || 'barely'}</code></span>
                        <span className="text-slate-600">·</span>
                        <span>Automated GC: <code className="text-slate-300 font-mono">ttlSecondsAfterFinished: 180s</code></span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveEngine()}
                        disabled={savingEngine}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {savingEngine ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Save Execution Settings</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          {/* Section 4: Issue Tracking & Defect Management (Jira Cloud) */}
          <div id="section-jira" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'jira' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('jira')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-[#0052cc]/15 text-[#2684ff] flex items-center justify-center border border-[#0052cc]/30 shrink-0">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84A.84.84 0 0 0 21.16 2H11.53zM5.77 7.76c0 2.4 1.96 4.34 4.34 4.34h1.78v1.7c0 2.4 1.94 4.35 4.35 4.35V8.6a.84.84 0 0 0-.84-.84H5.77zm-5.77 5.76c0 2.4 1.95 4.34 4.34 4.34h1.79v1.7c0 2.4 1.94 4.35 4.34 4.35V14.36a.84.84 0 0 0-.84-.84H0z"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">Issue Tracking &amp; Defect Management</h2>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-[#0052cc]/15 text-blue-300 border border-[#0052cc]/30 font-semibold shrink-0">
                        Atlassian Jira Cloud
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">Automate bug ticket creation in Atlassian Jira Cloud upon test failures with full reproduction steps</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  {jiraConfigured ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected ({jiraProjectKey}) · Auto: {jiraAutoCreate ? 'ON' : 'OFF'}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                      Not Configured
                    </span>
                  )}

                  <button
                    type="button"
                    aria-label={collapsedSections.jira ? "Expand Jira section" : "Collapse Jira section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.jira ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#2684ff]" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.jira && (
                <div className="p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-800/60">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Jira Cloud Credentials &amp; Workspace</span>
                    <span className="text-[11px] font-mono text-slate-500">REST API v3 · Basic Auth Token</span>
                  </div>

                  {/* Jira Form Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Jira Cloud Domain / Host</label>
                      <input
                        type="text"
                        value={jiraHost}
                        onChange={(e) => setJiraHost(e.target.value)}
                        placeholder="https://your-company.atlassian.net"
                        className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Atlassian User Email</label>
                      <input
                        type="email"
                        value={jiraEmail}
                        onChange={(e) => setJiraEmail(e.target.value)}
                        placeholder="qa-bot@company.com"
                        className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-300">Atlassian API Token</label>
                        <span className="text-[10px] font-mono text-emerald-400/90 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> AES-256 Encrypted
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type={showJiraToken ? 'text' : 'password'}
                          value={jiraToken}
                          onChange={(e) => setJiraToken(e.target.value)}
                          placeholder={jiraConfigured ? (jiraMaskedToken || '••••••••••••••••') : 'Atlassian API Token from id.atlassian.com'}
                          className="w-full border rounded-lg pl-3 pr-10 py-2 text-xs font-mono outline-none bg-[#070b14] border-slate-800 focus:border-[#0278ff] text-white placeholder:text-slate-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowJiraToken(!showJiraToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                        >
                          {showJiraToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Project Key</label>
                        <input
                          type="text"
                          value={jiraProjectKey}
                          onChange={(e) => setJiraProjectKey(e.target.value.toUpperCase())}
                          placeholder="QA"
                          className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600 uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-300">Issue Type</label>
                        <input
                          type="text"
                          value={jiraIssueType}
                          onChange={(e) => setJiraIssueType(e.target.value)}
                          placeholder="Bug"
                          className="w-full bg-[#070b14] border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Auto-Create Toggle */}
                  <div className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Auto-Create Jira Ticket on Failure</span>
                        {jiraAutoCreate && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/20 text-[#2684ff] border border-blue-500/30">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        When enabled, any test execution failure automatically files a Jira issue with step reproduction history and report links.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={jiraAutoCreate}
                        onChange={(e) => setJiraAutoCreate(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0052cc]"></div>
                    </label>
                  </div>

                  {/* Jira Test Feedback */}
                  {jiraTestResult && (
                    <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      jiraTestResult.success
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    }`}>
                      {jiraTestResult.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="text-[11px] leading-relaxed break-all">{jiraTestResult.message}</span>
                    </div>
                  )}

                  {/* Jira Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                    <div>
                      {jiraConfigured && (
                        confirmDeleteJira ? (
                          <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1 text-xs">
                            <span className="text-rose-300 text-[11px] font-medium">Delete Jira integration?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteIntegration('jira')}
                              disabled={deletingJira}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              {deletingJira ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteJira(false)}
                              disabled={deletingJira}
                              className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteJira(true)}
                            disabled={deletingJira || savingJira || testingJira}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Disconnect and delete Jira integration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Disconnect Integration</span>
                          </button>
                        )
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 justify-end">
                      <button
                        type="button"
                        onClick={handleTestJira}
                        disabled={testingJira}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {testingJira ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0278ff]" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                        <span>Test Connection</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveJira}
                        disabled={savingJira}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0052cc] hover:bg-[#0047b3] text-white shadow-md shadow-blue-900/30 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {savingJira ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>Save Jira Settings</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          {/* Section 5: Incident Alerts & Webhook Notifications (Slack & Microsoft Teams) */}
          <div id="section-notifications" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'notifications' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('notifications')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">Incident Alerts &amp; Webhook Notifications</h2>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold shrink-0">
                        Slack · Microsoft Teams
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">Stream real-time test failure alerts, Block Kit cards, and Adaptive Cards to team channels</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
                    <span className={`px-2 py-0.5 rounded-full border ${slackConfigured ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                      Slack: {slackConfigured ? 'Active' : 'Off'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border ${teamsConfigured ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                      Teams: {teamsConfigured ? 'Active' : 'Off'}
                    </span>
                  </div>

                  <button
                    type="button"
                    aria-label={collapsedSections.notifications ? "Expand Notifications section" : "Collapse Notifications section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.notifications ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-amber-400" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.notifications && (
                <div className="p-6 space-y-6">
                  {/* Default Notification Mechanism Card */}
                  <div className="rounded-xl border border-slate-800/80 bg-[#070b14]/70 p-5 space-y-4 shadow-sm hover:border-slate-700/80 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                          <Sliders className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            Default Notification Channel
                            <span className="text-[10px] font-mono text-slate-500 font-normal">Platform Default</span>
                          </h3>
                          <p className="text-xs text-slate-400">
                            Sets the default alert destination when test runs finish or fail. Can be overridden per run in the Test Configurator.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-auto whitespace-nowrap">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border shadow-sm transition-all ${
                          defaultNotificationMechanism === 'teams'
                            ? 'bg-[#505ac9]/15 text-[#8b95f6] border-[#505ac9]/40'
                            : defaultNotificationMechanism === 'slack'
                            ? 'bg-[#E01E5A]/15 text-[#f5567b] border-[#E01E5A]/40'
                            : defaultNotificationMechanism === 'both'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800/80 text-slate-400 border-slate-700/80'
                        }`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            defaultNotificationMechanism === 'teams'
                              ? 'bg-[#7b83eb] shadow-[0_0_8px_rgba(123,131,235,0.7)]'
                              : defaultNotificationMechanism === 'slack'
                              ? 'bg-[#E01E5A] shadow-[0_0_8px_rgba(224,30,90,0.7)]'
                              : defaultNotificationMechanism === 'both'
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] animate-pulse'
                              : 'bg-slate-500'
                          }`} />
                          <span className="text-[11px] font-medium text-slate-400">Active:</span>
                          <span className="font-semibold text-white">
                            {defaultNotificationMechanism === 'both' 
                              ? 'Both (Slack & Teams)' 
                              : defaultNotificationMechanism === 'slack' 
                              ? 'Slack Only' 
                              : defaultNotificationMechanism === 'teams' 
                              ? 'Teams Only' 
                              : 'Muted'}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                      {[
                        {
                          id: 'both',
                          label: 'Both Slack & Teams',
                          desc: 'Broadcast incidents to both Slack & Teams channels',
                          badge: 'Recommended',
                          activeClass: 'bg-emerald-500/15 border-emerald-500/60 shadow-md shadow-emerald-950/20 text-white',
                          activeText: 'text-emerald-400'
                        },
                        {
                          id: 'slack',
                          label: 'Slack Only',
                          desc: 'Dispatch interactive Block Kit cards to Slack only',
                          activeClass: 'bg-[#E01E5A]/15 border-[#E01E5A]/60 shadow-md shadow-rose-950/20 text-white',
                          activeText: 'text-[#f5567b]'
                        },
                        {
                          id: 'teams',
                          label: 'Teams Only',
                          desc: 'Post rich Adaptive Cards to Microsoft Teams only',
                          activeClass: 'bg-[#505ac9]/15 border-[#505ac9]/60 shadow-md shadow-indigo-950/20 text-white',
                          activeText: 'text-[#8b95f6]'
                        },
                        {
                          id: 'none',
                          label: 'Muted / None',
                          desc: 'Suppress automated webhook channel alerts by default',
                          activeClass: 'bg-slate-800/60 border-slate-700 shadow-md text-white',
                          activeText: 'text-slate-300'
                        }
                      ].map((opt) => {
                        const isSelected = defaultNotificationMechanism === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSaveDefaultMechanism(opt.id as any)}
                            disabled={savingDefaultMechanism}
                            className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? opt.activeClass
                                : 'bg-[#0a0f1d] border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-bold flex items-center gap-1.5 ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                  {opt.id === 'none' && <BellOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                                  {opt.label}
                                </span>
                                {opt.badge && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    {opt.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 leading-snug">{opt.desc}</p>
                            </div>
                            <div className="pt-2 flex items-center justify-end">
                              {isSelected ? (
                                <span className={`text-[10px] font-bold flex items-center gap-1 ${opt.activeText}`}>
                                  <Check className="w-3 h-3" /> Default Active
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-500 hover:text-slate-300">
                                  Click to Set
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 1. Slack Incident Notifications Card */}
                  <div className="rounded-xl border border-slate-800/80 bg-[#070b14]/70 p-5 space-y-4 shadow-sm hover:border-slate-700/80 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#4A154B]/30 text-[#E01E5A] flex items-center justify-center border border-[#4A154B]/50 shrink-0">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            Slack Channel Alerts
                            <span className="text-[10px] font-mono text-slate-500 font-normal">Block Kit</span>
                          </h3>
                          <p className="text-xs text-slate-400">Dispatch interactive incident cards with deep links to your engineering Slack channel</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {slackConfigured ? (
                          <>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Connected
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSlack(true)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete Slack integration"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                      <div className="md:col-span-2 space-y-1">
                        <div className="flex items-center justify-between min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-300">Slack Incoming Webhook URL</label>
                          <span className="text-[10px] font-mono text-emerald-400/90 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> AES-256 Encrypted
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type={showSlackWebhook ? 'text' : 'password'}
                            value={slackWebhookUrl}
                            onChange={(e) => setSlackWebhookUrl(e.target.value)}
                            placeholder={slackConfigured ? (slackMaskedWebhook || 'https://hooks.slack.com/services/...') : 'https://hooks.slack.com/services/...'}
                            className="w-full h-9 border rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono outline-none bg-[#0a0f1d] border-slate-800 focus:border-[#0278ff] text-white placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSlackWebhook(!showSlackWebhook)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                          >
                            {showSlackWebhook ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-300">Alert Trigger</label>
                        </div>
                        <select
                          value={slackNotifyOn}
                          onChange={(e) => setSlackNotifyOn(e.target.value)}
                          className="w-full h-9 bg-[#0a0f1d] border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none cursor-pointer"
                        >
                          <option value="failure_only">Failures Only (Recommended)</option>
                          <option value="all">All Executions (Pass &amp; Fail)</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>
                    </div>

                    {/* Slack Test Feedback */}
                    {slackTestResult && (
                      <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                        slackTestResult.success
                          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                      }`}>
                        {slackTestResult.success ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span className="text-[11px] leading-relaxed break-all">{slackTestResult.message}</span>
                      </div>
                    )}

                    {/* Slack Actions Footer */}
                    <div className="pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        {slackConfigured && (
                          confirmDeleteSlack ? (
                            <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1 text-xs">
                              <span className="text-rose-300 text-[11px] font-medium">Delete Slack integration?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteIntegration('slack')}
                                disabled={deletingSlack}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {deletingSlack ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSlack(false)}
                                disabled={deletingSlack}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSlack(true)}
                              disabled={deletingSlack || savingSlack || testingSlack}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete Slack webhook configuration"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Integration</span>
                            </button>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 justify-end">
                        <button
                          type="button"
                          onClick={handleTestSlack}
                          disabled={testingSlack}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {testingSlack ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0278ff]" /> : <Send className="w-3.5 h-3.5 text-amber-400" />}
                          <span>Send Test Card</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveSlack}
                          disabled={savingSlack}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {savingSlack ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Slack Settings</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2. Microsoft Teams Incident Notifications Card */}
                  <div className="rounded-xl border border-slate-800/80 bg-[#070b14]/70 p-5 space-y-4 shadow-sm hover:border-slate-700/80 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#5059C9]/20 text-[#7B83EB] flex items-center justify-center border border-[#5059C9]/40 shrink-0">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M19.5 7.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM12 9a3 3 0 1 0-6 0 3 3 0 0 0 6 0zm7.5 4.5h-4a2.5 2.5 0 0 0-2.5 2.5v3h9v-3a2.5 2.5 0 0 0-2.5-2.5zm-9 1.5h-3A3.5 3.5 0 0 0 4 18.5V20h7v-5z"/>
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            Microsoft Teams Incident Alerts
                            <span className="text-[10px] font-mono text-slate-500 font-normal">Adaptive Cards</span>
                          </h3>
                          <p className="text-xs text-slate-400">Post rich adaptive cards with full failure diagnostic breakdown to Microsoft Teams channels</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {teamsConfigured ? (
                          <>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Connected
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeams(true)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete Teams integration"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                      <div className="md:col-span-2 space-y-1">
                        <div className="flex items-center justify-between min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-300">Teams Incoming Webhook URL</label>
                          <span className="text-[10px] font-mono text-emerald-400/90 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> AES-256 Encrypted
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type={showTeamsWebhook ? 'text' : 'password'}
                            value={teamsWebhookUrl}
                            onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                            placeholder={teamsConfigured ? (teamsMaskedWebhook || 'https://outlook.office.com/webhook/...') : 'https://outlook.office.com/webhook/...'}
                            className="w-full h-9 border rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono outline-none bg-[#0a0f1d] border-slate-800 focus:border-[#0278ff] text-white placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTeamsWebhook(!showTeamsWebhook)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                          >
                            {showTeamsWebhook ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-300">Alert Trigger</label>
                        </div>
                        <select
                          value={teamsNotifyOn}
                          onChange={(e) => setTeamsNotifyOn(e.target.value)}
                          className="w-full h-9 bg-[#0a0f1d] border border-slate-800 focus:border-[#0278ff] rounded-lg px-3 py-1.5 text-xs font-mono text-white outline-none cursor-pointer"
                        >
                          <option value="failure_only">Failures Only (Recommended)</option>
                          <option value="all">All Executions (Pass &amp; Fail)</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>
                    </div>

                    {/* Teams Test Feedback */}
                    {teamsTestResult && (
                      <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                        teamsTestResult.success
                          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                      }`}>
                        {teamsTestResult.success ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span className="text-[11px] leading-relaxed break-all">{teamsTestResult.message}</span>
                      </div>
                    )}

                    {/* Teams Actions Footer */}
                    <div className="pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        {teamsConfigured && (
                          confirmDeleteTeams ? (
                            <div className="flex items-center gap-2 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1 text-xs">
                              <span className="text-rose-300 text-[11px] font-medium">Delete Teams integration?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteIntegration('teams')}
                                disabled={deletingTeams}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {deletingTeams ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTeams(false)}
                                disabled={deletingTeams}
                                className="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeams(true)}
                              disabled={deletingTeams || savingTeams || testingTeams}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete Microsoft Teams webhook configuration"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Integration</span>
                            </button>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 justify-end">
                        <button
                          type="button"
                          onClick={handleTestTeams}
                          disabled={testingTeams}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {testingTeams ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0278ff]" /> : <Send className="w-3.5 h-3.5 text-amber-400" />}
                          <span>Send Test Card</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveTeams}
                          disabled={savingTeams}
                          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0278ff] hover:bg-[#0062d6] text-white shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {savingTeams ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Teams Settings</span>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

          {/* Section 6: Agent Defaults */}
          <div id="section-defaults" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'defaults' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('defaults')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">Agent Defaults &amp; Execution Guardrails</h2>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold shrink-0">
                        Global Policy
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">Default runtime parameters and timeouts applied to new test executions</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  {collapsedSections.defaults && (
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800 hidden sm:inline-flex items-center gap-1.5 shrink-0">
                      {defaultSettings.length} Parameters Configured
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={collapsedSections.defaults ? "Expand Defaults section" : "Collapse Defaults section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.defaults ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-blue-400" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.defaults && (
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
              )}
            </div>

          {/* Section 7: Database Connection Status */}
          <div id="section-database" className={`rounded-xl border border-slate-800 bg-[#0a0f1d] shadow-xl overflow-hidden transition-all ${activeCategory === 'all' || activeCategory === 'database' ? '' : 'hidden'}`}>
              {/* Collapsible Card Header */}
              <div 
                onClick={() => toggleSection('database')}
                className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/30 transition-colors select-none"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white whitespace-nowrap">Database Connection &amp; Telemetry</h2>
                      <span className="text-[10px] font-mono text-slate-500 hidden sm:inline shrink-0">
                        {dbStatus?.chip || 'PostgreSQL 15 (TLS)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate sm:whitespace-normal">
                      {dbStatus?.subtext || 'PostgreSQL state storage & telemetry'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Dynamic Provider Badge */}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold font-mono border flex items-center gap-1.5 transition-all shrink-0 ${
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
                      {dbStatus?.storage_type === 'gcp' && <Cloud className="w-3.5 h-3.5 text-sky-400" />}
                      {dbStatus?.storage_type === 'aws' && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                      {dbStatus?.storage_type === 'azure' && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                      {(dbStatus?.storage_type === 'supabase' || dbStatus?.storage_type === 'neon') && <Zap className="w-3.5 h-3.5 text-emerald-400" />}
                      {dbStatus?.storage_type === 'docker' && <Server className="w-3.5 h-3.5 text-indigo-400" />}
                      {!['gcp', 'aws', 'azure', 'supabase', 'neon', 'docker'].includes(dbStatus?.storage_type || '') && <Database className="w-3.5 h-3.5 text-indigo-400" />}
                      <span>{dbStatus?.provider_name || 'Docker (Local)'}</span>
                    </span>

                    {/* Live Connection Status Badge */}
                    {dbStatus?.is_connected ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Connected
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-rose-400" />
                        Disconnected
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={collapsedSections.database ? "Expand Database section" : "Collapse Database section"}
                    className="p-1 rounded-lg text-slate-400 hover:text-white transition-transform"
                  >
                    {collapsedSections.database ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-emerald-400" />
                    )}
                  </button>
                </div>
              </div>

              {!collapsedSections.database && (
                <div className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Engine / Version</span>
                      <p className="font-mono text-white font-semibold">{dbStatus?.chip || 'PostgreSQL 15'}</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Storage Provider</span>
                      <p className="font-mono text-white font-semibold">{dbStatus?.provider_name || 'Docker Local'}</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-[#070b14] border border-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Connection Health</span>
                      <p className={`font-mono font-semibold ${dbStatus?.is_connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {dbStatus?.is_connected ? 'Active & TLS Authenticated' : 'Disconnected'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

        </div>
      )}


    </div>
  );
}
