import os
import sys
import unittest
from unittest.mock import patch, MagicMock

from barely_cli.doctor import (
    check_python_version,
    check_display_environment,
    check_api_keys,
    check_database,
    check_playwright,
    run_doctor
)

class TestBarelyDoctor(unittest.TestCase):

    def test_python_version_check(self):
        ok, msg = check_python_version()
        self.assertTrue(ok)
        self.assertIn("Python", msg)

    @patch("platform.system", return_value="Darwin")
    def test_display_environment_macos(self, mock_system):
        ok, msg = check_display_environment()
        self.assertTrue(ok)
        self.assertIn("macOS", msg)

    @patch("platform.system", return_value="Linux")
    @patch.dict(os.environ, {}, clear=True)
    def test_display_environment_headless_linux(self, mock_system):
        ok, msg = check_display_environment()
        self.assertTrue(ok)
        self.assertIn("Headless Linux", msg)
        self.assertIn("auto-enable --headless", msg)

    @patch("platform.system", return_value="Linux")
    @patch.dict(os.environ, {"DISPLAY": ":0"}, clear=True)
    def test_display_environment_desktop_linux(self, mock_system):
        ok, msg = check_display_environment()
        self.assertTrue(ok)
        self.assertIn("Linux display detected", msg)

    @patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-ant-test-123456789"}, clear=True)
    def test_api_keys_configured(self):
        ok, msgs = check_api_keys()
        self.assertTrue(ok)
        self.assertTrue(any("Anthropic" in m for m in msgs))
        self.assertTrue(any("sk-ant...6789" in m for m in msgs))

    @patch.dict(os.environ, {}, clear=True)
    def test_api_keys_missing(self):
        ok, msgs = check_api_keys()
        self.assertFalse(ok)
        self.assertTrue(any("No AI provider API key found" in m for m in msgs))

    @patch.dict(os.environ, {}, clear=True)
    def test_database_unconfigured(self):
        ok, msg = check_database()
        self.assertTrue(ok)
        self.assertIn("Standalone", msg)

    @patch("barely_cli.doctor.check_playwright", return_value=(False, "Chromium binary not found"))
    @patch("barely_cli.doctor.check_api_keys", return_value=(False, ["No key"]))
    def test_run_doctor_unhealthy(self, mock_keys, mock_pw):
        result = run_doctor()
        self.assertFalse(result)

    @patch("barely_cli.doctor.check_playwright", return_value=(True, "Chromium browser installed"))
    @patch("barely_cli.doctor.check_api_keys", return_value=(True, ["Anthropic configured"]))
    def test_run_doctor_healthy(self, mock_keys, mock_pw):
        result = run_doctor()
        self.assertTrue(result)

if __name__ == "__main__":
    unittest.main()
