import re
import json
import time
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

logger = logging.getLogger("barely_models_provider")

# In-memory cache: { provider: { "timestamp": float, "models": List[Dict] } }
_MODELS_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes cache TTL

# Explicitly excluded or deprecated model patterns (never show in active list)
EXCLUDED_PATTERNS = [
    # Audio / Speech models
    r"whisper",
    r"tts",
    r"transcribe",
    # Embedding models
    r"embedding",
    r"embed",
    # Guard / Moderation models
    r"guard",
    r"moderation",
    # Internal / Retrieval QA
    r"aqa",
    r"babbage",
    r"davinci",
    r"dall-e",
    # Deprecated / Retired models
    r"mixtral-8x7b",
    r"llama-?2",
    r"llama3-8b-8192",
    r"llama3-70b-8192",
    r"gemini-1\.0",
    r"gpt-3\.5",
    r"gpt-4-(?:0314|0613|32k)",
]

EXCLUDED_REGEX = re.compile("|".join(EXCLUDED_PATTERNS), re.IGNORECASE)

def clean_model_name(provider: str, model_id: str, raw_name: Optional[str] = None) -> str:
    """
    Transforms raw model IDs into clean, executive-ready display names.
    Examples:
      - "llama-3.3-70b-versatile" -> "Meta Llama 3.3 70B"
      - "claude-3-7-sonnet-20250219" -> "Claude 3.7 Sonnet"
      - "deepseek-r1-distill-llama-70b" -> "DeepSeek R1 Distill 70B"
      - "gpt-4o-2024-11-20" -> "GPT-4o"
      - "gemini-2.0-flash-001" -> "Gemini 2.0 Flash"
    """
    clean_id = model_id.lower().replace(f"{provider.lower()}/", "").strip()

    # Pre-defined high-fidelity names
    EXACT_NAMES = {
        # Anthropic
        "claude-3-7-sonnet": "Claude 3.7 Sonnet",
        "claude-3-7-sonnet-20250219": "Claude 3.7 Sonnet",
        "claude-3-5-sonnet": "Claude 3.5 Sonnet",
        "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
        "claude-3-5-sonnet-20240620": "Claude 3.5 Sonnet (Legacy)",
        "claude-3-5-haiku": "Claude 3.5 Haiku",
        "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
        "claude-3-opus": "Claude 3 Opus",
        "claude-3-opus-20240229": "Claude 3 Opus",
        # Groq
        "llama-3.3-70b-versatile": "Meta Llama 3.3 70B",
        "llama-3.1-8b-instant": "Meta Llama 3.1 8B",
        "deepseek-r1-distill-llama-70b": "DeepSeek R1 Distill 70B",
        "deepseek-r1-distill-qwen-32b": "DeepSeek R1 Distill Qwen 32B",
        "llama-3.2-11b-vision-preview": "Meta Llama 3.2 11B Vision",
        "llama-3.2-90b-vision-preview": "Meta Llama 3.2 90B Vision",
        "llama-3.2-1b-preview": "Meta Llama 3.2 1B",
        "llama-3.2-3b-preview": "Meta Llama 3.2 3B",
        "gemma2-9b-it": "Gemma 2 9B",
        "qwen-2.5-coder-32b": "Qwen 2.5 Coder 32B",
        # OpenAI
        "gpt-4o": "GPT-4o",
        "gpt-4o-2024-11-20": "GPT-4o (Nov 2024)",
        "gpt-4o-2024-08-06": "GPT-4o (Aug 2024)",
        "gpt-4o-mini": "GPT-4o Mini",
        "gpt-4o-mini-2024-07-18": "GPT-4o Mini",
        "chatgpt-4o-latest": "ChatGPT-4o Latest",
        "o1": "OpenAI o1",
        "o1-2024-12-17": "OpenAI o1",
        "o1-mini": "OpenAI o1 Mini",
        "o1-mini-2024-09-12": "OpenAI o1 Mini",
        "o3-mini": "OpenAI o3-mini",
        "o3-mini-2025-01-31": "OpenAI o3-mini",
        "gpt-4-turbo": "GPT-4 Turbo",
        "gpt-4-turbo-2024-04-09": "GPT-4 Turbo",
        # Gemini
        "gemini-2.0-flash": "Gemini 2.0 Flash",
        "gemini-2.0-flash-001": "Gemini 2.0 Flash",
        "gemini-2.0-flash-lite": "Gemini 2.0 Flash Lite",
        "gemini-2.0-flash-lite-preview-02-05": "Gemini 2.0 Flash Lite",
        "gemini-1.5-pro": "Gemini 1.5 Pro",
        "gemini-1.5-pro-latest": "Gemini 1.5 Pro",
        "gemini-1.5-pro-002": "Gemini 1.5 Pro",
        "gemini-1.5-flash": "Gemini 1.5 Flash",
        "gemini-1.5-flash-latest": "Gemini 1.5 Flash",
        "gemini-1.5-flash-002": "Gemini 1.5 Flash",
        "gemini-1.5-flash-8b": "Gemini 1.5 Flash 8B"
    }

    if clean_id in EXACT_NAMES:
        return EXACT_NAMES[clean_id]

    if raw_name and len(raw_name.strip()) > 3:
        cleaned = re.sub(r'\(.*?\)', '', raw_name).strip()
        if cleaned:
            return cleaned

    # Fallback algorithmic heuristic
    name = clean_id.replace('-', ' ').replace('_', ' ')
    name = re.sub(r'\b\d{8}\b', '', name)  # strip datestamps like 20241022
    name = re.sub(r'\s+', ' ', name).strip()
    return name.title()

def invalidate_models_cache(provider: Optional[str] = None) -> None:
    """Flushes cached model definitions for a specific provider or globally."""
    global _MODELS_CACHE
    if provider:
        p_clean = provider.strip().lower()
        if p_clean in _MODELS_CACHE:
            del _MODELS_CACHE[p_clean]
            logger.info(f"Invalidated model cache for provider '{p_clean}'.")
    else:
        _MODELS_CACHE.clear()
        logger.info("Invalidated all provider model caches.")

def fetch_anthropic_models(api_key: str) -> List[Dict[str, Any]]:
    """
    Dynamically queries Anthropic Models API (GET https://api.anthropic.com/v1/models).
    Filters for active, production Claude models.
    """
    clean_key = api_key.strip()
    if not clean_key or not clean_key.startswith("sk-ant-"):
        return []

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/models",
        headers={
            "x-api-key": clean_key,
            "anthropic-version": "2023-06-01",
            "User-Agent": "Barely-E2E-Tester/1.0"
        },
        method="GET"
    )

    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_items = data.get("data", [])
            
            models = []
            seen_ids = set()

            for item in raw_items:
                raw_id = item.get("id", "")
                if not raw_id or raw_id in seen_ids or EXCLUDED_REGEX.search(raw_id):
                    continue

                seen_ids.add(raw_id)
                display_name = clean_model_name("anthropic", raw_id, item.get("display_name"))
                
                is_recommended = "3-7-sonnet" in raw_id or "3-5-sonnet" in raw_id
                
                models.append({
                    "id": f"anthropic/{raw_id}",
                    "name": display_name,
                    "provider": "anthropic",
                    "supports_vision": True,
                    "recommended": is_recommended,
                    "context_window": "200k",
                    "description": "High-reasoning multimodal intelligence with spatial DOM element awareness.",
                    "dynamic": True
                })

            return models
    except Exception as e:
        logger.debug(f"Anthropic dynamic model discovery failed: {e}")
        return []

def fetch_groq_models(api_key: str) -> List[Dict[str, Any]]:
    """
    Dynamically queries Groq API (GET https://api.groq.com/openai/v1/models).
    Strictly filters for ACTIVE chat/vision inference models (excludes whisper, guard, and deprecated models).
    """
    clean_key = api_key.strip()
    if not clean_key or not clean_key.startswith("gsk_"):
        return []

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/models",
        headers={
            "Authorization": f"Bearer {clean_key}",
            "User-Agent": "Barely-E2E-Tester/1.0"
        },
        method="GET"
    )

    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_items = data.get("data", [])

            models = []
            seen_ids = set()

            for item in raw_items:
                raw_id = item.get("id", "")
                # Must be active and not match audio/guard/deprecated patterns
                if not raw_id or raw_id in seen_ids:
                    continue
                if item.get("active") is False:
                    continue
                if EXCLUDED_REGEX.search(raw_id):
                    continue

                seen_ids.add(raw_id)
                display_name = clean_model_name("groq", raw_id)
                supports_vision = "vision" in raw_id.lower()
                is_recommended = "llama-3.3-70b" in raw_id or "deepseek-r1-distill-llama-70b" in raw_id

                ctx = "128k"
                raw_ctx = item.get("context_window")
                if raw_ctx and isinstance(raw_ctx, int):
                    ctx = f"{raw_ctx // 1024}k"

                models.append({
                    "id": f"groq/{raw_id}",
                    "name": display_name,
                    "provider": "groq",
                    "supports_vision": supports_vision,
                    "recommended": is_recommended,
                    "context_window": ctx,
                    "description": "Ultra-low latency inference on Groq LPUs for rapid regression test execution.",
                    "dynamic": True
                })

            return models
    except Exception as e:
        logger.debug(f"Groq dynamic model discovery failed: {e}")
        return []

def fetch_openai_models(api_key: str) -> List[Dict[str, Any]]:
    """
    Dynamically queries OpenAI API (GET https://api.openai.com/v1/models).
    Strictly filters for ACTIVE chat/vision/reasoning production models.
    Filters out ~90 non-chat models (embeddings, tts, whisper, babbage/davinci, deprecated date snapshots).
    """
    clean_key = api_key.strip()
    if not clean_key or not (clean_key.startswith("sk-") or clean_key.startswith("sess-")):
        return []

    req = urllib.request.Request(
        "https://api.openai.com/v1/models",
        headers={
            "Authorization": f"Bearer {clean_key}",
            "User-Agent": "Barely-E2E-Tester/1.0"
        },
        method="GET"
    )

    # Allowed active prefixes for OpenAI chat & reasoning
    ALLOWED_PREFIXES = ("gpt-4o", "o1", "o3-mini", "gpt-4-turbo", "chatgpt-4o-latest")

    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_items = data.get("data", [])

            models = []
            seen_ids = set()

            # Canonical primary models to prioritize
            CANONICAL_PRIORITY = ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "o1-mini", "gpt-4-turbo"]

            for item in raw_items:
                raw_id = item.get("id", "")
                if not raw_id or raw_id in seen_ids:
                    continue
                if EXCLUDED_REGEX.search(raw_id):
                    continue
                if not any(raw_id.startswith(p) for p in ALLOWED_PREFIXES):
                    continue

                seen_ids.add(raw_id)
                display_name = clean_model_name("openai", raw_id)
                supports_vision = not ("o1-mini" in raw_id or "o3-mini" in raw_id)
                is_recommended = raw_id in ("gpt-4o", "o3-mini")

                models.append({
                    "id": f"openai/{raw_id}",
                    "name": display_name,
                    "provider": "openai",
                    "supports_vision": supports_vision,
                    "recommended": is_recommended,
                    "context_window": "128k" if "o1" not in raw_id else "200k",
                    "description": "Flagship OpenAI model with visual comprehension and prompt adherence.",
                    "dynamic": True
                })

            # Sort canonical models to the top
            models.sort(key=lambda m: (
                0 if any(m["id"].endswith(c) for c in CANONICAL_PRIORITY) else 1,
                m["name"]
            ))

            return models
    except Exception as e:
        logger.debug(f"OpenAI dynamic model discovery failed: {e}")
        return []

def fetch_gemini_models(api_key: str) -> List[Dict[str, Any]]:
    """
    Dynamically queries Google Gemini API (GET https://generativelanguage.googleapis.com/v1beta/models).
    Filters for models supporting 'generateContent' and active generation versions.
    """
    clean_key = api_key.strip()
    if not clean_key:
        return []

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={clean_key}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Barely-E2E-Tester/1.0"},
        method="GET"
    )

    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_items = data.get("models", [])

            models = []
            seen_ids = set()

            for item in raw_items:
                raw_name = item.get("name", "")  # e.g. "models/gemini-2.0-flash"
                model_id = raw_name.replace("models/", "").strip()
                methods = item.get("supportedGenerationMethods", [])

                if not model_id or model_id in seen_ids:
                    continue
                # Must support generateContent (text/multimodal generation)
                if "generateContent" not in methods:
                    continue
                if EXCLUDED_REGEX.search(model_id):
                    continue

                seen_ids.add(model_id)
                display_name = clean_model_name("gemini", model_id, item.get("displayName"))
                is_recommended = "2.0-flash" in model_id or "1.5-pro" in model_id
                
                ctx = "1M" if "flash" in model_id else "2M"

                models.append({
                    "id": f"gemini/{model_id}",
                    "name": display_name,
                    "provider": "gemini",
                    "supports_vision": True,
                    "recommended": is_recommended,
                    "context_window": ctx,
                    "description": "High-throughput multimodal Gemini model with large context capability.",
                    "dynamic": True
                })

            return models
    except Exception as e:
        logger.debug(f"Gemini dynamic model discovery failed: {e}")
        return []

def get_dynamic_models_for_provider(provider: str, api_key: str) -> List[Dict[str, Any]]:
    """
    Retrieves dynamically fetched models for a given provider with in-memory TTL caching.
    """
    p_clean = provider.strip().lower()
    clean_key = api_key.strip()
    if not clean_key:
        return []

    now = time.time()
    cached = _MODELS_CACHE.get(p_clean)
    if cached and (now - cached.get("timestamp", 0)) < CACHE_TTL_SECONDS:
        return cached.get("models", [])

    fetched: List[Dict[str, Any]] = []
    if p_clean == "anthropic":
        fetched = fetch_anthropic_models(clean_key)
    elif p_clean == "groq":
        fetched = fetch_groq_models(clean_key)
    elif p_clean == "openai":
        fetched = fetch_openai_models(clean_key)
    elif p_clean == "gemini":
        fetched = fetch_gemini_models(clean_key)

    if fetched:
        _MODELS_CACHE[p_clean] = {
            "timestamp": now,
            "models": fetched
        }

    return fetched
