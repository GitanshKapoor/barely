import os
import tempfile
import unittest
from pathlib import Path

from barely_cli.models import (
    get_active_model,
    SUPPORTED_MODELS,
    set_model
)

try:
    from typer.testing import CliRunner
    from barely_cli.models import model_app
    HAS_TYPER = True
except ImportError:
    HAS_TYPER = False

class TestBarelyModels(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env_file = Path(self.temp_dir.name) / ".env"
        if HAS_TYPER:
            self.runner = CliRunner()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_active_model_default(self):
        with unittest.mock.patch.dict(os.environ, {}, clear=True):
            active = get_active_model()
            self.assertIn("anthropic", active)

    def test_get_active_model_env_override(self):
        with unittest.mock.patch.dict(os.environ, {"DEFAULT_MODEL": "openai/gpt-4o"}, clear=True):
            active = get_active_model()
            self.assertEqual(active, "openai/gpt-4o")

    def test_cli_list_models(self):
        if not HAS_TYPER:
            self.skipTest("Typer not installed in host environment")

        result = self.runner.invoke(model_app, ["list"])
        self.assertEqual(result.exit_code, 0)
        self.assertIn("anthropic/claude-sonnet-4-5", result.stdout)
        self.assertIn("groq/llama-3.3-70b-versatile", result.stdout)

    def test_cli_get_model(self):
        if not HAS_TYPER:
            self.skipTest("Typer not installed in host environment")

        with unittest.mock.patch.dict(os.environ, {"DEFAULT_MODEL": "gemini/gemini-2.0-flash"}, clear=True):
            result = self.runner.invoke(model_app, ["get"])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("gemini/gemini-2.0-flash", result.stdout)

    def test_cli_set_model(self):
        if not HAS_TYPER:
            self.skipTest("Typer not installed in host environment")

        cwd = os.getcwd()
        os.chdir(self.temp_dir.name)
        try:
            result = self.runner.invoke(model_app, ["set", "groq/llama-3.3-70b-versatile"])
            self.assertEqual(result.exit_code, 0)
            self.assertIn("Successfully set default model to 'groq/llama-3.3-70b-versatile'", result.stdout)
            
            # Verify file content
            content = self.env_file.read_text()
            self.assertIn("DEFAULT_MODEL=groq/llama-3.3-70b-versatile", content)
        finally:
            os.chdir(cwd)

if __name__ == "__main__":
    unittest.main()
