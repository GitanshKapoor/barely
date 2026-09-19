"""
Unit tests for Barely post-run dispatcher, standalone execution guarantee, and webhook payloads.
"""

import unittest
from unittest.mock import patch, MagicMock

from barely_core.integrations.dispatcher import dispatch_run_notifications
from barely_core.integrations.slack import SlackClient
from barely_core.integrations.teams import TeamsClient


class TestDispatcherAndIntegrations(unittest.TestCase):
    """Verifies standalone execution safety, webhook payload construction, and post-run dispatching."""

    def test_standalone_execution_makes_zero_network_calls(self):
        """
        CRITICAL GUARANTEE: When no Jira, GitHub, Slack, or Teams integrations are configured,
        dispatch_run_notifications completes with 0 external network requests and 0 errors.
        """
        mock_run = MagicMock()
        mock_run.id = "run-standalone-123"
        mock_run.status = "completed"
        mock_run.success = True
        mock_run.failure_reason = None
        mock_run.create_jira_ticket = False
        mock_run.create_github_issue = False
        mock_run.notification_channel = "none"
        mock_run.logs = "Test finished cleanly"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_run
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

        # All integration clients unconfigured
        with patch("barely_core.integrations.dispatcher.SessionLocal", return_value=mock_db), \
             patch("barely_core.integrations.jira.JiraClient.is_configured", False), \
             patch("barely_core.integrations.github.GitHubClient.is_configured", False), \
             patch("barely_core.integrations.slack.SlackClient.is_configured", False), \
             patch("barely_core.integrations.teams.TeamsClient.is_configured", False), \
             patch("urllib.request.urlopen") as mock_urlopen:

            dispatch_run_notifications("run-standalone-123")

            # Zero network calls dispatched
            mock_urlopen.assert_not_called()

    def test_standalone_execution_on_failure_with_disabled_toggles(self):
        """
        Even when a test fails, if create_jira_ticket=False, create_github_issue=False,
        and notification_channel="none", zero network calls are made.
        """
        mock_run = MagicMock()
        mock_run.id = "run-fail-standalone-456"
        mock_run.status = "completed"
        mock_run.success = False
        mock_run.failure_reason = "Element not found"
        mock_run.create_jira_ticket = False
        mock_run.create_github_issue = False
        mock_run.notification_channel = "none"
        mock_run.logs = "Assertion failed"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_run
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

        with patch("barely_core.integrations.dispatcher.SessionLocal", return_value=mock_db), \
             patch("barely_core.integrations.jira.JiraClient.create_issue") as mock_jira, \
             patch("barely_core.integrations.github.GitHubClient.create_issue") as mock_gh, \
             patch("urllib.request.urlopen") as mock_urlopen:

            dispatch_run_notifications("run-fail-standalone-456")

            mock_jira.assert_not_called()
            mock_gh.assert_not_called()
            mock_urlopen.assert_not_called()

    def test_slack_payload_builder_includes_jira_and_github_links(self):
        """Slack Block Kit card correctly attaches Jira and GitHub issue links when present."""
        client = SlackClient(webhook_url="https://hooks.slack.com/services/T00/B00/X00")
        run_data = {
            "id": "run-slack-test-789",
            "name": "Checkout E2E",
            "start_url": "https://example.com/checkout",
            "status": "completed",
            "success": False,
            "failure_reason": "Cart badge mismatch",
            "jira_issue_key": "KAN-42",
            "jira_issue_url": "https://jira.example.com/browse/KAN-42",
            "github_issue_number": 101,
            "github_issue_url": "https://github.com/org/repo/issues/101",
            "steps": []
        }

        sent_payloads = []
        def mock_urlopen(req, timeout=10):
            sent_payloads.append(req.data.decode("utf-8"))
            mock_resp = MagicMock()
            mock_resp.read.return_value = b"ok"
            mock_resp.__enter__.return_value = mock_resp
            return mock_resp

        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            success, msg = client.send_notification(run_data)
            self.assertTrue(success)

        self.assertEqual(len(sent_payloads), 1)
        body = sent_payloads[0]
        self.assertIn("Checkout E2E", body)
        self.assertIn("Cart badge mismatch", body)
        self.assertIn("KAN-42", body)
        self.assertIn("#101", body)
        self.assertIn("https://github.com/org/repo/issues/101", body)

    def test_teams_payload_builder_includes_links(self):
        """Microsoft Teams Adaptive Card attaches Jira and GitHub deep links when present."""
        client = TeamsClient(webhook_url="https://outlook.office.com/webhook/test")
        run_data = {
            "id": "run-teams-test-999",
            "name": "Login Flow",
            "start_url": "https://example.com/login",
            "status": "completed",
            "success": False,
            "failure_reason": "Password rejected",
            "jira_issue_key": "SEC-10",
            "jira_issue_url": "https://jira.example.com/browse/SEC-10",
            "github_issue_number": 404,
            "github_issue_url": "https://github.com/org/repo/issues/404",
            "steps": []
        }

        sent_payloads = []
        def mock_urlopen(req, timeout=10):
            sent_payloads.append(req.data.decode("utf-8"))
            mock_resp = MagicMock()
            mock_resp.read.return_value = b"1"
            mock_resp.__enter__.return_value = mock_resp
            return mock_resp

        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            success, msg = client.send_notification(run_data)
            self.assertTrue(success)

        self.assertEqual(len(sent_payloads), 1)
        body = sent_payloads[0]
        self.assertIn("Login Flow", body)
        self.assertIn("SEC-10", body)
        self.assertIn("#404", body)
        self.assertIn("https://github.com/org/repo/issues/404", body)


if __name__ == "__main__":
    unittest.main()
