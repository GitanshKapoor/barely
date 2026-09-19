"""
Unit tests for Barely core settings, Fernet cryptography, secret masking, and model provider resolution.
"""

import os
import unittest
from unittest.mock import patch, MagicMock

from barely_core.security.crypto import (
    encrypt_secret,
    decrypt_secret,
    mask_secret,
    get_master_key,
)
from barely_core.settings import (
    get_model_provider,
    resolve_model_api_key,
    get_setting,
    set_setting,
    delete_setting,
    list_settings_status,
    KNOWN_SETTINGS,
)


class TestSettingsAndCrypto(unittest.TestCase):
    """Verifies AES-256 Fernet secrets management, masking, and model provider routing."""

    def test_fernet_encryption_roundtrip(self):
        """Encrypting and decrypting with the local key returns the exact original plaintext."""
        plaintext = "ghp_1234567890abcdefSecretValue999"
        encrypted = encrypt_secret(plaintext)
        self.assertNotEqual(plaintext, encrypted)
        self.assertTrue(encrypted.startswith("gAAAAA") or len(encrypted) > 20)

        decrypted = decrypt_secret(encrypted)
        self.assertEqual(plaintext, decrypted)

    def test_decrypt_unencrypted_fallback(self):
        """If a value is not Fernet-encrypted (e.g. legacy plain text), decrypt returns original value."""
        plaintext = "not-encrypted-value"
        result = decrypt_secret(plaintext)
        self.assertEqual(plaintext, result)

    def test_secret_masking_tokens(self):
        """Tokens and credentials are appropriately masked for UI and API responses."""
        # Long token
        token = "ghp_abcdef1234567890abcdef1234567890"
        masked = mask_secret(token)
        self.assertTrue(masked.startswith("ghp_"))
        self.assertIn("••••", masked)
        self.assertFalse(token in masked)

        # Webhook URL
        webhook = "https://hooks.slack.com/services/T000/B000/XXXX"
        masked_hook = mask_secret(webhook)
        self.assertTrue(masked_hook.startswith("htt"))
        self.assertIn("••••", masked_hook)

        # Empty / None
        self.assertEqual(mask_secret(""), "")
        self.assertEqual(mask_secret(None), "")

        # Short string
        self.assertEqual(mask_secret("abc"), "••••••••")

    def test_get_model_provider_prefixes(self):
        """Explicit provider prefixes take strict precedence over substring matches."""
        self.assertEqual(get_model_provider("anthropic/claude-3-7-sonnet"), "anthropic")
        self.assertEqual(get_model_provider("groq/openai/gpt-oss-120b"), "groq")
        self.assertEqual(get_model_provider("openai/gpt-4o"), "openai")
        self.assertEqual(get_model_provider("gemini/gemini-2.5-flash"), "gemini")

    def test_get_model_provider_heuristics(self):
        """Models without prefix are resolved via keyword heuristics."""
        self.assertEqual(get_model_provider("claude-sonnet-4-5"), "anthropic")
        self.assertEqual(get_model_provider("llama-3.3-70b-versatile"), "groq")
        self.assertEqual(get_model_provider("gpt-4o-mini"), "openai")
        self.assertEqual(get_model_provider("gemini-1.5-pro"), "gemini")
        self.assertEqual(get_model_provider("nonexistent-unknown-ai"), "unknown")

    def test_resolve_model_api_key_when_empty(self):
        """Resolving an unconfigured model API key returns None cleanly without error."""
        with patch("barely_core.settings.get_setting", return_value=None):
            key = resolve_model_api_key("anthropic/claude-sonnet-4-5")
            self.assertIsNone(key)

    def test_resolve_model_api_key_with_value(self):
        """Resolving a configured model API key returns the decrypted key string."""
        with patch("barely_core.settings.get_setting", return_value="sk-ant-api03-validkey"):
            key = resolve_model_api_key("anthropic/claude-sonnet-4-5")
            self.assertEqual(key, "sk-ant-api03-validkey")

    def test_known_settings_contains_github(self):
        """Verify that GITHUB_TOKEN and GITHUB_REPO are registered in KNOWN_SETTINGS."""
        keys = [s["key"] for s in KNOWN_SETTINGS]
        self.assertIn("GITHUB_TOKEN", keys)
        self.assertIn("GITHUB_REPO", keys)
        self.assertIn("GITHUB_LABELS", keys)
        self.assertIn("GITHUB_AUTO_CREATE", keys)


if __name__ == "__main__":
    unittest.main()
