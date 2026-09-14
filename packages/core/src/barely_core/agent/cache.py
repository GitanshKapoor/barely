import hashlib
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

class ActionCache:
    """
    Production-grade deterministic cache for AI actions.
    Stores successful LLM decisions based on the exact DOM state and goal instruction.
    """
    def __init__(self, workspace_dir: str = ".barely"):
        self.cache_dir = Path(workspace_dir) / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
    def _generate_hash(self, goal_name: str, dom_elements: List[Dict[str, Any]]) -> str:
        state = {
            "goal": goal_name,
            "dom": dom_elements 
        }
        state_str = json.dumps(state, sort_keys=True)
        return hashlib.sha256(state_str.encode('utf-8')).hexdigest()

    def get_action(self, goal_name: str, dom_elements: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        state_hash = self._generate_hash(goal_name, dom_elements)
        cache_file = self.cache_dir / f"{state_hash}.json"
        
        if cache_file.exists():
            try:
                return json.loads(cache_file.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Failed to read cache file {cache_file}: {e}")
                return None
        return None

    def save_action(self, goal_name: str, dom_elements: List[Dict[str, Any]], action: Dict[str, Any]):
        if action.get("action") in ["fail", "finish"]:
            return
            
        state_hash = self._generate_hash(goal_name, dom_elements)
        cache_file = self.cache_dir / f"{state_hash}.json"
        
        try:
            cache_file.write_text(json.dumps(action, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to write to cache: {e}")

    def invalidate(self, goal_name: str, dom_elements: List[Dict[str, Any]]):
        """Deletes a cached action. Used when a cached action fails to execute."""
        state_hash = self._generate_hash(goal_name, dom_elements)
        cache_file = self.cache_dir / f"{state_hash}.json"
        if cache_file.exists():
            cache_file.unlink()
            logger.info(f"Invalidated cache entry {state_hash}")
