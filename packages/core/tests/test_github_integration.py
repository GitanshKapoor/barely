import sys
import json
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

# Ensure mocks for container-only dependencies
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

from barely_core.integrations.github import GitHubClient


class TestGitHubIntegration(unittest.TestCase):
    def setUp(self):
        self.client = GitHubClient(
            token="ghp_test_token_1234567890",
            repo="GitanshKapoor/barely",
            labels="bug, automated-test"
        )

    def test_configuration_detection(self):
        """Test is_configured property under various combinations."""
        self.assertTrue(self.client.is_configured)

        empty_client = GitHubClient(token="", repo="", labels="")
        self.assertFalse(empty_client.is_configured)

        no_token = GitHubClient(token="", repo="owner/repo")
        self.assertFalse(no_token.is_configured)

        invalid_repo = GitHubClient(token="ghp_123", repo="invalid-repo-without-slash")
        self.assertFalse(invalid_repo.is_configured)

        valid_client = GitHubClient(token="github_pat_123", repo="org/app")
        self.assertTrue(valid_client.is_configured)

    def test_clean_repo_sanitization(self):
        """Verify URL and path sanitization for owner/repo targets."""
        self.assertEqual(self.client._clean_repo("https://github.com/owner/repo"), "owner/repo")
        self.assertEqual(self.client._clean_repo("https://github.com/owner/repo.git"), "owner/repo")
        self.assertEqual(self.client._clean_repo("http://github.com/owner/repo/"), "owner/repo")
        self.assertEqual(self.client._clean_repo("github.com/owner/repo"), "owner/repo")
        self.assertEqual(self.client._clean_repo("  /owner/repo/  "), "owner/repo")

    def test_markdown_body_generation(self):
        """Verify the generated Markdown issue contains all audit sections."""
        body = self.client._build_markdown_body(
            test_name="Checkout Flow E2E",
            run_id="run_abc123",
            start_url="https://example.com/shop",
            device="desktop",
            model="Claude 3.7 Sonnet",
            failure_reason="Assertion failed: 'Complete Purchase' button was disabled",
            steps=[
                {"description": "Clicked 'Add to Cart' button", "thought": "Need to add product first"},
                {"description": "Navigated to /checkout", "thought": "Proceeding to checkout"}
            ],
            report_url="http://localhost:3000/runs/run_abc123"
        )

        self.assertIn("## 🚨 Barely Automated Test Failure: Checkout Flow E2E", body)
        self.assertIn("`run_abc123`", body)
        self.assertIn("https://example.com/shop", body)
        self.assertIn("Claude 3.7 Sonnet", body)
        self.assertIn("Assertion failed: 'Complete Purchase' button was disabled", body)
        self.assertIn("1. **Action:** Clicked 'Add to Cart' button", body)
        self.assertIn("Agent Reasoning:* _Need to add product first_", body)
        self.assertIn("2. **Action:** Navigated to /checkout", body)
        self.assertIn("http://localhost:3000/runs/run_abc123", body)

    @patch("urllib.request.urlopen")
    def test_connection_success(self, mock_urlopen):
        """Test successful GitHub API connection test."""
        # Mock 1: /user
        mock_resp_user = MagicMock()
        mock_resp_user.read.return_value = json.dumps({"login": "testuser", "name": "Test User"}).encode("utf-8")
        mock_resp_user.__enter__.return_value = mock_resp_user

        # Mock 2: /repos/GitanshKapoor/barely
        mock_resp_repo = MagicMock()
        mock_resp_repo.read.return_value = json.dumps({"full_name": "GitanshKapoor/barely", "has_issues": True}).encode("utf-8")
        mock_resp_repo.__enter__.return_value = mock_resp_repo

        mock_urlopen.side_effect = [mock_resp_user, mock_resp_repo]

        success, message = self.client.test_connection()
        self.assertTrue(success)
        self.assertIn("@testuser", message)
        self.assertIn("GitanshKapoor/barely", message)

    @patch("urllib.request.urlopen")
    def test_connection_invalid_token(self, mock_urlopen):
        """Test authentication error handling (401 Unauthorized)."""
        err = urllib.error.HTTPError(
            url="https://api.github.com/user",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=MagicMock(read=lambda: json.dumps({"message": "Bad credentials"}).encode("utf-8"))
        )
        mock_urlopen.side_effect = err

        success, message = self.client.test_connection(token="ghp_invalid_token")
        self.assertFalse(success)
        self.assertIn("Authentication failed", message)

    @patch("urllib.request.urlopen")
    def test_connection_repo_not_found(self, mock_urlopen):
        """Test repo access error handling (404 Not Found)."""
        # User auth passes
        mock_resp_user = MagicMock()
        mock_resp_user.read.return_value = json.dumps({"login": "testuser"}).encode("utf-8")
        mock_resp_user.__enter__.return_value = mock_resp_user

        # Repo fails with 404
        err_repo = urllib.error.HTTPError(
            url="https://api.github.com/repos/owner/unknown-repo",
            code=404,
            msg="Not Found",
            hdrs={},
            fp=MagicMock(read=lambda: json.dumps({"message": "Not Found"}).encode("utf-8"))
        )
        mock_urlopen.side_effect = [mock_resp_user, err_repo]

        success, message = self.client.test_connection(repo="owner/unknown-repo")
        self.assertFalse(success)
        self.assertIn("not found or token lacks", message)

    @patch("urllib.request.urlopen")
    def test_create_issue_success(self, mock_urlopen):
        """Test creating a GitHub issue successfully."""
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "number": 108,
            "html_url": "https://github.com/GitanshKapoor/barely/issues/108",
            "title": "[Barely Defect] Search Test"
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        run_data = {
            "id": "run_999",
            "name": "Search Test",
            "start_url": "https://google.com",
            "device": "desktop",
            "model": "Meta Llama 3.3 70B",
            "failure_reason": "Timeout waiting for results",
            "steps": [{"description": "Typed 'hello'", "thought": "search input"}]
        }

        success, issue_num, issue_url, error = self.client.create_issue(run_data)
        self.assertTrue(success)
        self.assertEqual(issue_num, 108)
        self.assertEqual(issue_url, "https://github.com/GitanshKapoor/barely/issues/108")
        self.assertIsNone(error)

    def test_create_issue_unconfigured(self):
        """Test create_issue aborts gracefully if unconfigured."""
        empty_client = GitHubClient(token="", repo="")
        success, issue_num, issue_url, error = empty_client.create_issue({"id": "test"})
        self.assertFalse(success)
        self.assertIsNone(issue_num)
        self.assertIn("not fully configured", error)


if __name__ == "__main__":
    unittest.main()
