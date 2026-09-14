import shutil
import logging
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

logger = logging.getLogger(__name__)

class VRTEngine:
    """
    Visual Regression Testing Engine.
    Uses pixel-diffing to detect unintended UI changes across test runs.
    """
    def __init__(self, workspace_dir: str = ".barely", threshold: float = 0.05):
        self.baseline_dir = Path(workspace_dir) / "baselines"
        self.threshold = threshold
        
    def assert_match(self, goal_name: str, step_index: int, current_image_path: str) -> bool:
        """
        Compares the current screenshot against the baseline.
        Returns True if they match visually, False otherwise.
        """
        goal_baseline_dir = self.baseline_dir / goal_name
        goal_baseline_dir.mkdir(parents=True, exist_ok=True)
        
        baseline_path = goal_baseline_dir / f"step_{step_index}.png"
        diff_path = Path(current_image_path).parent / f"diff_step_{step_index}.png"
        
        # Auto-baseline creation if it's the first time running
        if not baseline_path.exists():
            print(f"📸 VRT: No baseline found. Setting baseline for step {step_index}.")
            shutil.copy2(current_image_path, baseline_path)
            return True
            
        return self._compare_images(str(baseline_path), current_image_path, str(diff_path))
        
    def _compare_images(self, base_path: str, curr_path: str, diff_path: str) -> bool:
        try:
            img1 = Image.open(base_path).convert('RGB')
            img2 = Image.open(curr_path).convert('RGB')
            
            if img1.size != img2.size:
                print(f"❌ VRT Failed: Dimensions differ ({img1.size} vs {img2.size})")
                return False
                
            diff = ImageChops.difference(img1, img2)
            stat = ImageStat.Stat(diff)
            
            # Mean pixel difference (0 to 1 scale)
            diff_ratio = sum(stat.mean) / (255.0 * 3)
            
            if diff_ratio > self.threshold:
                print(f"❌ VRT Failed: Visual difference is {(diff_ratio * 100):.2f}% (Threshold: {self.threshold * 100}%)")
                # Save the diff image for QA debugging
                diff.save(diff_path)
                return False
                
            print(f"✅ VRT Passed: Visual difference is {(diff_ratio * 100):.2f}%")
            return True
            
        except Exception as e:
            logger.error(f"VRT Comparison error: {e}")
            return False
