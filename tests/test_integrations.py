import unittest
from unittest.mock import patch, MagicMock
import json
import os
import sys

# Add packages to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../packages/core/src")))

# Mock barely_core.db
sys.modules["barely_core.db"] = MagicMock()

from barely_core.integrations.jira import JiraClient
from barely_core.integrations.slack import SlackClient
from barely_core.integrations.teams import TeamsClient

class TestJiraIntegration(unittest.TestCase):
    def setUp(self):
        self.client = JiraClient(
            host="https://acme.atlassian.net",
            email="qa@acme.com",
            api_token="test-token-123",
            project_key="QA",
            issue_type="Bug"
        )

    def test_adf_generation(self):
        steps = [
            {"description": "Navigate to login", "thought": "Opening page"},
            {"description": "Type credentials", "thought": "Filling username"},
            {"description": "Clicked Sign In button", "thought": "Submitting"}
        ]
        adf = self.client._build_adf_description(
            test_name="Login Flow Test",
            run_id="run-test-99",
            start_url="https://acme.com/login",
            device="mobile",
            model="Claude 3.5 Sonnet",
            failure_reason="Invalid credentials dialog did not appear",
            steps=steps,
            report_url="http://localhost:3000/runs/run-test-99"
        )

        self.assertEqual(adf["type"], "doc")
        self.assertEqual(adf["version"], 1)
        types = [c["type"] for c in adf["content"]]
        self.assertIn("heading", types)
        self.assertIn("codeBlock", types)
        self.assertIn("orderedList", types)

        ordered_list = next(c for c in adf["content"] if c["type"] == "orderedList")
        self.assertEqual(len(ordered_list["content"]), 3)

    @patch("urllib.request.urlopen")
    def test_test_connection_success(self, mock_urlopen):
        # 1st call for /myself, 2nd call for /project/QA
        mock_resp_myself = MagicMock()
        mock_resp_myself.read.return_value = json.dumps({"displayName": "QA Bot", "emailAddress": "qa@acme.com"}).encode("utf-8")
        mock_resp_myself.__enter__.return_value = mock_resp_myself

        mock_resp_proj = MagicMock()
        mock_resp_proj.read.return_value = json.dumps({"key": "QA", "name": "Quality Assurance"}).encode("utf-8")
        mock_resp_proj.__enter__.return_value = mock_resp_proj

        mock_urlopen.side_effect = [mock_resp_myself, mock_resp_proj]

        success, msg = self.client.test_connection()
        self.assertTrue(success)
        self.assertIn("QA Bot", msg)
        self.assertIn("Quality Assurance", msg)

    @patch("urllib.request.urlopen")
    def test_create_issue_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "id": "10001",
            "key": "QA-404",
            "self": "https://acme.atlassian.net/rest/api/3/issue/10001"
        }).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        run_data = {
            "id": "run-abc",
            "name": "Checkout Flow",
            "start_url": "https://acme.com",
            "device": "desktop",
            "model": "gpt-4o",
            "failure_reason": "Checkout button disabled",
            "steps": []
        }

        success, key, url, err = self.client.create_issue(run_data)
        self.assertTrue(success)
        self.assertEqual(key, "QA-404")
        self.assertEqual(url, "https://acme.atlassian.net/browse/QA-404")
        self.assertIsNone(err)

class TestSlackIntegration(unittest.TestCase):
    def setUp(self):
        self.client = SlackClient(webhook_url="https://hooks.slack.com/services/T00/B00/X00")

    @patch("urllib.request.urlopen")
    def test_test_connection(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"ok"
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        success, msg = self.client.test_connection()
        self.assertTrue(success)
        self.assertIn("verified successfully", msg)

    @patch("urllib.request.urlopen")
    def test_send_failure_notification(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"ok"
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        run_data = {
            "id": "run-fail-1",
            "name": "Cart Test",
            "start_url": "https://acme.com/cart",
            "status": "completed",
            "success": False,
            "device": "desktop",
            "model": "Claude",
            "failure_reason": "Total price calculation mismatch",
            "jira_issue_key": "QA-55",
            "jira_issue_url": "https://acme.atlassian.net/browse/QA-55",
            "steps": [{"description": "Add to cart", "thought": None}]
        }

        success, msg = self.client.send_notification(run_data)
        self.assertTrue(success)
        self.assertIn("delivered", msg)

        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        sent_payload = json.loads(req.data.decode("utf-8"))
        self.assertIn("blocks", sent_payload)
        header_text = sent_payload["blocks"][0]["text"]["text"]
        self.assertIn("Test Failed", header_text)

        # Check that Jira ticket context is included in blocks
        context_block = next((b for b in sent_payload["blocks"] if b.get("type") == "context"), None)
        self.assertIsNotNone(context_block)
        self.assertIn("QA-55", context_block["elements"][0]["text"])

class TestTeamsIntegration(unittest.TestCase):
    def setUp(self):
        self.client = TeamsClient(webhook_url="https://company.webhook.office.com/webhookb2/...")

    @patch("urllib.request.urlopen")
    def test_test_connection(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"1"
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        success, msg = self.client.test_connection()
        self.assertTrue(success)
        self.assertIn("verified successfully", msg)

    @patch("urllib.request.urlopen")
    def test_send_teams_card(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"1"
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        run_data = {
            "id": "run-pass-1",
            "name": "Smoke Test",
            "start_url": "https://acme.com",
            "status": "completed",
            "success": True,
            "device": "desktop",
            "model": "Claude",
            "failure_reason": None,
            "steps": []
        }

        success, msg = self.client.send_notification(run_data)
        self.assertTrue(success)

        call_args = mock_urlopen.call_args
        req = call_args[0][0]
        card = json.loads(req.data.decode("utf-8"))
        self.assertEqual(card["@type"], "MessageCard")
        self.assertEqual(card["themeColor"], "2EB67D")

class TestDispatcherPerRunPreferences(unittest.TestCase):
    @patch("barely_core.integrations.dispatcher.SessionLocal")
    @patch("barely_core.integrations.dispatcher.get_setting")
    @patch("barely_core.integrations.dispatcher.SlackClient")
    @patch("barely_core.integrations.dispatcher.TeamsClient")
    @patch("barely_core.integrations.dispatcher.JiraClient")
    def test_per_run_dispatcher_options(self, mock_jira_cls, mock_teams_cls, mock_slack_cls, mock_get_setting, mock_session_cls):
        from barely_core.integrations.dispatcher import dispatch_run_notifications

        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        mock_run = MagicMock()
        mock_run.id = "run-test-override"
        mock_run.name = "Test Run"
        mock_run.start_url = "https://example.com"
        mock_run.device = "desktop"
        mock_run.status = "failed"
        mock_run.success = False
        mock_run.failure_reason = "Assertion failed"
        mock_run.model = "claude-sonnet-4-5"
        mock_run.jira_issue_key = None
        mock_run.jira_issue_url = None
        mock_run.create_jira_ticket = True
        mock_run.notification_channel = "slack"

        mock_db.query.return_value.filter.return_value.first.return_value = mock_run
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []

        mock_jira = MagicMock()
        mock_jira.is_configured = True
        mock_jira.create_issue.return_value = (True, "QA-101", "https://jira/QA-101", None)
        mock_jira_cls.return_value = mock_jira

        mock_slack = MagicMock()
        mock_slack.is_configured = True
        mock_slack_cls.return_value = mock_slack

        mock_teams = MagicMock()
        mock_teams.is_configured = True
        mock_teams_cls.return_value = mock_teams

        # Global JIRA_AUTO_CREATE is false, but run.create_jira_ticket is True
        mock_get_setting.side_effect = lambda k: {
            "JIRA_AUTO_CREATE": "false",
            "DEFAULT_NOTIFICATION_MECHANISM": "both",
            "SLACK_NOTIFY_ON": "failure_only",
            "TEAMS_NOTIFY_ON": "failure_only"
        }.get(k, "")

        dispatch_run_notifications("run-test-override")

        # 1. Jira issue should be created because of per-run override True
        mock_jira.create_issue.assert_called_once()

        # 2. Slack should be called because channel is 'slack'
        mock_slack.send_notification.assert_called_once()

        # 3. Teams should NOT be called because channel is 'slack'
        mock_teams.send_notification.assert_not_called()

if __name__ == "__main__":
    unittest.main()
