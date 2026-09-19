import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict, Any
from barely_core.settings import get_setting

logger = logging.getLogger("barely_slack")

class SlackClient:
    """
    Slack Incoming Webhook Client.
    Dispatches rich Block Kit incident alerts and test execution summaries.
    Zero external dependencies.
    """

    def __init__(self, webhook_url: Optional[str] = None):
        self._webhook_url = (webhook_url or get_setting("SLACK_WEBHOOK_URL") or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._webhook_url and self._webhook_url.startswith("https://hooks.slack.com"))

    def test_connection(self, webhook_url: Optional[str] = None) -> Tuple[bool, str]:
        """Sends a verification ping to the Slack incoming webhook URL."""
        active_url = (webhook_url or self._webhook_url or "").strip()
        if not active_url:
            return False, "Slack Webhook URL is required (e.g. https://hooks.slack.com/services/...)"
        if not active_url.startswith("https://"):
            return False, "Slack Webhook URL must begin with https://"

        payload = {
            "text": "🔔 *Barely E2E Platform*: Slack incoming webhook connected successfully! Test execution alerts are ready.",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "⚡ Barely Integration Test",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "✅ *Slack Webhook Verified!*\nBarely is connected and ready to stream real-time test execution status and failure alerts to this channel."
                    }
                }
            ]
        }

        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                active_url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_text = response.read().decode("utf-8")
                if "ok" in resp_text.lower():
                    return True, "Slack webhook verified successfully! Check your Slack channel for the confirmation card."
                return True, f"Slack responded: {resp_text}"
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            return False, f"Slack webhook returned HTTP {e.code}: {err_body or e.reason}"
        except Exception as e:
            return False, f"Failed to send Slack test notification: {str(e)}"

    def send_notification(
        self,
        run_data: Dict[str, Any],
        webhook_url: Optional[str] = None,
        base_report_url: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Formats and dispatches a Slack Block Kit notification for a test run.
        Returns: (success: bool, message: str)
        """
        active_url = (webhook_url or self._webhook_url or "").strip()
        if not active_url:
            return False, "Slack Webhook URL not configured"

        run_id = run_data.get("id", "unknown")
        test_name = run_data.get("name") or run_id
        start_url = run_data.get("start_url", "")
        status = run_data.get("status", "unknown")
        success = run_data.get("success")
        device = run_data.get("device", "desktop")
        model = run_data.get("model", "Claude Sonnet")
        failure_reason = run_data.get("failure_reason")
        jira_key = run_data.get("jira_issue_key")
        jira_url = run_data.get("jira_issue_url")
        github_number = run_data.get("github_issue_number")
        github_url = run_data.get("github_issue_url")
        steps_count = len(run_data.get("steps", []))

        web_base = (base_report_url or get_setting("BARELY_WEB_URL") or "http://localhost:3000").rstrip("/")
        report_url = f"{web_base}/runs/{run_id}"

        # Determine visual style
        if success:
            header_text = f"🟢 Test Passed: {test_name}"
            status_text = "PASSED"
        elif status == "cancelled":
            header_text = f"🛑 Test Cancelled: {test_name}"
            status_text = "CANCELLED"
        else:
            header_text = f"🔴 Test Failed: {test_name}"
            status_text = "FAILED"

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": header_text[:150],
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Status:*\n`{status_text}`"},
                    {"type": "mrkdwn", "text": f"*Device & Model:*\n{device.capitalize()} · {model}"},
                    {"type": "mrkdwn", "text": f"*Target URL:*\n<{start_url}|{start_url}>" if start_url else "*Target URL:*\n`N/A`"},
                    {"type": "mrkdwn", "text": f"*Steps Executed:*\n{steps_count} steps"}
                ]
            }
        ]

        # Add failure reason block if failed
        if not success and failure_reason:
            clean_reason = failure_reason.strip()
            if len(clean_reason) > 500:
                clean_reason = clean_reason[:497] + "..."
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Failure Cause:*\n```{clean_reason}```"
                }
            })

        # Add Jira link context if ticket was created
        if jira_key and jira_url:
            blocks.append({
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"🎫 *Jira Issue:* <{jira_url}|{jira_key}>"
                    }
                ]
            })

        # Add GitHub Issue link context if issue was created
        if github_number and github_url:
            blocks.append({
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"🐙 *GitHub Issue:* <{github_url}|#{github_number}>"
                    }
                ]
            })

        # Actions block: View Run Report button
        blocks.append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "🔍 View Interactive Audit",
                        "emoji": True
                    },
                    "url": report_url,
                    "style": "primary" if success else "danger"
                }
            ]
        })

        fallback_text = f"[{status_text}] Barely Run: {test_name} - {report_url}"
        payload = {
            "text": fallback_text,
            "blocks": blocks
        }

        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                active_url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_text = response.read().decode("utf-8")
                logger.info(f"Dispatched Slack notification for run {run_id}")
                return True, f"Slack notification delivered: {resp_text}"
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"Slack webhook error for run {run_id}: HTTP {e.code} - {err_body}")
            return False, f"Slack HTTP error {e.code}: {err_body}"
        except Exception as e:
            logger.error(f"Failed to dispatch Slack alert for run {run_id}: {e}")
            return False, f"Failed to send Slack alert: {str(e)}"
