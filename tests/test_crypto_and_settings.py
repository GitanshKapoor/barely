import sys
import os
from pathlib import Path
from unittest.mock import MagicMock

# Add core src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "packages" / "core" / "src"))

# Mock barely_core.db for standalone unit tests
sys.modules["barely_core.db"] = MagicMock()

from barely_core.security.crypto import (
    encrypt_secret, 
    decrypt_secret, 
    mask_secret, 
    mask_database_url,
    get_master_key
)

def test_encryption_roundtrip():
    print("Testing encryption & decryption roundtrip...")
    test_keys = [
        "sk-ant-api03-abcdef1234567890-XYZ",
        "sk-proj-openai-key-998877665544",
        "gsk_groq_production_secret_key_112233",
        "AIzaSyCustomGeminiApiKeySecret4455"
    ]
    for key in test_keys:
        enc = encrypt_secret(key)
        assert enc != key, "Encrypted string should not match plaintext"
        assert enc.startswith("enc:v1:"), "Ciphertext should have enc:v1: prefix"
        dec = decrypt_secret(enc)
        assert dec == key, f"Decryption mismatch: {dec} != {key}"
        print(f"  ✓ Plaintext: {key[:10]}... -> Encrypted length: {len(enc)} -> Decrypted match: True")

def test_randomized_ciphertext():
    print("\nTesting ciphertext randomization (IV/Salt uniqueness)...")
    key = "sk-ant-same-key"
    enc1 = encrypt_secret(key)
    enc2 = encrypt_secret(key)
    assert enc1 != enc2, "Identical plaintexts must produce different ciphertexts"
    assert decrypt_secret(enc1) == key
    assert decrypt_secret(enc2) == key
    print("  ✓ Identical inputs produce distinct ciphertexts: Verified")

def test_secret_masking():
    print("\nTesting zero-leak secret masking...")
    cases = [
        ("sk-ant-api03-abcdef1234567890", "sk-ant-••••••••••••7890"),
        ("sk-openai123456789", "sk-••••••••••••6789"),
        ("gsk_groq123456789", "gsk_••••••••••••6789"),
        ("short", "••••••••")
    ]
    for raw, expected in cases:
        masked = mask_secret(raw)
        assert masked == expected, f"Mask mismatch: {masked} != {expected}"
        print(f"  ✓ {raw} -> {masked}")

def test_db_url_masking():
    print("\nTesting database URL password masking...")
    urls = [
        ("postgresql://barely:secret123@barely-db:5432/barelydb", "postgresql://barely:••••••••@barely-db:5432/barelydb"),
        ("postgresql://admin:Complex_P@ss!@rds.amazonaws.com:5432/prod", "postgresql://admin:••••••••@rds.amazonaws.com:5432/prod")
    ]
    for raw, expected in urls:
        masked = mask_database_url(raw)
        assert masked == expected, f"DB URL mask mismatch: {masked} != {expected}"
        assert "secret123" not in masked
        assert "Complex_P@ss!" not in masked
        print(f"  ✓ Masked DB URL: {masked}")

def test_models_catalog():
    print("\nTesting multi-provider models catalog and documentation registry...")
    from barely_core.settings import list_supported_models, KNOWN_MODELS, PROVIDER_DOCS
    
    catalog = list_supported_models()
    assert "models" in catalog
    assert "providers" in catalog
    assert "default_model" in catalog
    
    # Verify all 4 providers are documented
    for provider in ["anthropic", "groq", "openai", "gemini"]:
        assert provider in catalog["providers"], f"Missing documentation for provider {provider}"
        doc = catalog["providers"][provider]
        assert "docs_url" in doc and doc["docs_url"].startswith("https://"), f"Invalid doc URL for {provider}"
        print(f"  ✓ Provider docs registered: {doc['name']} -> {doc['docs_url']}")
        
    # Verify models catalog contents
    assert len(catalog["models"]) >= 8, f"Expected at least 8 models in catalog, found {len(catalog['models'])}"
    groq_models = [m for m in catalog["models"] if m["provider"] == "groq"]
    anthropic_models = [m for m in catalog["models"] if m["provider"] == "anthropic"]
    assert len(groq_models) >= 2, "Expected Groq models in catalog"
    assert len(anthropic_models) >= 2, "Expected Anthropic models in catalog"
    print(f"  ✓ Models catalog verified: {len(catalog['models'])} models across {len(catalog['providers'])} providers")

def test_models_enabled_filtering():
    print("\nTesting MODELS_ENABLED filtering from Helm / Environment...")
    from barely_core.settings import list_supported_models
    
    # Test with comma-separated list
    os.environ["MODELS_ENABLED"] = "anthropic/claude-3-7-sonnet, openai/gpt-4o"
    try:
        catalog = list_supported_models()
        claude_37 = next((m for m in catalog["models"] if m["id"] == "anthropic/claude-3-7-sonnet"), None)
        gpt_4o = next((m for m in catalog["models"] if m["id"] == "openai/gpt-4o"), None)
        gemini = next((m for m in catalog["models"] if m["id"] == "gemini/gemini-2.0-flash"), None)
        
        assert claude_37 is not None and claude_37["enabled"] is True
        assert gpt_4o is not None and gpt_4o["enabled"] is True
        assert gemini is not None and gemini["enabled"] is False
        print("  ✓ MODELS_ENABLED comma-separated filtering verified")
    finally:
        os.environ.pop("MODELS_ENABLED", None)

    # Test with JSON array
    os.environ["MODELS_ENABLED"] = '["gemini/gemini-2.0-flash", "groq/llama-3.3-70b-versatile"]'
    try:
        catalog = list_supported_models()
        gemini = next((m for m in catalog["models"] if m["id"] == "gemini/gemini-2.0-flash"), None)
        claude = next((m for m in catalog["models"] if m["id"] == "anthropic/claude-3-7-sonnet"), None)
        
        assert gemini is not None and gemini["enabled"] is True
        assert claude is not None and claude["enabled"] is False
        print("  ✓ MODELS_ENABLED JSON array filtering verified")
    finally:
        os.environ.pop("MODELS_ENABLED", None)

def test_settings_zero_config_status():
    print("\nTesting Zero-Config secrets detection status...")
    from barely_core.settings import list_settings_status

    # Set an env var
    os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key-12345678"
    try:
        settings_list = list_settings_status()
        assert isinstance(settings_list, list)
        anthropic_setting = next((s for s in settings_list if s["key"] == "ANTHROPIC_API_KEY"), None)
        assert anthropic_setting is not None
        assert anthropic_setting["is_configured"] is True
        assert anthropic_setting["is_infra_managed"] is True
        assert anthropic_setting["source"] == "environment"
        print(f"  ✓ Zero-Config env detection: is_infra_managed={anthropic_setting['is_infra_managed']}, source={anthropic_setting['source']}")
    finally:
        os.environ.pop("ANTHROPIC_API_KEY", None)

if __name__ == "__main__":
    print("=== RUNNING BARELY CRYPTO & SETTINGS SECURITY TESTS ===")
    test_encryption_roundtrip()
    test_randomized_ciphertext()
    test_secret_masking()
    test_db_url_masking()
    test_models_catalog()
    test_models_enabled_filtering()
    test_settings_zero_config_status()
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")
