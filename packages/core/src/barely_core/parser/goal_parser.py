import yaml
import re
from pathlib import Path
from typing import Dict, Any, Tuple
from barely_core.models.domain import Goal, Step

class GoalParser:
    """Parses Barely Markdown files with YAML frontmatter."""
    
    FRONTMATTER_REGEX = re.compile(r'^-{3,}\s*$(.*?)^-{3,}\s*$', re.MULTILINE | re.DOTALL)
    
    @classmethod
    def parse(cls, filepath: Path | str) -> Goal:
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Goal file not found: {path}")
            
        content = path.read_text(encoding="utf-8")
        metadata, body = cls._extract_frontmatter(content)
        
        # Extract the title (first H1)
        name = path.stem
        title_match = re.search(r'^#\s+(.+)$', body, re.MULTILINE)
        if title_match:
            name = title_match.group(1).strip()
            
        # Extract steps (numbered lists)
        steps = []
        step_index = 1
        for line in body.splitlines():
            line = line.strip()
            # Match standard numbered lists e.g., "1. Click the button"
            step_match = re.match(r'^\d+\.\s+(.+)$', line)
            if step_match:
                instruction = step_match.group(1).strip()
                steps.append(Step(index=step_index, instruction=instruction))
                step_index += 1
                
        return Goal(
            name=name,
            tags=metadata.get("tags", []),
            timeout=metadata.get("timeout", 120),
            steps=steps,
            raw_content=body,
            metadata=metadata
        )
        
    @classmethod
    def _extract_frontmatter(cls, content: str) -> Tuple[Dict[str, Any], str]:
        """Extracts YAML frontmatter and returns (metadata, markdown_body)."""
        if content.startswith("---"):
            match = cls.FRONTMATTER_REGEX.search(content)
            if match:
                frontmatter = match.group(1)
                body = content[match.end():].strip()
                try:
                    metadata = yaml.safe_load(frontmatter) or {}
                    return metadata, body
                except yaml.YAMLError:
                    pass # Fallback to empty metadata on parse error
        return {}, content.strip()
