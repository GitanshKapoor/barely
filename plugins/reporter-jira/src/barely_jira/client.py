import os
import requests
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class JiraReporter:
    """
    Production integration for Atlassian Jira Cloud.
    Auto-creates bug tickets when AI tests fail.
    """
    def __init__(self, domain: str, email: str, api_token: str, project_key: str):
        self.base_url = f"https://{domain}.atlassian.net/rest/api/3"
        self.auth = (email, api_token)
        self.project_key = project_key
        
    def file_bug(self, goal_name: str, failure_reason: str, history: str) -> str:
        """Files a bug in Jira and returns the issue URL."""
        url = f"{self.base_url}/issue"
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        
        payload = {
            "fields": {
                "project": {"key": self.project_key},
                "summary": f"[Barely AI] Test Failure: {goal_name}",
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Barely AI encountered a failure while executing a test goal."}
                            ]
                        },
                        {
                            "type": "heading",
                            "attrs": {"level": 3},
                            "content": [{"type": "text", "text": "Reasoning"}]
                        },
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": failure_reason}]
                        },
                        {
                            "type": "heading",
                            "attrs": {"level": 3},
                            "content": [{"type": "text", "text": "Execution History"}]
                        },
                        {
                            "type": "codeBlock",
                            "attrs": {"language": "text"},
                            "content": [{"type": "text", "text": history}]
                        }
                    ]
                },
                "issuetype": {"name": "Bug"}
            }
        }
        
        response = requests.post(url, json=payload, auth=self.auth, headers=headers)
        
        if response.status_code == 201:
            issue_key = response.json().get("key")
            logger.info(f"Successfully created Jira Bug: {issue_key}")
            return f"https://{self.base_url.split('/rest')[0]}/browse/{issue_key}"
        else:
            logger.error(f"Failed to create Jira issue: {response.text}")
            raise Exception(f"Jira API Error: {response.status_code} - {response.text}")
