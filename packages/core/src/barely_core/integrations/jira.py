import json
import base64
import logging
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict, Any, List
from barely_core.settings import get_setting

logger = logging.getLogger("barely_jira")

class JiraClient:
    """
    Atlassian Jira Cloud REST API v3 Client.
    Zero external dependencies — implements HTTP Basic authentication and
    Atlassian Document Format (ADF) description generation using Python standard library.
    """

    def __init__(
        self,
        host: Optional[str] = None,
        email: Optional[str] = None,
        api_token: Optional[str] = None,
        project_key: Optional[str] = None,
        issue_type: Optional[str] = None
    ):
        self._host = (host or get_setting("JIRA_HOST") or get_setting("JIRA_DOMAIN") or "").strip().rstrip("/")
        if self._host and not self._host.startswith("http://") and not self._host.startswith("https://"):
            self._host = f"https://{self._host}"
        
        self._email = (email or get_setting("JIRA_EMAIL") or "").strip()
        self._api_token = (api_token or get_setting("JIRA_API_TOKEN") or "").strip()
        self._project_key = (project_key or get_setting("JIRA_PROJECT_KEY") or "QA").strip().upper()
        self._issue_type = (issue_type or get_setting("JIRA_ISSUE_TYPE") or "Bug").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._host and self._email and self._api_token and self._project_key)

    def _get_auth_header(self) -> str:
        credentials = f"{self._email}:{self._api_token}"
        encoded = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")
        return f"Basic {encoded}"

    def test_connection(
        self,
        host: Optional[str] = None,
        email: Optional[str] = None,
        api_token: Optional[str] = None,
        project_key: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Pings Jira Cloud REST API to verify authentication and project access.
        Returns (success: bool, message: str).
        """
        active_host = (host or self._host or "").strip().rstrip("/")
        if active_host and not active_host.startswith("http://") and not active_host.startswith("https://"):
            active_host = f"https://{active_host}"
        active_email = (email or self._email or "").strip()
        active_token = (api_token or self._api_token or "").strip()
        active_project = (project_key or self._project_key or "").strip().upper()

        if not active_host:
            return False, "Jira Host / Domain is required (e.g. https://your-company.atlassian.net)"
        if not active_email:
            return False, "Jira user email is required"
        if not active_token:
            return False, "Jira API token is required"

        # 1. Verify User Authentication (/rest/api/3/myself)
        auth_str = f"{active_email}:{active_token}"
        auth_header = f"Basic {base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')}"
        headers = {
            "Authorization": auth_header,
            "Accept": "application/json",
            "User-Agent": "Barely-E2E-Agent/2.0"
        }

        user_url = f"{active_host}/rest/api/3/myself"
        try:
            req = urllib.request.Request(user_url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=12) as response:
                user_data = json.loads(response.read().decode("utf-8"))
                display_name = user_data.get("displayName", active_email)
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                detail = "; ".join(err_body.get("errorMessages", [])) or str(err_body)
            except Exception:
                detail = f"HTTP {e.code} {e.reason}"
            return False, f"Authentication failed: {detail}"
        except Exception as e:
            return False, f"Connection to Jira failed: {str(e)}"

        # 2. Verify Project Access if Project Key is supplied (/rest/api/3/project/{key})
        if active_project:
            proj_url = f"{active_host}/rest/api/3/project/{active_project}"
            try:
                req = urllib.request.Request(proj_url, headers=headers, method="GET")
                with urllib.request.urlopen(req, timeout=12) as response:
                    proj_data = json.loads(response.read().decode("utf-8"))
                    proj_name = proj_data.get("name", active_project)
            except urllib.error.HTTPError as e:
                return False, f"Connected as '{display_name}', but project '{active_project}' was not found or inaccessible (HTTP {e.code})."
            except Exception as e:
                return False, f"Failed to verify project '{active_project}': {str(e)}"

            return True, f"Successfully connected to Jira as {display_name}! Verified project: {proj_name} ({active_project})."

        return True, f"Successfully connected to Jira as {display_name}!"

    def _build_adf_description(
        self,
        test_name: str,
        run_id: str,
        start_url: str,
        device: str,
        model: str,
        failure_reason: str,
        steps: List[Dict[str, Any]],
        report_url: str
    ) -> Dict[str, Any]:
        """
        Builds an Atlassian Document Format (ADF) description node tree.
        Conforms to Jira Cloud REST API v3 specification.
        """
        content_nodes = [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "🚨 Barely Automated Test Failure"}]
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Test Execution: ", "marks": [{"type": "strong"}]},
                    {"type": "text", "text": f"{test_name} (Run ID: {run_id})"}
                ]
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Target URL: ", "marks": [{"type": "strong"}]},
                    {"type": "text", "text": start_url or "N/A", "marks": [{"type": "link", "attrs": {"href": start_url}}]} if start_url else {"type": "text", "text": "N/A"}
                ]
            },
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Environment: ", "marks": [{"type": "strong"}]},
                    {"type": "text", "text": f"Device: {device.capitalize()}  |  AI Model: {model}"}
                ]
            },
            {
                "type": "heading",
                "attrs": {"level": 3},
                "content": [{"type": "text", "text": "Root Cause / Failure Reason"}]
            },
            {
                "type": "codeBlock",
                "attrs": {"language": "text"},
                "content": [{"type": "text", "text": failure_reason or "Unknown failure"}]
            }
        ]

        # Step History List
        if steps:
            content_nodes.append({
                "type": "heading",
                "attrs": {"level": 3},
                "content": [{"type": "text", "text": f"Reproduction Step Sequence ({len(steps)} steps executed)"}]
            })

            list_items = []
            for idx, s in enumerate(steps, 1):
                desc = s.get("description", "Step executed")
                thought = s.get("thought", "")
                item_content = [
                    {"type": "text", "text": f"Step {idx}: ", "marks": [{"type": "strong"}]},
                    {"type": "text", "text": desc}
                ]
                if thought:
                    item_content.append({"type": "text", "text": f" (Agent thought: {thought})", "marks": [{"type": "em"}]})

                list_items.append({
                    "type": "listItem",
                    "content": [{"type": "paragraph", "content": item_content}]
                })

            content_nodes.append({
                "type": "orderedList",
                "content": list_items
            })

        # Link to Interactive Barely Report
        if report_url:
            content_nodes.append({
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "🔍 Interactive Report: ", "marks": [{"type": "strong"}]},
                    {"type": "text", "text": f"View complete execution audit & visual snapshots in Barely", "marks": [{"type": "link", "attrs": {"href": report_url}}]}
                ]
            })

        return {
            "type": "doc",
            "version": 1,
            "content": content_nodes
        }

    def create_issue(
        self,
        run_data: Dict[str, Any],
        host: Optional[str] = None,
        email: Optional[str] = None,
        api_token: Optional[str] = None,
        project_key: Optional[str] = None,
        issue_type: Optional[str] = None,
        base_report_url: Optional[str] = None
    ) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
        """
        Creates a Jira issue using Atlassian Document Format (ADF) description.
        Returns: (success, issue_key, issue_url, error_message)
        """
        active_host = (host or self._host or "").strip().rstrip("/")
        if active_host and not active_host.startswith("http://") and not active_host.startswith("https://"):
            active_host = f"https://{active_host}"
        active_email = (email or self._email or "").strip()
        active_token = (api_token or self._api_token or "").strip()
        active_project = (project_key or self._project_key or "").strip().upper()
        active_issue_type = (issue_type or self._issue_type or "Bug").strip()

        if not (active_host and active_email and active_token and active_project):
            return False, None, None, "Jira integration is not fully configured (missing host, email, token, or project key)"

        test_name = run_data.get("name") or run_data.get("id") or "Automated E2E Test"
        run_id = run_data.get("id", "unknown")
        start_url = run_data.get("start_url", "")
        device = run_data.get("device", "desktop")
        model = run_data.get("model", "Claude Sonnet")
        failure_reason = run_data.get("failure_reason") or "Test did not achieve goal condition"
        steps = run_data.get("steps", [])

        # Construct web report URL
        web_base = (base_report_url or get_setting("BARELY_WEB_URL") or "http://localhost:3000").rstrip("/")
        report_url = f"{web_base}/runs/{run_id}"

        summary = f"[Barely] Test Failure: {test_name}"
        if len(summary) > 250:
            summary = summary[:247] + "..."

        adf_doc = self._build_adf_description(
            test_name=test_name,
            run_id=run_id,
            start_url=start_url,
            device=device,
            model=model,
            failure_reason=failure_reason,
            steps=steps,
            report_url=report_url
        )

        payload = {
            "fields": {
                "project": {"key": active_project},
                "summary": summary,
                "issuetype": {"name": active_issue_type},
                "description": adf_doc,
                "labels": ["barely-e2e", "automated-test", "qa-failure"]
            }
        }

        auth_str = f"{active_email}:{active_token}"
        auth_header = f"Basic {base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')}"
        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Barely-E2E-Agent/2.0"
        }

        url = f"{active_host}/rest/api/3/issue"
        req_data = json.dumps(payload).encode("utf-8")

        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=15) as response:
                resp_json = json.loads(response.read().decode("utf-8"))
                issue_key = resp_json.get("key")
                issue_url = f"{active_host}/browse/{issue_key}"
                logger.info(f"Created Jira issue {issue_key} at {issue_url} for run {run_id}")
                return True, issue_key, issue_url, None
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                err_msgs = err_body.get("errorMessages", [])
                field_errors = [f"{k}: {v}" for k, v in err_body.get("errors", {}).items()]
                detail = "; ".join(err_msgs + field_errors) or str(err_body)
            except Exception:
                detail = f"HTTP {e.code} {e.reason}"
            logger.error(f"Failed to create Jira issue for run {run_id}: {detail}")
            return False, None, None, f"Jira API error ({e.code}): {detail}"
        except Exception as e:
            logger.error(f"Exception calling Jira API for run {run_id}: {e}")
            return False, None, None, f"Failed to reach Jira: {str(e)}"
