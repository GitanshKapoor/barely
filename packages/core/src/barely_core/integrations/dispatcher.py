import logging
from typing import Optional, Dict, Any
from barely_core.db import SessionLocal, RunRecord, RunStep
from barely_core.settings import get_setting
from barely_core.integrations.jira import JiraClient
from barely_core.integrations.slack import SlackClient
from barely_core.integrations.teams import TeamsClient

logger = logging.getLogger("barely_dispatcher")

def dispatch_run_notifications(run_id: str):
    """
    Orchestrates post-run integrations:
    1. Automated Jira Issue Creation (if enabled and test failed)
    2. Slack Channel Incident Notification
    3. Microsoft Teams Channel Incident Notification

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
            "steps": [
                {"description": s.description, "thought": s.thought}
                for s in steps
            ]
        }

        # -------------------------------------------------------------
        # 1. Jira Automated Issue Creation (if failed and toggle active)
        # -------------------------------------------------------------
        auto_jira = (get_setting("JIRA_AUTO_CREATE") or "").strip().lower() in ("true", "1", "yes")
        is_failure = run.success is False or run.status == "failed"

        if is_failure and auto_jira and not run_data.get("jira_issue_key"):
            jira_client = JiraClient()
            if jira_client.is_configured:
                logger.info(f"Triggering automated Jira bug creation for failed run {run_id}")
                success, issue_key, issue_url, error = jira_client.create_issue(run_data)
                if success and issue_key:
                    run.jira_issue_key = issue_key
                    run.jira_issue_url = issue_url
                    db.commit()
                    run_data["jira_issue_key"] = issue_key
                    run_data["jira_issue_url"] = issue_url
                    logger.info(f"Auto-created Jira ticket {issue_key} for run {run_id}")
                else:
                    logger.warning(f"Failed to auto-create Jira ticket: {error}")

        # -------------------------------------------------------------
        # 2. Slack Incident Notifications
        # -------------------------------------------------------------
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
                except Exception as se:
                    logger.error(f"Error dispatching Slack notification: {se}")

        # -------------------------------------------------------------
        # 3. Microsoft Teams Incident Notifications
        # -------------------------------------------------------------
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
                except Exception as te:
                    logger.error(f"Error dispatching Teams notification: {te}")

    except Exception as e:
        logger.error(f"Unexpected error in dispatch_run_notifications for run {run_id}: {e}")
    finally:
        db.close()
