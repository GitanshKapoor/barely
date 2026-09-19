import logging
from typing import Optional, Dict, Any
from barely_core.db import SessionLocal, RunRecord, RunStep
from barely_core.settings import get_setting
from barely_core.integrations.jira import JiraClient
from barely_core.integrations.github import GitHubClient
from barely_core.integrations.slack import SlackClient
from barely_core.integrations.teams import TeamsClient

logger = logging.getLogger("barely_dispatcher")

def _append_run_log(run: RunRecord, text: str, db):
    try:
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        run.logs = (run.logs or "") + f"[{timestamp}] {text}\n"
        db.commit()
    except Exception as e:
        logger.debug(f"Failed to append run log: {e}")

def dispatch_run_notifications(run_id: str):
    """
    Orchestrates post-run integrations:
    1. Automated Jira Issue Creation (if enabled and test failed)
    2. Automated GitHub Issue Creation (if enabled and test failed)
    3. Slack Channel Incident Notification
    4. Microsoft Teams Channel Incident Notification

    Safely caught and logged so external platform issues never disrupt core test pipelines.
    """
    if not run_id:
        return

    db = SessionLocal()
    try:
        run = db.query(RunRecord).filter(RunRecord.id == run_id).first()
        if not run:
            logger.warning(f"Notification dispatcher could not find run {run_id}")
            return

        steps = db.query(RunStep).filter(RunStep.run_id == run_id).order_by(RunStep.step_index.asc()).all()
        
        run_data = {
            "id": run.id,
            "name": run.name or run.id,
            "start_url": run.start_url or "",
            "device": run.device or "desktop",
            "status": run.status or "completed",
            "success": run.success,
            "failure_reason": run.failure_reason,
            "model": run.model or "Default Model",
            "jira_issue_key": getattr(run, "jira_issue_key", None),
            "jira_issue_url": getattr(run, "jira_issue_url", None),
            "github_issue_number": getattr(run, "github_issue_number", None),
            "github_issue_url": getattr(run, "github_issue_url", None),
            "steps": [
                {"description": s.description, "thought": s.thought}
                for s in steps
            ]
        }

        is_failure = run.success is False or run.status == "failed"

        # -------------------------------------------------------------
        # 1. Jira Automated Issue Creation (if failed and toggle active)
        # -------------------------------------------------------------
        if getattr(run, "create_jira_ticket", None) is not None:
            auto_jira = bool(run.create_jira_ticket)
        else:
            auto_jira = (get_setting("JIRA_AUTO_CREATE") or "").strip().lower() in ("true", "1", "yes")

        if is_failure and auto_jira and not run_data.get("jira_issue_key"):
            jira_client = JiraClient()
            if jira_client.is_configured:
                logger.info(f"Triggering automated Jira bug creation for failed run {run_id}")
                _append_run_log(run, f"📋 Filing automated Jira defect report to project '{jira_client._project_key}'...", db)
                success, issue_key, issue_url, error = jira_client.create_issue(run_data)
                if success and issue_key:
                    run.jira_issue_key = issue_key
                    run.jira_issue_url = issue_url
                    _append_run_log(run, f"🎫 Automated Jira ticket created: {issue_key} ({issue_url})", db)
                    run_data["jira_issue_key"] = issue_key
                    run_data["jira_issue_url"] = issue_url
                    logger.info(f"Auto-created Jira ticket {issue_key} for run {run_id}")
                else:
                    _append_run_log(run, f"⚠️ Failed to auto-create Jira ticket: {error}", db)
                    logger.warning(f"Failed to auto-create Jira ticket: {error}")
            else:
                _append_run_log(run, "⚠️ Jira auto-create active, but Jira integration is not fully configured in Settings.", db)
                logger.warning(
                    f"Jira auto-create active for failed run {run_id}, but JiraClient is not fully configured "
                    f"(host={bool(jira_client._host)}, email={bool(jira_client._email)}, "
                    f"token={bool(jira_client._api_token)}, project={bool(jira_client._project_key)})"
                )

        # -------------------------------------------------------------
        # 2. GitHub Automated Issue Creation (if failed and toggle active)
        # -------------------------------------------------------------
        if getattr(run, "create_github_issue", None) is not None:
            auto_github = bool(run.create_github_issue)
        else:
            auto_github = (get_setting("GITHUB_AUTO_CREATE") or "").strip().lower() in ("true", "1", "yes")

        if is_failure and auto_github and not run_data.get("github_issue_url"):
            github_client = GitHubClient()
            if github_client.is_configured:
                logger.info(f"Triggering automated GitHub Issue creation for failed run {run_id}")
                _append_run_log(run, f"🐙 Filing automated GitHub defect report to repository '{github_client._repo}'...", db)
                success, issue_num, issue_url, error = github_client.create_issue(run_data)
                if success and issue_url:
                    run.github_issue_number = issue_num
                    run.github_issue_url = issue_url
                    _append_run_log(run, f"🐙 Automated GitHub issue created: #{issue_num} ({issue_url})", db)
                    run_data["github_issue_number"] = issue_num
                    run_data["github_issue_url"] = issue_url
                    logger.info(f"Auto-created GitHub issue #{issue_num} for run {run_id}")
                else:
                    _append_run_log(run, f"⚠️ Failed to auto-create GitHub issue: {error}", db)
                    logger.warning(f"Failed to auto-create GitHub issue: {error}")
            else:
                _append_run_log(run, "⚠️ GitHub auto-create active, but GitHub integration is not fully configured in Settings.", db)
                logger.warning(
                    f"GitHub auto-create active for failed run {run_id}, but GitHubClient is not fully configured "
                    f"(token={bool(github_client._token)}, repo={bool(github_client._repo)})"
                )

        # -------------------------------------------------------------
        # Determine Notification Mechanism (Run-level override vs default)
        # -------------------------------------------------------------
        run_channel = getattr(run, "notification_channel", None)
        if not run_channel or run_channel.strip().lower() == "default":
            effective_channel = (get_setting("DEFAULT_NOTIFICATION_MECHANISM") or "both").strip().lower()
        else:
            effective_channel = run_channel.strip().lower()

        # -------------------------------------------------------------
        # 2. Slack Incident Notifications
        # -------------------------------------------------------------
        if effective_channel in ("both", "slack"):
            slack_client = SlackClient()
            slack_trigger = (get_setting("SLACK_NOTIFY_ON") or "failure_only").strip().lower()

            if slack_client.is_configured and slack_trigger != "disabled":
                should_notify_slack = (
                    slack_trigger == "all" or
                    (slack_trigger == "failure_only" and is_failure)
                )
                if should_notify_slack:
                    try:
                        slack_client.send_notification(run_data)
                        _append_run_log(run, "📢 Incident notification dispatched to Slack.", db)
                    except Exception as se:
                        _append_run_log(run, f"⚠️ Failed to dispatch Slack notification: {se}", db)
                        logger.error(f"Error dispatching Slack notification: {se}")

        # -------------------------------------------------------------
        # 3. Microsoft Teams Incident Notifications
        # -------------------------------------------------------------
        if effective_channel in ("both", "teams"):
            teams_client = TeamsClient()
            teams_trigger = (get_setting("TEAMS_NOTIFY_ON") or "failure_only").strip().lower()

            if teams_client.is_configured and teams_trigger != "disabled":
                should_notify_teams = (
                    teams_trigger == "all" or
                    (teams_trigger == "failure_only" and is_failure)
                )
                if should_notify_teams:
                    try:
                        teams_client.send_notification(run_data)
                        _append_run_log(run, "📢 Incident notification dispatched to Microsoft Teams.", db)
                    except Exception as te:
                        _append_run_log(run, f"⚠️ Failed to dispatch Teams notification: {te}", db)
                        logger.error(f"Error dispatching Teams notification: {te}")

    except Exception as e:
        logger.error(f"Unexpected error in dispatch_run_notifications for run {run_id}: {e}")
    finally:
        db.close()
