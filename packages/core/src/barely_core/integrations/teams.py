import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict, Any
from barely_core.settings import get_setting

logger = logging.getLogger("barely_teams")

class TeamsClient:
    """
    Microsoft Teams Incoming Webhook Client.
    Dispatches rich MessageCard / Adaptive Card incident notifications to Teams channels.
    Compatible with Microsoft 365 Connectors and Power Automate / Teams Workflows webhooks.
    Zero external dependencies.
    """

    def __init__(self, webhook_url: Optional[str] = None):
        self._webhook_url = (webhook_url or get_setting("TEAMS_WEBHOOK_URL") or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._webhook_url and (
            "office.com" in self._webhook_url or 
            "azure.com" in self._webhook_url or 
            "powerautomate" in self._webhook_url or
            self._webhook_url.startswith("https://")
        ))

    def test_connection(self, webhook_url: Optional[str] = None) -> Tuple[bool, str]:
        """Sends a verification card to the Microsoft Teams incoming webhook URL."""
        active_url = (webhook_url or self._webhook_url or "").strip()
        if not active_url:
            return False, "Microsoft Teams Webhook URL is required"
        if not active_url.startswith("https://"):
            return False, "Teams Webhook URL must begin with https://"

        card = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "themeColor": "0278FF",
            "summary": "Barely Integration Test Ping",
            "sections": [
                {
                    "activityTitle": "⚡ Barely Integration Test",
                    "activitySubtitle": "Microsoft Teams Incident Alerts",
                    "facts": [
                        {"name": "Status", "value": "✅ Connected"},
                        {"name": "Trigger", "value": "Manual Test Verification"},
                        {"name": "Message", "value": "Barely is ready to dispatch test results & failure cards to this Teams channel."}
                    ],
                    "markdown": True
                }
            ]
        }

        try:
            req_data = json.dumps(card).encode("utf-8")
            req = urllib.request.Request(
                active_url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_text = response.read().decode("utf-8", errors="ignore")
                return True, "Microsoft Teams webhook verified successfully! Check your Teams channel."
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            return False, f"Teams webhook returned HTTP {e.code}: {err_body or e.reason}"
        except Exception as e:
            return False, f"Failed to send Teams test notification: {str(e)}"

    def send_notification(
        self,
        run_data: Dict[str, Any],
        webhook_url: Optional[str] = None,
        base_report_url: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Formats and dispatches a Microsoft Teams MessageCard for a test run.
        Returns: (success: bool, message: str)
        """
        active_url = (webhook_url or self._webhook_url or "").strip()
        if not active_url:
            return False, "Teams Webhook URL not configured"

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
        steps_count = len(run_data.get("steps", []))

        web_base = (base_report_url or get_setting("BARELY_WEB_URL") or "http://localhost:3000").rstrip("/")
        report_url = f"{web_base}/runs/{run_id}"

        # Visual styling
        if success:
            theme_color = "2EB67D" # Green
            title_prefix = "🟢 Test Passed"
            status_text = "PASSED"
        elif status == "cancelled":
            theme_color = "FFA500" # Orange
            title_prefix = "🛑 Test Cancelled"
            status_text = "CANCELLED"
        else:
            theme_color = "E01E5A" # Red
            title_prefix = "🔴 Test Failed"
            status_text = "FAILED"

        facts = [
            {"name": "Status", "value": f"**{status_text}**"},
            {"name": "Run ID", "value": f"`{run_id}`"},
            {"name": "Target URL", "value": f"[{start_url}]({start_url})" if start_url else "N/A"},
            {"name": "Environment", "value": f"{device.capitalize()} · {model}"},
            {"name": "Steps Executed", "value": str(steps_count)}
        ]

        if not success and failure_reason:
            facts.append({"name": "Failure Reason", "value": f"`{failure_reason[:300]}`"})

        if jira_key and jira_url:
            facts.append({"name": "Jira Ticket", "value": f"[{jira_key}]({jira_url})"})

        actions = [
            {
                "@type": "OpenUri",
                "name": "🔍 View Execution Audit",
                "targets": [{"os": "default", "uri": report_url}]
            }
        ]

        if jira_url:
            actions.append({
                "@type": "OpenUri",
                "name": f"🎫 Jira ({jira_key})",
                "targets": [{"os": "default", "uri": jira_url}]
            })

        card = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "themeColor": theme_color,
            "summary": f"{title_prefix}: {test_name}",
            "sections": [
                {
                    "activityTitle": f"{title_prefix}: {test_name}",
                    "activitySubtitle": "Barely Autonomous E2E Testing Platform",
                    "facts": facts,
                    "markdown": True
                }
            ],
            "potentialAction": actions
        }

        try:
            req_data = json.dumps(card).encode("utf-8")
            req = urllib.request.Request(
                active_url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_text = response.read().decode("utf-8", errors="ignore")
                logger.info(f"Dispatched Teams notification for run {run_id}")
                return True, f"Teams notification delivered: {resp_text}"
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"Teams webhook error for run {run_id}: HTTP {e.code} - {err_body}")
            return False, f"Teams HTTP error {e.code}: {err_body}"
        except Exception as e:
            logger.error(f"Failed to dispatch Teams alert for run {run_id}: {e}")
            return False, f"Failed to send Teams alert: {str(e)}"
