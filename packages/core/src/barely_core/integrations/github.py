import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict, Any, List
from barely_core.settings import get_setting

logger = logging.getLogger("barely_github")


class GitHubClient:
    """
    GitHub REST API v3 Client for Automated Issue & Defect Filing.
    Zero external dependencies — implements authentication, repository access verification,
    and structured Markdown defect reporting using Python standard library (urllib.request).
    """

    API_BASE = "https://api.github.com"

    def __init__(
        self,
        token: Optional[str] = None,
        repo: Optional[str] = None,
        labels: Optional[str] = None
    ):
        self._token = (token or get_setting("GITHUB_TOKEN") or "").strip()
        self._repo = (repo or get_setting("GITHUB_REPO") or "").strip().strip("/")
        self._labels = (labels or get_setting("GITHUB_LABELS") or "bug, automated-test").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self._token and self._repo and "/" in self._repo)

    def _get_headers(self, token: str) -> Dict[str, str]:
        # Support both classic tokens (ghp_...) and fine-grained PATs (github_pat_...)
        clean_token = token.strip()
        auth_header = f"Bearer {clean_token}"
        return {
            "Authorization": auth_header,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Barely-E2E-Agent/2.0"
        }

    def _clean_repo(self, repo_str: str) -> str:
        """Sanitizes repo string to ensure clean 'owner/repo' format."""
        s = repo_str.strip().rstrip("/")
        if s.startswith("https://github.com/"):
            s = s.replace("https://github.com/", "")
        elif s.startswith("http://github.com/"):
            s = s.replace("http://github.com/", "")
        elif s.startswith("github.com/"):
            s = s.replace("github.com/", "")
        if s.endswith(".git"):
            s = s[:-4]
        return s.strip("/")

    def test_connection(
        self,
        token: Optional[str] = None,
        repo: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Pings GitHub REST API to verify token authentication and repository issue permissions.
        Returns: (success: bool, message: str)
        """
        active_token = (token or self._token or "").strip()
        active_repo = self._clean_repo(repo or self._repo or "")

        if not active_token:
            return False, "GitHub Personal Access Token is required (e.g. ghp_... or github_pat_...)"
        if not active_repo or "/" not in active_repo:
            return False, "Target GitHub repository is required in 'owner/repo' format (e.g. GitanshKapoor/barely)"

        headers = self._get_headers(active_token)

        # 1. Verify Authentication against /user
        user_login = "Authenticated User"
        try:
            req = urllib.request.Request(f"{self.API_BASE}/user", headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=12) as response:
                user_data = json.loads(response.read().decode("utf-8"))
                user_login = user_data.get("login") or user_data.get("name") or "User"
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                msg = err_body.get("message", f"HTTP {e.code} {e.reason}")
            except Exception:
                msg = f"HTTP {e.code} {e.reason}"
            if e.code == 401:
                return False, f"GitHub Authentication failed: Invalid token or expired Personal Access Token ({msg})."
            return False, f"GitHub user verification failed: {msg}"
        except Exception as e:
            return False, f"Connection to GitHub API failed: {str(e)}"

        # 2. Verify Repository Access & Issue Permissions against /repos/{owner}/{repo}
        try:
            repo_url = f"{self.API_BASE}/repos/{active_repo}"
            req = urllib.request.Request(repo_url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=12) as response:
                repo_data = json.loads(response.read().decode("utf-8"))
                has_issues = repo_data.get("has_issues", True)
                if not has_issues:
                    return False, f"Connected as @{user_login}, but repository '{active_repo}' has Issues disabled in its repository settings."
                full_name = repo_data.get("full_name", active_repo)
                return True, f"Successfully connected as @{user_login}! Verified repository '{full_name}' with issues access."
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                msg = err_body.get("message", f"HTTP {e.code} {e.reason}")
            except Exception:
                msg = f"HTTP {e.code} {e.reason}"
            if e.code == 404:
                return False, f"Repository '{active_repo}' not found or token lacks 'repo' / 'issues' read permissions."
            return False, f"Repository access check failed: {msg}"
        except Exception as e:
            return False, f"Failed to verify repository '{active_repo}': {str(e)}"

    def _build_markdown_body(
        self,
        test_name: str,
        run_id: str,
        start_url: str,
        device: str,
        model: str,
        failure_reason: str,
        steps: List[Dict[str, Any]],
        report_url: str
    ) -> str:
        """Generates a clean, professional GitHub Flavored Markdown defect report."""
        lines = [
            f"## 🚨 Barely Automated Test Failure: {test_name}",
            "",
            "An autonomous E2E test run encountered a failure condition or assertion timeout.",
            "",
            "### 📋 Execution Metadata",
            "| Property | Value |",
            "| :--- | :--- |",
            f"| **Test Run ID** | `{run_id}` |",
            f"| **Target URL** | [{start_url}]({start_url}) |" if start_url else f"| **Target URL** | *N/A* |",
            f"| **Device Profile** | `{device.capitalize()}` |",
            f"| **AI Model** | `{model}` |",
            "",
            "### ❌ Failure Reason",
            "> " + failure_reason.replace("\n", "\n> "),
            ""
        ]

        if steps:
            lines.append("### 🪜 Reproduction Steps & Action Log")
            for idx, s in enumerate(steps, start=1):
                desc = s.get("description", "").strip() or "Executed action step"
                thought = s.get("thought", "").strip()
                if thought:
                    lines.append(f"{idx}. **Action:** {desc}\n   - *Agent Reasoning:* _{thought}_")
                else:
                    lines.append(f"{idx}. **Action:** {desc}")
            lines.append("")

        if report_url:
            lines.append("### 🔍 Interactive Audit Report & Golden Snapshots")
            lines.append(f"View full step-by-step console logs, network traces, and viewport screenshots in Barely:")
            lines.append(f"👉 **[Open Interactive Test Report]({report_url})**")
            lines.append("")

        lines.append("---")
        lines.append("*Automated defect report filed by [Barely Autonomous AI Testing Platform](https://github.com/GitanshKapoor/barely)*")

        return "\n".join(lines)

    def create_issue(
        self,
        run_data: Dict[str, Any],
        token: Optional[str] = None,
        repo: Optional[str] = None,
        labels: Optional[str] = None,
        base_report_url: Optional[str] = None
    ) -> Tuple[bool, Optional[int], Optional[str], Optional[str]]:
        """
        Creates a GitHub Issue via POST /repos/{owner}/{repo}/issues.
        Returns: (success: bool, issue_number: Optional[int], issue_url: Optional[str], error_message: Optional[str])
        """
        active_token = (token or self._token or "").strip()
        active_repo = self._clean_repo(repo or self._repo or "")
        active_labels = (labels or self._labels or "bug, automated-test").strip()

        if not (active_token and active_repo and "/" in active_repo):
            return False, None, None, "GitHub integration is not fully configured (missing token or owner/repo target)"

        test_name = run_data.get("name") or run_data.get("id") or "Automated E2E Test"
        run_id = run_data.get("id", "unknown")
        start_url = run_data.get("start_url", "")
        device = run_data.get("device", "desktop")
        model = run_data.get("model", "Default Model")
        failure_reason = run_data.get("failure_reason") or "Test did not achieve goal condition"
        steps = run_data.get("steps", [])

        web_base = (base_report_url or get_setting("BARELY_WEB_URL") or "http://localhost:3000").rstrip("/")
        report_url = f"{web_base}/runs/{run_id}"

        title = f"[Barely Defect] {test_name}"
        if len(title) > 200:
            title = title[:197] + "..."

        body = self._build_markdown_body(
            test_name=test_name,
            run_id=run_id,
            start_url=start_url,
            device=device,
            model=model,
            failure_reason=failure_reason,
            steps=steps,
            report_url=report_url
        )

        label_list = [l.strip() for l in active_labels.split(",") if l.strip()]
        if not label_list:
            label_list = ["bug"]

        payload: Dict[str, Any] = {
            "title": title,
            "body": body,
            "labels": label_list
        }

        headers = self._get_headers(active_token)
        headers["Content-Type"] = "application/json"

        issue_url = f"{self.API_BASE}/repos/{active_repo}/issues"
        post_data = json.dumps(payload).encode("utf-8")

        try:
            req = urllib.request.Request(issue_url, data=post_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=15) as response:
                resp_json = json.loads(response.read().decode("utf-8"))
                number = resp_json.get("number")
                html_url = resp_json.get("html_url")
                logger.info(f"Created GitHub Issue #{number} for run {run_id}: {html_url}")
                return True, number, html_url, None
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                detail = err_body.get("message", f"HTTP {e.code} {e.reason}")
                errors = err_body.get("errors")
                if errors:
                    detail += f" ({errors})"
            except Exception:
                detail = f"HTTP {e.code} {e.reason}"
            logger.error(f"GitHub Issue creation failed: {detail}")
            return False, None, None, f"GitHub API Error: {detail}"
        except Exception as e:
            logger.error(f"GitHub Issue creation network error: {e}")
            return False, None, None, f"Failed to communicate with GitHub: {str(e)}"
