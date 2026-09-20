import unittest
from unittest.mock import patch, MagicMock
from barely_core.integrations.dispatcher import dispatch_cli_notifications

class TestCliDispatcher(unittest.TestCase):

    def test_cli_notifications_empty_when_no_integrations_configured(self):
        run_data = {
            "id": "test-run-123",
            "name": "Checkout Smoke Test",
            "start_url": "https://example.com",
            "success": False,
            "failure_reason": "Cart button not found",
            "model": "anthropic/claude-sonnet-4-5",
            "steps": []
        }
        with patch.dict("os.environ", {}, clear=True):
            outcomes = dispatch_cli_notifications(run_data)
            self.assertIsNone(outcomes["jira_url"])
            self.assertIsNone(outcomes["github_url"])
            self.assertFalse(outcomes["slack_sent"])
            self.assertFalse(outcomes["teams_sent"])
            self.assertEqual(len(outcomes["errors"]), 0)

    @patch("barely_core.integrations.dispatcher.JiraClient")
    @patch("barely_core.integrations.dispatcher.SlackClient")
    def test_cli_notifications_dispatched_on_failure(self, mock_slack_cls, mock_jira_cls):
        mock_jira = MagicMock()
        mock_jira.is_configured = True
        mock_jira.create_issue.return_value = (True, "QA-101", "https://jira.example.com/browse/QA-101", None)
        mock_jira_cls.return_value = mock_jira

        mock_slack = MagicMock()
        mock_slack.is_configured = True
        mock_slack_cls.return_value = mock_slack

        run_data = {
            "id": "fail-run-1",
            "name": "Payment Flow",
            "start_url": "https://shop.example.com",
            "success": False,
            "failure_reason": "Payment gateway timeout",
            "model": "anthropic/claude-sonnet-4-5",
            "steps": []
        }
        with patch.dict("os.environ", {"SLACK_NOTIFY_ON": "failure_only", "DEFAULT_NOTIFICATION_MECHANISM": "slack"}, clear=True):
            outcomes = dispatch_cli_notifications(run_data)
            self.assertEqual(outcomes["jira_url"], "https://jira.example.com/browse/QA-101")
            self.assertTrue(outcomes["slack_sent"])
            mock_jira.create_issue.assert_called_once()
            mock_slack.send_notification.assert_called_once()

    @patch("barely_core.integrations.dispatcher.JiraClient")
    @patch("barely_core.integrations.dispatcher.SlackClient")
    def test_cli_notifications_success_does_not_file_bug(self, mock_slack_cls, mock_jira_cls):
        mock_jira = MagicMock()
        mock_jira.is_configured = True
        mock_jira_cls.return_value = mock_jira

        mock_slack = MagicMock()
        mock_slack.is_configured = True
        mock_slack_cls.return_value = mock_slack

        run_data = {
            "id": "pass-run-1",
            "name": "Login Flow",
            "start_url": "https://shop.example.com",
            "success": True,
            "failure_reason": None,
            "model": "anthropic/claude-sonnet-4-5",
            "steps": []
        }
        with patch.dict("os.environ", {"SLACK_NOTIFY_ON": "all", "DEFAULT_NOTIFICATION_MECHANISM": "slack"}, clear=True):
            outcomes = dispatch_cli_notifications(run_data)
            self.assertIsNone(outcomes["jira_url"])
            self.assertTrue(outcomes["slack_sent"])
            mock_jira.create_issue.assert_not_called()
            mock_slack.send_notification.assert_called_once()

if __name__ == "__main__":
    unittest.main()
