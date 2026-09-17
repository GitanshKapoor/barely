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
    {"key": "DEFAULT_MODEL", "is_secret": False, "label": "Default AI Model", "category": "model", "placeholder": "anthropic/claude-sonnet-4-5"},
    {"key": "DEFAULT_DEVICE", "is_secret": False, "label": "Default Test Device", "category": "defaults", "placeholder": "desktop"},
    {"key": "MAX_STEPS", "is_secret": False, "label": "Max Steps Per Test", "category": "defaults", "placeholder": "20"},
    {"key": "STRICT_MODE_DEFAULT", "is_secret": False, "label": "Default Strict Mode", "category": "defaults", "placeholder": "false"}
]

def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """
    Retrieves a setting by key.
    Prioritizes the encrypted database record; falls back to environment variables.
    """
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

    result = []
    for s in KNOWN_SETTINGS:
        key = s["key"]
        is_secret = s["is_secret"]
        db_rec = db_settings.get(key)
        env_val = os.getenv(key)
        
        is_configured = False
        source = "none"
        masked_val = ""
        updated_at = None

        if db_rec and db_rec.value:
            is_configured = True
            source = "database"
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
            source = "environment"
            masked_val = mask_secret(env_val) if is_secret else env_val

        result.append({
            "key": key,
            "label": s["label"],
            "category": s["category"],
            "placeholder": s["placeholder"],
            "is_secret": is_secret,
            "is_configured": is_configured,
            "source": source,
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
    elif m.startswith("openai/") or "gpt" in m:
        return get_setting("OPENAI_API_KEY")
    elif m.startswith("groq/") or "llama" in m or "mixtral" in m:
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
        "id": "anthropic/claude-sonnet-4-5",
        "name": "Claude 3.5 Sonnet",
        "provider": "anthropic",
        "supports_vision": True,
        "recommended": True,
        "context_window": "200k",
        "description": "Recommended for end-to-end web QA. Superior spatial awareness, robust DOM locators, and resilient error recovery."
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
        "id": "groq/mixtral-8x7b-32768",
        "name": "Mixtral 8x7B MoE",
        "provider": "groq",
        "supports_vision": False,
        "recommended": False,
        "context_window": "32k",
        "description": "Mixture of Experts architecture on Groq for efficient natural language instruction parsing."
    },
    # OpenAI
    {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (Omni)",
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
    # Google Gemini
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
    """Returns the model catalog, provider documentation links, and current active default model."""
    default_model = get_setting("DEFAULT_MODEL") or "anthropic/claude-sonnet-4-5"
    return {
        "models": KNOWN_MODELS,
        "providers": PROVIDER_DOCS,
        "default_model": default_model
    }

