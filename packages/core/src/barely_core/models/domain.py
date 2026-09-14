from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class Step(BaseModel):
    """A single step within a test goal."""
    index: int
    instruction: str
    
class Goal(BaseModel):
    """Represents a parsed Goal markdown file."""
    name: str
    tags: List[str] = Field(default_factory=list)
    timeout: int = 120
    steps: List[Step] = Field(default_factory=list)
    raw_content: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)

class WorkspaceConfig(BaseModel):
    """Global configuration loaded from barely.yaml"""
    project_name: str = "barely-project"
    default_url: Optional[str] = None
    ai_provider: str = "groq"
    ai_model: str = "llama3-70b-8192"

class RunResult(BaseModel):
    """Represents the final outcome of an Agent execution."""
    goal_name: str
    success: bool
    failure_reason: Optional[str] = None
    step_history: List[str] = Field(default_factory=list)
