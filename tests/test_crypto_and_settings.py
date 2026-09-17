import sys
import os
from pathlib import Path

# Add core src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "packages" / "core" / "src"))

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

if __name__ == "__main__":
    print("=== RUNNING BARELY CRYPTO & SETTINGS SECURITY TESTS ===")
    test_encryption_roundtrip()
    test_randomized_ciphertext()
    test_secret_masking()
    test_db_url_masking()
    test_models_catalog()
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")
