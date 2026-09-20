import os
import sys
import tempfile
import unittest
from pathlib import Path

from barely_cli.secrets import (
    mask_val,
    update_dotenv,
    unset_dotenv
)

try:
    from typer.testing import CliRunner
    from barely_cli.secrets import secret_app
    HAS_TYPER = True
except ImportError:
    HAS_TYPER = False

class TestBarelySecrets(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env_file = Path(self.temp_dir.name) / ".env"
        if HAS_TYPER:
            self.runner = CliRunner()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_mask_val(self):
        self.assertEqual(mask_val(""), "")
        self.assertEqual(mask_val("12345"), "***")
        self.assertEqual(mask_val("sk-ant-api03-abcdef123456"), "sk-ant...3456")

    def test_update_and_unset_dotenv(self):
        # 1. Update (create new key)
        update_dotenv("TEST_KEY", "first_value", self.env_file)
        self.assertTrue(self.env_file.exists())
        content = self.env_file.read_text()
        self.assertIn("TEST_KEY=first_value", content)

        # 2. Update existing key
        update_dotenv("TEST_KEY", "updated_value", self.env_file)
        content = self.env_file.read_text()
        self.assertIn("TEST_KEY=updated_value", content)
        self.assertNotIn("first_value", content)

        # 3. Value with spaces gets quoted
        update_dotenv("SPACED_KEY", "hello world", self.env_file)
        content = self.env_file.read_text()
        self.assertIn('SPACED_KEY="hello world"', content)

        # 4. Unset key
        removed = unset_dotenv("TEST_KEY", self.env_file)
        self.assertTrue(removed)
        content = self.env_file.read_text()
        self.assertNotIn("TEST_KEY=", content)
        self.assertIn("SPACED_KEY=", content)

        # 5. Unset non-existent key
        self.assertFalse(unset_dotenv("NON_EXISTENT", self.env_file))

    def test_cli_set_and_get(self):
        if not HAS_TYPER:
            self.skipTest("Typer not installed in host environment")

        cwd = os.getcwd()
        os.chdir(self.temp_dir.name)
        try:
            # Set a secret
            result = self.runner.invoke(secret_app, ["set", "GROQ_API_KEY", "gsk_testsecret12345"])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Successfully saved GROQ_API_KEY", result.stdout)

            # Get masked
            os.environ["GROQ_API_KEY"] = "gsk_testsecret12345"
            get_res = self.runner.invoke(secret_app, ["get", "GROQ_API_KEY"])
            self.assertEqual(get_res.exit_code, 0)
            self.assertIn("gsk_te...2345", get_res.stdout)

            # Get unmasked with --show
            show_res = self.runner.invoke(secret_app, ["get", "GROQ_API_KEY", "--show"])
            self.assertEqual(show_res.exit_code, 0)
            self.assertIn("gsk_testsecret12345", show_res.stdout)

            # List secrets
            list_res = self.runner.invoke(secret_app, ["list"])
            self.assertEqual(list_res.exit_code, 0)
            self.assertIn("GROQ_API_KEY", list_res.stdout)

            # Unset secret
            unset_res = self.runner.invoke(secret_app, ["unset", "GROQ_API_KEY"])
            self.assertEqual(unset_res.exit_code, 0)
            self.assertIn("Removed GROQ_API_KEY", unset_res.stdout)

            # Test piped input (simulate cat token.txt | barely secret set KEY)
            pipe_res = self.runner.invoke(secret_app, ["set", "OPENAI_API_KEY"], input="sk-openai-piped-secret-9999\n")
            self.assertEqual(pipe_res.exit_code, 0)
            self.assertIn("Successfully saved OPENAI_API_KEY", pipe_res.stdout)
            env_content = (Path(self.temp_dir.name) / ".env").read_text()
            self.assertIn("OPENAI_API_KEY=sk-openai-piped-secret-9999", env_content)
        finally:
            os.chdir(cwd)

if __name__ == "__main__":
    unittest.main()
