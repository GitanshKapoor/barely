from __future__ import annotations
import yaml
import re
from pathlib import Path
from typing import Dict, Any, Tuple, Union
from barely_core.models.domain import Goal, Step

class GoalParser:
    """Parses Barely Markdown files with YAML frontmatter."""
    
    FRONTMATTER_REGEX = re.compile(r'^-{3,}\s*$(.*?)^-{3,}\s*$', re.MULTILINE | re.DOTALL)
    
    @classmethod
    def parse(cls, filepath: Union[Path, str]) -> Goal:
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Goal file not found: {path}")
            
        content = path.read_text(encoding="utf-8")
        return cls.parse_content(content, default_name=path.stem)

    @classmethod
    def parse_content(cls, content: str, default_name: str = "Goal") -> Goal:
        metadata, body = cls._extract_frontmatter(content)
        
        # Extract the title (first H1 or name in metadata)
        name = metadata.get("name", default_name)
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
                
        # Extract context if provided in frontmatter or markdown section
        context = metadata.get("context")
        if not context:
            context_match = re.search(r'##\s+(?:Context|Background)\s*\n(.*?)(?=\n##|\Z)', body, re.DOTALL | re.IGNORECASE)
            if context_match:
                context = context_match.group(1).strip()

        return Goal(
            name=name,
            tags=metadata.get("tags", []),
            timeout=metadata.get("timeout", 120),
            context=context,
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
