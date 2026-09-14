import hashlib
import json
import logging
from typing import Optional, Dict, Any, List
from barely_core.db import SessionLocal, CacheRecord

logger = logging.getLogger(__name__)

class ActionCache:
    """
    Production-grade deterministic cache for AI actions.
    Stores successful LLM decisions based on the exact DOM state and goal instruction.
    Now uses PostgreSQL instead of local files.
    """
    def __init__(self):
        pass
        
    def _generate_hash(self, goal_name: str, dom_elements: List[Dict[str, Any]]) -> str:
        state = {
            "goal": goal_name,
            "dom": dom_elements 
        }
        state_str = json.dumps(state, sort_keys=True)
        return hashlib.sha256(state_str.encode('utf-8')).hexdigest()

    def get_action(self, goal_name: str, dom_elements: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        state_hash = self._generate_hash(goal_name, dom_elements)
        db = SessionLocal()
        try:
            record = db.query(CacheRecord).filter(CacheRecord.hash == state_hash).first()
            if record:
                return json.loads(record.payload)
        except Exception as e:
            logger.warning(f"Failed to read cache from DB: {e}")
        finally:
            db.close()
        return None

    def save_action(self, goal_name: str, dom_elements: List[Dict[str, Any]], action: Dict[str, Any]):
        if action.get("action") in ["fail", "finish"]:
            return
            
        state_hash = self._generate_hash(goal_name, dom_elements)
        db = SessionLocal()
        try:
            # Upsert
            record = db.query(CacheRecord).filter(CacheRecord.hash == state_hash).first()
            if record:
                record.payload = json.dumps(action)
            else:
                new_record = CacheRecord(hash=state_hash, payload=json.dumps(action))
                db.add(new_record)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to write to cache DB: {e}")
        finally:
            db.close()

    def invalidate(self, goal_name: str, dom_elements: List[Dict[str, Any]]):
        """Deletes a cached action. Used when a cached action fails to execute."""
        state_hash = self._generate_hash(goal_name, dom_elements)
        db = SessionLocal()
        try:
            record = db.query(CacheRecord).filter(CacheRecord.hash == state_hash).first()
            if record:
                db.delete(record)
                db.commit()
                logger.info(f"Invalidated cache entry {state_hash}")
        except Exception as e:
            logger.error(f"Failed to invalidate cache DB: {e}")
        finally:
            db.close()
