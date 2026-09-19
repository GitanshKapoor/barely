import sys
import json
import unittest
from unittest.mock import patch, MagicMock
import io

# Gracefully provide mocks for container-only dependencies if needed
for mod in ["playwright", "playwright.sync_api", "sqlalchemy", "sqlalchemy.orm", "sqlalchemy.ext.declarative"]:
    if mod not in sys.modules:
        m = MagicMock()
        if "sqlalchemy" in mod:
            m.declarative_base = lambda: object
        sys.modules[mod] = m

if "litellm" not in sys.modules:
    mock_litellm = MagicMock()
    mock_litellm.drop_params = True
    sys.modules["litellm"] = mock_litellm

from barely_core.models_provider import (
    clean_model_name,
    EXCLUDED_REGEX,
    fetch_anthropic_models,
    fetch_groq_models,
    fetch_openai_models,
    fetch_gemini_models,
    get_dynamic_models_for_provider,
    invalidate_models_cache,
    _MODELS_CACHE
)
from barely_core.settings import resolve_model_api_key, list_supported_models

class TestDynamicModelsProvider(unittest.TestCase):
    def setUp(self):
        invalidate_models_cache()

    def tearDown(self):
        invalidate_models_cache()

    def test_clean_model_name_exact_mappings(self):
        """Verify high-fidelity clean names for all 4 providers."""
        # Anthropic
        self.assertEqual(clean_model_name("anthropic", "claude-3-7-sonnet"), "Claude 3.7 Sonnet")
        self.assertEqual(clean_model_name("anthropic", "claude-3-5-sonnet-20241022"), "Claude 3.5 Sonnet")
        self.assertEqual(clean_model_name("anthropic", "claude-3-5-haiku-20241022"), "Claude 3.5 Haiku")
        self.assertEqual(clean_model_name("anthropic", "claude-3-opus-20240229"), "Claude 3 Opus")

        # Groq
        self.assertEqual(clean_model_name("groq", "llama-3.3-70b-versatile"), "Meta Llama 3.3 70B")
        self.assertEqual(clean_model_name("groq", "deepseek-r1-distill-llama-70b"), "DeepSeek R1 Distill 70B")
        self.assertEqual(clean_model_name("groq", "llama-3.1-8b-instant"), "Meta Llama 3.1 8B")
        self.assertEqual(clean_model_name("groq", "llama-3.2-11b-vision-preview"), "Meta Llama 3.2 11B Vision")

        # OpenAI
        self.assertEqual(clean_model_name("openai", "gpt-4o"), "GPT-4o")
        self.assertEqual(clean_model_name("openai", "gpt-4o-mini"), "GPT-4o Mini")
        self.assertEqual(clean_model_name("openai", "o3-mini"), "OpenAI o3-mini")
        self.assertEqual(clean_model_name("openai", "o1"), "OpenAI o1")

        # Gemini
        self.assertEqual(clean_model_name("gemini", "gemini-2.0-flash"), "Gemini 2.0 Flash")
        self.assertEqual(clean_model_name("gemini", "gemini-1.5-pro"), "Gemini 1.5 Pro")
        self.assertEqual(clean_model_name("gemini", "gemini-1.5-flash"), "Gemini 1.5 Flash")

    def test_clean_model_name_fallback_formatting(self):
        """Verify fallback algorithmic cleanup for arbitrary novel model slugs."""
        # Datestamp stripping & Title Casing
        self.assertEqual(clean_model_name("openai", "custom-agent-v2-20250101"), "Custom Agent V2")
        self.assertEqual(clean_model_name("groq", "groq/mixtral-test-slug"), "Mixtral Test Slug")

    def test_excluded_regex_filters_non_chat_models(self):
        """Ensure audio, embedding, moderation, and deprecated models match exclusion regex."""
        # Audio
        self.assertTrue(bool(EXCLUDED_REGEX.search("whisper-large-v3")))
        self.assertTrue(bool(EXCLUDED_REGEX.search("tts-1-hd")))
        # Embeddings
        self.assertTrue(bool(EXCLUDED_REGEX.search("text-embedding-3-small")))
        self.assertTrue(bool(EXCLUDED_REGEX.search("embed-english-v3.0")))
        # Moderation / Guards
        self.assertTrue(bool(EXCLUDED_REGEX.search("omni-moderation-latest")))
        self.assertTrue(bool(EXCLUDED_REGEX.search("llama-guard-3-8b")))
        # Deprecated
        self.assertTrue(bool(EXCLUDED_REGEX.search("mixtral-8x7b-32768")))
        self.assertTrue(bool(EXCLUDED_REGEX.search("llama3-8b-8192")))
        self.assertTrue(bool(EXCLUDED_REGEX.search("llama3-70b-8192")))
        self.assertTrue(bool(EXCLUDED_REGEX.search("babbage-002")))

        # Active chat models should NOT match
        self.assertFalse(bool(EXCLUDED_REGEX.search("claude-3-7-sonnet-20250219")))
        self.assertFalse(bool(EXCLUDED_REGEX.search("llama-3.3-70b-versatile")))
        self.assertFalse(bool(EXCLUDED_REGEX.search("gpt-4o")))
        self.assertFalse(bool(EXCLUDED_REGEX.search("o3-mini")))
        self.assertFalse(bool(EXCLUDED_REGEX.search("gemini-2.0-flash")))

    @patch("urllib.request.urlopen")
    def test_fetch_anthropic_models_dynamic(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "data": [
                {"id": "claude-3-7-sonnet-20250219", "display_name": "Claude 3.7 Sonnet"},
                {"id": "claude-3-5-haiku-20241022", "display_name": "Claude 3.5 Haiku"},
                {"id": "claude-deprecated-whisper-test", "display_name": "Whisper"} # Should be excluded
            ]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        models = fetch_anthropic_models("sk-ant-api03-test-123456789012345")
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0]["id"], "anthropic/claude-3-7-sonnet-20250219")
        self.assertEqual(models[0]["name"], "Claude 3.7 Sonnet")
        self.assertTrue(models[0]["dynamic"])
        self.assertTrue(models[0]["recommended"])
        self.assertTrue(models[0]["supports_vision"])

    @patch("urllib.request.urlopen")
    def test_fetch_groq_models_dynamic_filters_inactive(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "data": [
                {"id": "llama-3.3-70b-versatile", "active": True, "context_window": 131072},
                {"id": "deepseek-r1-distill-llama-70b", "active": True, "context_window": 131072},
                {"id": "mixtral-8x7b-32768", "active": False, "context_window": 32768}, # Inactive + deprecated
                {"id": "whisper-large-v3", "active": True, "context_window": 448} # Audio excluded
            ]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        models = fetch_groq_models("gsk_testkey1234567890")
        self.assertEqual(len(models), 2)
        self.assertEqual(models[0]["id"], "groq/llama-3.3-70b-versatile")
        self.assertEqual(models[0]["name"], "Meta Llama 3.3 70B")
        self.assertEqual(models[0]["context_window"], "128k")
        self.assertTrue(models[0]["dynamic"])

    @patch("urllib.request.urlopen")
    def test_fetch_openai_models_dynamic_filters_non_chat(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "data": [
                {"id": "text-embedding-3-small"},
                {"id": "tts-1"},
                {"id": "babbage-002"},
                {"id": "gpt-4o"},
                {"id": "o3-mini"},
                {"id": "dall-e-3"}
            ]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        models = fetch_openai_models("sk-proj-testkey1234567890")
        ids = [m["id"] for m in models]
        self.assertIn("openai/gpt-4o", ids)
        self.assertIn("openai/o3-mini", ids)
        self.assertNotIn("openai/text-embedding-3-small", ids)
        self.assertNotIn("openai/tts-1", ids)
        self.assertNotIn("openai/babbage-002", ids)
        self.assertNotIn("openai/dall-e-3", ids)

    @patch("urllib.request.urlopen")
    def test_fetch_gemini_models_dynamic(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "models": [
                {
                    "name": "models/gemini-2.0-flash",
                    "displayName": "Gemini 2.0 Flash",
                    "supportedGenerationMethods": ["generateContent", "countTokens"]
                },
                {
                    "name": "models/text-embedding-004",
                    "displayName": "Embedding 004",
                    "supportedGenerationMethods": ["embedContent"] # No generateContent
                }
            ]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        models = fetch_gemini_models("AIzaSyTestKey123456789")
        self.assertEqual(len(models), 1)
        self.assertEqual(models[0]["id"], "gemini/gemini-2.0-flash")
        self.assertEqual(models[0]["name"], "Gemini 2.0 Flash")
        self.assertTrue(models[0]["dynamic"])

    @patch("barely_core.models_provider.fetch_anthropic_models")
    def test_in_memory_caching_and_invalidation(self, mock_fetch):
        mock_fetch.return_value = [{"id": "anthropic/claude-3-7-sonnet", "name": "Claude 3.7 Sonnet"}]

        # First call fetches from API
        res1 = get_dynamic_models_for_provider("anthropic", "sk-ant-test")
        self.assertEqual(len(res1), 1)
        self.assertEqual(mock_fetch.call_count, 1)

        # Second call hits cache
        res2 = get_dynamic_models_for_provider("anthropic", "sk-ant-test")
        self.assertEqual(len(res2), 1)
        self.assertEqual(mock_fetch.call_count, 1)

        # Invalidate cache
        invalidate_models_cache("anthropic")

        # Third call fetches again
        res3 = get_dynamic_models_for_provider("anthropic", "sk-ant-test")
        self.assertEqual(len(res3), 1)
        self.assertEqual(mock_fetch.call_count, 2)

    @patch("barely_core.settings.get_setting")
    def test_resolve_model_api_key(self, mock_get_setting):
        mock_get_setting.side_effect = lambda k: {
            "ANTHROPIC_API_KEY": "sk-ant-val",
            "GROQ_API_KEY": "gsk_val",
            "OPENAI_API_KEY": "sk-proj-val",
            "GEMINI_API_KEY": "AIzaSy-val"
        }.get(k)

        self.assertEqual(resolve_model_api_key("anthropic/claude-3-7-sonnet"), "sk-ant-val")
        self.assertEqual(resolve_model_api_key("claude-3-5-sonnet"), "sk-ant-val")
        self.assertEqual(resolve_model_api_key("groq/llama-3.3-70b-versatile"), "gsk_val")
        self.assertEqual(resolve_model_api_key("deepseek-r1-distill-llama-70b"), "gsk_val")
        self.assertEqual(resolve_model_api_key("openai/gpt-4o"), "sk-proj-val")
        self.assertEqual(resolve_model_api_key("o3-mini"), "sk-proj-val")
        self.assertEqual(resolve_model_api_key("gemini/gemini-2.0-flash"), "AIzaSy-val")

    @patch("barely_core.models_provider.get_dynamic_models_for_provider")
    @patch("barely_core.settings.get_setting")
    def test_list_supported_models_filters_unconfigured_providers(self, mock_get_setting, mock_dynamic):
        # Scenario: User has configured keys for Anthropic and Groq only (OpenAI and Gemini unconfigured)
        mock_get_setting.side_effect = lambda k: {
            "ANTHROPIC_API_KEY": "sk-ant-active-key",
            "GROQ_API_KEY": "gsk_active_key",
            "OPENAI_API_KEY": "",
            "GEMINI_API_KEY": None,
            "DEFAULT_MODEL": "anthropic/claude-3-7-sonnet"
        }.get(k)
        mock_dynamic.return_value = None  # Fallback to curated catalog for configured providers

        res = list_supported_models()
        models = res["models"]
        providers_present = set(m["provider"] for m in models)

        # Only Anthropic and Groq models should be present
        self.assertEqual(providers_present, {"anthropic", "groq"})
        self.assertNotIn("openai", providers_present)
        self.assertNotIn("gemini", providers_present)

        # All returned models must be flagged as configured
        for m in models:
            self.assertTrue(m["configured"], f"Model {m['id']} should be marked configured=True")

        # Sync status should reflect exact provider state
        self.assertTrue(res["sync_status"]["anthropic"]["configured"])
        self.assertTrue(res["sync_status"]["groq"]["configured"])
        self.assertFalse(res["sync_status"]["openai"]["configured"])
        self.assertFalse(res["sync_status"]["gemini"]["configured"])

    @patch("barely_core.models_provider.get_dynamic_models_for_provider")
    @patch("barely_core.settings.get_setting")
    def test_list_supported_models_no_keys_configured(self, mock_get_setting, mock_dynamic):
        # Scenario: Clean install with zero keys configured
        mock_get_setting.side_effect = lambda k: {
            "ANTHROPIC_API_KEY": "",
            "GROQ_API_KEY": "",
            "OPENAI_API_KEY": "",
            "GEMINI_API_KEY": "",
            "DEFAULT_MODEL": "anthropic/claude-3-7-sonnet"
        }.get(k)
        mock_dynamic.return_value = None

        res = list_supported_models()
        models = res["models"]
        providers_present = set(m["provider"] for m in models)

        # In clean preview mode with no keys, all 4 catalog providers are present
        self.assertEqual(providers_present, {"anthropic", "groq", "openai", "gemini"})
        # But none are marked configured
        for m in models:
            self.assertFalse(m["configured"], f"Model {m['id']} should be marked configured=False")

if __name__ == "__main__":
    unittest.main()
