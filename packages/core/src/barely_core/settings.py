import os
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from barely_core.db import SessionLocal, SettingRecord
from barely_core.security.crypto import encrypt_secret, decrypt_secret, mask_secret

logger = logging.getLogger("barely_settings")

# Registry of standard platform settings
KNOWN_SETTINGS = [
    {"key": "ANTHROPIC_API_KEY", "is_secret": True, "label": "Anthropic Claude API Key", "category": "api_keys", "placeholder": "sk-ant-..."},
    {"key": "OPENAI_API_KEY", "is_secret": True, "label": "OpenAI API Key", "category": "api_keys", "placeholder": "sk-..."},
    {"key": "GROQ_API_KEY", "is_secret": True, "label": "Groq API Key", "category": "api_keys", "placeholder": "gsk_..."},
    {"key": "GEMINI_API_KEY", "is_secret": True, "label": "Google Gemini API Key", "category": "api_keys", "placeholder": "AIzaSy..."},
    {"key": "DEFAULT_MODEL", "is_secret": False, "label": "Default AI Model", "category": "model", "placeholder": "anthropic/claude-3-7-sonnet"},
    {"key": "DEFAULT_DEVICE", "is_secret": False, "label": "Default Test Device", "category": "defaults", "placeholder": "desktop"},
    {"key": "MAX_STEPS", "is_secret": False, "label": "Max Steps Per Test", "category": "defaults", "placeholder": "20"},
    {"key": "STRICT_MODE_DEFAULT", "is_secret": False, "label": "Default Strict Mode", "category": "defaults", "placeholder": "false"},
    # Atlassian Jira Integration
    {"key": "JIRA_HOST", "is_secret": False, "label": "Jira Cloud Domain", "category": "jira", "placeholder": "https://company.atlassian.net"},
    {"key": "JIRA_EMAIL", "is_secret": False, "label": "Jira Account Email", "category": "jira", "placeholder": "qa-bot@company.com"},
    {"key": "JIRA_API_TOKEN", "is_secret": True, "label": "Jira API Token", "category": "jira", "placeholder": "Atlassian API token"},
    {"key": "JIRA_PROJECT_KEY", "is_secret": False, "label": "Jira Project Key", "category": "jira", "placeholder": "QA"},
    {"key": "JIRA_ISSUE_TYPE", "is_secret": False, "label": "Jira Issue Type", "category": "jira", "placeholder": "Bug"},
    {"key": "JIRA_AUTO_CREATE", "is_secret": False, "label": "Auto-Create Jira Ticket on Failure", "category": "jira", "placeholder": "false"},
    # Slack Incident Alerts
    {"key": "SLACK_WEBHOOK_URL", "is_secret": True, "label": "Slack Webhook URL", "category": "slack", "placeholder": "https://hooks.slack.com/services/..."},
    {"key": "SLACK_NOTIFY_ON", "is_secret": False, "label": "Slack Notification Trigger", "category": "slack", "placeholder": "failure_only"},
    # Microsoft Teams Incident Alerts
    {"key": "TEAMS_WEBHOOK_URL", "is_secret": True, "label": "Microsoft Teams Webhook URL", "category": "teams", "placeholder": "https://company.webhook.office.com/..."},
    {"key": "TEAMS_NOTIFY_ON", "is_secret": False, "label": "Microsoft Teams Notification Trigger", "category": "teams", "placeholder": "failure_only"},
    # General Incident Notification Defaults
    {"key": "DEFAULT_NOTIFICATION_MECHANISM", "is_secret": False, "label": "Default Notification Channel", "category": "notifications", "placeholder": "both"},
    # Execution Engine & Pod Isolation
    {"key": "EXECUTION_MODE", "is_secret": False, "label": "Execution Engine Mode", "category": "execution", "placeholder": "worker_pool"},
    {"key": "MAX_PARALLEL_PODS", "is_secret": False, "label": "Max Parallel Pods", "category": "execution", "placeholder": "10"}
]

SECRETS_DIR = os.getenv("BARELY_SECRETS_DIR", "/etc/secrets/barely")

def is_k8s_environment() -> bool:
    """Detects if the application is running within a Kubernetes / Helm deployment."""
    return bool(
        os.getenv("KUBERNETES_SERVICE_HOST") 
        or os.getenv("HELM_RELEASE_NAME") 
        or os.path.isdir(os.getenv("BARELY_SECRETS_DIR", "/etc/secrets/barely"))
    )

def get_secrets_mode() -> Dict[str, Any]:
    """
    Determines the active secrets management mode ('ui' vs 'helm').
    Priority:
    1. BARELY_SECRETS_MODE environment variable (forces mode, locked)
    2. SECRETS_MODE setting in database
    3. Default: 'helm' if running in Kubernetes, otherwise 'ui'
    """
    env_mode = os.getenv("BARELY_SECRETS_MODE")
    if env_mode:
        m = env_mode.strip().lower()
        active = "helm" if m in ("helm", "kubernetes", "k8s") else "ui"
        return {
            "mode": active,
            "is_locked_by_env": True,
            "source": "environment_variable",
            "description": (
                "Locked by Helm/Environment (BARELY_SECRETS_MODE=helm). UI secret editing is disabled by policy."
                if active == "helm" else
                "Locked by Environment (BARELY_SECRETS_MODE=ui). UI editing is enabled."
            )
        }

    # Check database setting
    db = SessionLocal()
    db_mode = None
    try:
        rec = db.query(SettingRecord).filter(SettingRecord.key == "SECRETS_MODE").first()
        if rec and rec.value:
            db_mode = rec.value.strip().lower()
    except Exception as e:
        logger.debug(f"Error querying SECRETS_MODE from DB: {e}")
    finally:
        db.close()

    if db_mode in ("helm", "ui"):
        return {
            "mode": db_mode,
            "is_locked_by_env": False,
            "source": "database_setting",
            "description": (
                "Helm / Kubernetes Mode active. Secret inputs are auto-disabled in UI to prevent drift."
                if db_mode == "helm" else
                "Web UI & Database Mode active. Secrets are editable and encrypted at rest."
            )
        }

    # Fallback default: helm if in K8s, else ui
    default_mode = "helm" if is_k8s_environment() else "ui"
    return {
        "mode": default_mode,
        "is_locked_by_env": False,
        "source": "auto_default",
        "description": (
            "Detected Kubernetes environment. Defaulted to Helm mode with UI secret editing auto-disabled."
            if default_mode == "helm" else
            "Defaulted to Web UI mode. Secrets are encrypted with AES-256 in PostgreSQL."
        )
    }

def set_secrets_mode(mode: str) -> Dict[str, Any]:
    """Updates the secrets management mode ('ui' or 'helm')."""
    clean_mode = mode.strip().lower()
    if clean_mode not in ("ui", "helm"):
        raise ValueError("Invalid mode. Must be 'ui' or 'helm'.")

    current = get_secrets_mode()
    if current["is_locked_by_env"]:
        raise ValueError("Cannot change secrets mode: locked by BARELY_SECRETS_MODE environment variable.")

    set_setting("SECRETS_MODE", clean_mode, is_secret=False)
    return get_secrets_mode()

def read_k8s_secret_file(key: str) -> Optional[str]:
    """
    Reads a secret mounted by Kubernetes / Helm / External Secrets Operator (ESO)
    e.g. from /etc/secrets/barely/ANTHROPIC_API_KEY.
    """
    secrets_dir = os.getenv("BARELY_SECRETS_DIR", "/etc/secrets/barely")
    path = os.path.join(secrets_dir, key)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception as e:
            logger.debug(f"Failed to read K8s secret file {path}: {e}")
    return None

def get_deployment_mode() -> Dict[str, Any]:
    """Returns deployment environment metadata (Kubernetes vs Standalone/PaaS)."""
    in_k8s = is_k8s_environment()
    secrets_dir = os.getenv("BARELY_SECRETS_DIR", "/etc/secrets/barely")
    has_mount = os.path.isdir(secrets_dir)
    secrets_mode = get_secrets_mode()
    return {
        "is_kubernetes": in_k8s,
        "mode": "kubernetes" if in_k8s else "standalone",
        "secrets_mode": secrets_mode,
        "provider_name": "Helm & Kubernetes Secrets" if (in_k8s or secrets_mode["mode"] == "helm") else "Encrypted Database Store",
        "subtext": (
            "Secrets managed via Helm values / Kubernetes Secrets / ESO (UI editing auto-disabled)" 
            if secrets_mode["mode"] == "helm" else 
            "Secrets encrypted with AES-256 authenticated cipher at rest in PostgreSQL"
        ),
        "secrets_dir": secrets_dir if has_mount else None,
        "has_volume_mount": has_mount
    }

def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """
    Retrieves a setting by key.
    Resolution priority:
    1. Kubernetes Secret Volume Mount (/etc/secrets/barely/<KEY>)
    2. Encrypted Database Record (PostgreSQL AES-256 authenticated)
    3. Environment Variable (K8s secretKeyRef or local .env)
    """
    # Concurrency limit: Helm / Environment variable has absolute priority as infrastructure capacity
    if key == "MAX_PARALLEL_PODS":
        env_pods = os.getenv("MAX_PARALLEL_PODS") or os.getenv("BARELY_MAX_PARALLEL_PODS")
        if env_pods and env_pods.strip():
            return env_pods.strip()
        default = default or "10"

    # Priority 1: Kubernetes Mounted Secret File (from Helm / ESO volume)
    k8s_val = read_k8s_secret_file(key)
    if k8s_val:
        return k8s_val

    # Priority 2: Encrypted Database Record
    db = SessionLocal()
    try:
        rec = db.query(SettingRecord).filter(SettingRecord.key == key).first()
        if rec and rec.value:
            if rec.is_secret:
                try:
                    return decrypt_secret(rec.value)
                except Exception as e:
                    logger.error(f"Error decrypting setting {key}: {e}")
                    # Fallback to environment if DB decryption fails
                    return os.getenv(key, default)
            return rec.value
    except Exception as e:
        logger.debug(f"DB setting lookup error for {key}: {e}")
    finally:
        db.close()
        
    # Priority 3: Environment variables (K8s envFrom or .env)
    return os.getenv(key, default)

def set_setting(key: str, value: str, is_secret: Optional[bool] = None) -> None:
    """
    Saves or updates a setting.
    If is_secret is True, encrypts the value with authenticated symmetric encryption before saving.
    """
    if is_secret is None:
        # Determine from KNOWN_SETTINGS registry
        matching = next((s for s in KNOWN_SETTINGS if s["key"] == key), None)
        is_secret = matching["is_secret"] if matching else False

    stored_value = encrypt_secret(value) if is_secret else value
    
    db = SessionLocal()
    try:
        rec = db.query(SettingRecord).filter(SettingRecord.key == key).first()
        if rec:
            rec.value = stored_value
            rec.is_secret = is_secret
            rec.updated_at = datetime.utcnow()
        else:
            rec = SettingRecord(
                key=key,
                value=stored_value,
                is_secret=is_secret,
                updated_at=datetime.utcnow()
            )
            db.add(rec)
        db.commit()
    finally:
        db.close()

def delete_setting(key: str) -> bool:
    """Deletes a database setting override, reverting behavior back to environment variables."""
    db = SessionLocal()
    try:
        rec = db.query(SettingRecord).filter(SettingRecord.key == key).first()
        if rec:
            db.delete(rec)
            db.commit()
            return True
        return False
    finally:
        db.close()

def list_settings_status() -> List[Dict[str, Any]]:
    """
    Returns the configuration status of all known settings without leaking secret keys.
    Secrets are masked to guarantee zero-leak security in UI and API responses.
    Distinguishes between Kubernetes Secret (ESO/Helm), Database (Encrypted), and Environment.
    """
    db = SessionLocal()
    db_settings = {}
    try:
        records = db.query(SettingRecord).all()
        for r in records:
            db_settings[r.key] = r
    except Exception as e:
        logger.error(f"Failed to query settings table: {e}")
    finally:
        db.close()

    in_k8s = is_k8s_environment()

    result = []
    for s in KNOWN_SETTINGS:
        key = s["key"]
        is_secret = s["is_secret"]
        db_rec = db_settings.get(key)
        env_val = os.getenv(key)
        k8s_file_val = read_k8s_secret_file(key)
        
        is_configured = False
        is_infra_managed = False
        source = "none"
        masked_val = ""
        updated_at = None
        is_read_only = False

        if k8s_file_val:
            is_configured = True
            is_infra_managed = True
            source = "kubernetes"
            is_read_only = True
            masked_val = mask_secret(k8s_file_val) if is_secret else k8s_file_val
        elif db_rec and db_rec.value:
            is_configured = True
            is_infra_managed = False
            source = "database"
            is_read_only = False
            updated_at = db_rec.updated_at.isoformat() if db_rec.updated_at else None
            if is_secret:
                try:
                    dec = decrypt_secret(db_rec.value)
                    masked_val = mask_secret(dec)
                except Exception:
                    masked_val = "••••••••"
            else:
                masked_val = db_rec.value
        elif env_val:
            is_configured = True
            is_infra_managed = True if (is_secret or in_k8s) else False
            source = "kubernetes" if in_k8s else "environment"
            is_read_only = True if (is_secret or in_k8s) else False
            masked_val = mask_secret(env_val) if is_secret else env_val
        else:
            is_configured = False
            is_infra_managed = False
            source = "none"
            is_read_only = False

        result.append({
            "key": key,
            "label": s["label"],
            "category": s["category"],
            "placeholder": s["placeholder"],
            "is_secret": is_secret,
            "is_configured": is_configured,
            "is_infra_managed": is_infra_managed,
            "source": source,
            "is_read_only": is_read_only,
            "masked_value": masked_val,
            "updated_at": updated_at
        })

    return result

def resolve_model_api_key(model: str) -> Optional[str]:
    """
    Resolves the active API key for a specified LiteLLM model string.
    Supports Anthropic, OpenAI, Groq, and Google Gemini.
    """
    m = (model or "").lower()
    if m.startswith("anthropic/") or "claude" in m:
        return get_setting("ANTHROPIC_API_KEY")
    elif m.startswith("openai/") or "gpt" in m or m.startswith("o1") or m.startswith("o3") or "chatgpt" in m:
        return get_setting("OPENAI_API_KEY")
    elif m.startswith("groq/") or "llama" in m or "mixtral" in m or "deepseek" in m or "gemma" in m or "qwen" in m:
        return get_setting("GROQ_API_KEY")
    elif m.startswith("gemini/") or "gemini" in m:
        return get_setting("GEMINI_API_KEY")
    return None

PROVIDER_DOCS = {
    "anthropic": {
        "name": "Anthropic Claude",
        "docs_url": "https://docs.anthropic.com/en/docs/about-claude/models",
        "description": "State-of-the-art visual acuity, precision DOM understanding, and autonomous step-by-step reasoning"
    },
    "groq": {
        "name": "Groq",
        "docs_url": "https://console.groq.com/docs/models",
        "description": "Ultra-low latency LPU inference engine for open-weights models (Meta Llama 3.3, Mixtral)"
    },
    "openai": {
        "name": "OpenAI",
        "docs_url": "https://platform.openai.com/docs/models",
        "description": "Premier multimodal models (GPT-4o, GPT-4o-mini) with high visual comprehension and tool use"
    },
    "gemini": {
        "name": "Google Gemini",
        "docs_url": "https://ai.google.dev/gemini-api/docs/models/gemini",
        "description": "Massive context window with rapid multimodal DOM inspection and full-page visual reasoning"
    }
}

KNOWN_MODELS = [
    # Anthropic Claude
    {
        "id": "anthropic/claude-3-7-sonnet",
        "name": "Claude 3.7 Sonnet",
        "provider": "anthropic",
        "supports_vision": True,
        "recommended": True,
        "context_window": "200k",
        "description": "Hybrid standard and extended thinking reasoning model for multi-step enterprise QA."
    },
    {
        "id": "anthropic/claude-3-5-sonnet-20241022",
        "name": "Claude 3.5 Sonnet",
        "provider": "anthropic",
        "supports_vision": True,
        "recommended": True,
        "context_window": "200k",
        "description": "High-precision multimodal model with spatial DOM element awareness and resilient error recovery."
    },
    {
        "id": "anthropic/claude-3-5-haiku-20241022",
        "name": "Claude 3.5 Haiku",
        "provider": "anthropic",
        "supports_vision": True,
        "recommended": False,
        "context_window": "200k",
        "description": "Fast, cost-effective vision model for quick smoke tests and straightforward checkout flows."
    },
    {
        "id": "anthropic/claude-3-opus-20240229",
        "name": "Claude 3 Opus",
        "provider": "anthropic",
        "supports_vision": True,
        "recommended": False,
        "context_window": "200k",
        "description": "Deep analytical model for complex enterprise multi-app workflows and non-trivial assertions."
    },
    # Groq LPUs
    {
        "id": "groq/llama-3.3-70b-versatile",
        "name": "Meta Llama 3.3 70B",
        "provider": "groq",
        "supports_vision": False,
        "recommended": True,
        "context_window": "128k",
        "description": "Blazing fast text-based DOM reasoning (~250 tokens/sec) on Groq LPUs for rapid regression execution."
    },
    {
        "id": "groq/llama-3.1-8b-instant",
        "name": "Meta Llama 3.1 8B",
        "provider": "groq",
        "supports_vision": False,
        "recommended": False,
        "context_window": "128k",
        "description": "Ultra-fast ~800 tokens/sec for rapid navigation and high-frequency health pings."
    },
    {
        "id": "groq/deepseek-r1-distill-llama-70b",
        "name": "DeepSeek R1 Distill 70B",
        "provider": "groq",
        "supports_vision": False,
        "recommended": True,
        "context_window": "128k",
        "description": "Open-weights reasoning model running on Groq LPUs for complex problem solving."
    },
    {
        "id": "groq/llama-3.2-11b-vision-preview",
        "name": "Meta Llama 3.2 11B Vision",
        "provider": "groq",
        "supports_vision": True,
        "recommended": False,
        "context_window": "128k",
        "description": "Multimodal vision reasoning on Groq LPUs for visual screenshot inspection."
    },
    # OpenAI
    {
        "id": "openai/gpt-4o",
        "name": "GPT-4o",
        "provider": "openai",
        "supports_vision": True,
        "recommended": True,
        "context_window": "128k",
        "description": "Flagship OpenAI multimodal intelligence with strong visual element grounding and prompt adherence."
    },
    {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini",
        "provider": "openai",
        "supports_vision": True,
        "recommended": False,
        "context_window": "128k",
        "description": "Cost-effective multimodal model for high-volume automated testing pipelines."
    },
    {
        "id": "openai/o3-mini",
        "name": "OpenAI o3-mini",
        "provider": "openai",
        "supports_vision": False,
        "recommended": True,
        "context_window": "200k",
        "description": "High-efficiency reasoning model with deep chain-of-thought analysis for complex workflows."
    },
    # Google Gemini
    {
        "id": "gemini/gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "provider": "gemini",
        "supports_vision": True,
        "recommended": True,
        "context_window": "1M",
        "description": "Next-gen multimodal model with sub-second latency and real-time visual inspection capabilities."
    },
    {
        "id": "gemini/gemini-1.5-pro",
        "name": "Gemini 1.5 Pro",
        "provider": "gemini",
        "supports_vision": True,
        "recommended": True,
        "context_window": "2M",
        "description": "Industry-leading 2 million token context window for massive single-page applications and long audit logs."
    },
    {
        "id": "gemini/gemini-1.5-flash",
        "name": "Gemini 1.5 Flash",
        "provider": "gemini",
        "supports_vision": True,
        "recommended": False,
        "context_window": "1M",
        "description": "Lightweight, high-speed multimodal model engineered for low-cost high-frequency test suites."
    }
]

def list_supported_models() -> Dict[str, Any]:
    """
    Returns the model catalog, provider documentation links, and current active default model.
    Dynamically queries provider APIs when API keys are configured, falling back to curated active models.
    """
    from barely_core.models_provider import get_dynamic_models_for_provider

    default_model = get_setting("DEFAULT_MODEL") or "anthropic/claude-3-7-sonnet"

    # Check which provider keys are configured
    provider_keys = {
        "anthropic": get_setting("ANTHROPIC_API_KEY"),
        "groq": get_setting("GROQ_API_KEY"),
        "openai": get_setting("OPENAI_API_KEY"),
        "gemini": get_setting("GEMINI_API_KEY"),
    }

    # Fetch dynamic models for each configured provider
    dynamic_models_by_provider: Dict[str, List[Dict[str, Any]]] = {}
    provider_sync_status: Dict[str, Dict[str, Any]] = {}

    for provider, key in provider_keys.items():
        if key and key.strip():
            try:
                dyn = get_dynamic_models_for_provider(provider, key.strip())
                if dyn:
                    dynamic_models_by_provider[provider] = dyn
                    provider_sync_status[provider] = {"configured": True, "dynamic": True, "count": len(dyn)}
                else:
                    provider_sync_status[provider] = {"configured": True, "dynamic": False, "count": 0}
            except Exception as ex:
                logger.debug(f"Dynamic fetch error for {provider}: {ex}")
                provider_sync_status[provider] = {"configured": True, "dynamic": False, "error": str(ex)}
        else:
            provider_sync_status[provider] = {"configured": False, "dynamic": False, "count": 0}

    # Assemble complete model catalog: use dynamic models if available, otherwise curated fallback
    combined_models: List[Dict[str, Any]] = []

    for provider in ("anthropic", "groq", "openai", "gemini"):
        if provider in dynamic_models_by_provider and dynamic_models_by_provider[provider]:
            combined_models.extend(dynamic_models_by_provider[provider])
        else:
            provider_defaults = [m for m in KNOWN_MODELS if m["provider"] == provider]
            for m in provider_defaults:
                m_copy = dict(m)
                m_copy["dynamic"] = False
                combined_models.append(m_copy)

    # Check if Helm or environment specified a list of enabled models
    raw_enabled = os.getenv("MODELS_ENABLED") or os.getenv("BARELY_MODELS_ENABLED")
    enabled_set = set()
    if raw_enabled:
        try:
            import json
            parsed = json.loads(raw_enabled)
            if isinstance(parsed, list):
                enabled_set = {str(m).strip() for m in parsed}
        except Exception:
            enabled_set = {m.strip() for m in raw_enabled.split(",") if m.strip()}

    models_list = []
    for m in combined_models:
        m_copy = dict(m)
        m_copy["is_default"] = (m["id"] == default_model)
        m_copy["enabled"] = (m["id"] in enabled_set) if enabled_set else True
        m_copy["configured"] = provider_sync_status.get(m["provider"], {}).get("configured", False)
        models_list.append(m_copy)

    return {
        "models": models_list,
        "providers": PROVIDER_DOCS,
        "default_model": default_model,
        "sync_status": provider_sync_status
    }

def get_integrations_summary() -> Dict[str, Any]:
    """
    Returns the status and non-sensitive configuration for enterprise integrations:
    Atlassian Jira, Slack Webhooks, and Microsoft Teams Webhooks.
    Zero credential leakage: tokens and webhooks are securely masked.
    """
    from barely_core.integrations.jira import JiraClient
    from barely_core.integrations.slack import SlackClient
    from barely_core.integrations.teams import TeamsClient

    jira_client = JiraClient()
    slack_client = SlackClient()
    teams_client = TeamsClient()

    jira_token = get_setting("JIRA_API_TOKEN")
    slack_url = get_setting("SLACK_WEBHOOK_URL")
    teams_url = get_setting("TEAMS_WEBHOOK_URL")

    return {
        "jira": {
            "configured": jira_client.is_configured,
            "host": get_setting("JIRA_HOST") or "",
            "email": get_setting("JIRA_EMAIL") or "",
            "project_key": get_setting("JIRA_PROJECT_KEY") or "QA",
            "issue_type": get_setting("JIRA_ISSUE_TYPE") or "Bug",
            "auto_create": (get_setting("JIRA_AUTO_CREATE") or "false").strip().lower() in ("true", "1", "yes"),
            "has_token": bool(jira_token),
            "masked_token": mask_secret(jira_token) if jira_token else ""
        },
        "slack": {
            "configured": slack_client.is_configured,
            "notify_on": get_setting("SLACK_NOTIFY_ON") or "failure_only",
            "has_webhook": bool(slack_url),
            "masked_webhook": mask_secret(slack_url) if slack_url else ""
        },
        "teams": {
            "configured": teams_client.is_configured,
            "notify_on": get_setting("TEAMS_NOTIFY_ON") or "failure_only",
            "has_webhook": bool(teams_url),
            "masked_webhook": mask_secret(teams_url) if teams_url else ""
        },
        "default_notification_mechanism": (get_setting("DEFAULT_NOTIFICATION_MECHANISM") or "both").strip().lower()
    }


