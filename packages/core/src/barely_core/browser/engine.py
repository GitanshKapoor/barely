import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from playwright.sync_api import sync_playwright, Browser, Page, BrowserContext

class BrowserEngine:
    """
    Manages Playwright browser sessions and DOM distillation.
    Designed for Enterprise Concurrency (Bottleneck 4) and Speed (Bottleneck 1).
    """
    IOS_VIEWPORT = {"width": 393, "height": 852} # iPhone 15
    ANDROID_VIEWPORT = {"width": 412, "height": 915} # Pixel 7
    TABLET_VIEWPORT = {"width": 768, "height": 1024} # iPad
    DESKTOP_VIEWPORT = {"width": 1280, "height": 720}

    def __init__(self, headless: bool = True, device: str = "desktop", strict_mode: bool = False):
        self.headless = headless
        self.device = device
        self.strict_mode = strict_mode
        self._playwright = None
        self._browser: Browser = None
        self._context: BrowserContext = None
        self.page: Page = None
        
        script_path = Path(__file__).parent / "distiller.js"
        self._distiller_script = script_path.read_text(encoding="utf-8")

    def start(self):
        """Initializes the browser."""
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=self.headless)
        
        if self.device == "ios":
            viewport = self.IOS_VIEWPORT
            user_agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        elif self.device == "android":
            viewport = self.ANDROID_VIEWPORT
            user_agent = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
        elif self.device == "tablet":
            viewport = self.TABLET_VIEWPORT
            user_agent = "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
        else:
            viewport = self.DESKTOP_VIEWPORT
            user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self._context = self._browser.new_context(
            viewport=viewport,
            user_agent=user_agent,
            ignore_https_errors=True
        )
        self.page = self._context.new_page()

    def navigate(self, url: str):
        """Navigate to a URL and wait for network to idle."""
        self.page.goto(url, wait_until="networkidle")

    def extract_dom(self) -> List[Dict[str, Any]]:
        """
        Injects JS to extract the lightweight accessibility tree.
        Solves Bottleneck 2 (Context Overload) by converting the DOM to minimal JSON.
        """
        # We wrap the JS in an IIFE (Immediately Invoked Function Expression)
        # to ensure it returns the data back to Python.
        script = f"(() => {{ {self._distiller_script} }})()"
        simplified_dom = self.page.evaluate(script)
        return simplified_dom

    def click_element(self, element_id: int):
        """Clicks an element based on its generated barely-id."""
        selector = f"[barely-id='{element_id}']"
        loc = self.page.locator(selector) if self.strict_mode else self.page.locator(selector).first
        loc.scroll_into_view_if_needed()
        loc.click()
        try:
            self.page.wait_for_load_state("networkidle", timeout=4000)
        except Exception:
            pass

    def type_element(self, element_id: int, text: str, press_enter: bool = False):
        """Types text into an element. Accurately handles newlines and Enter submissions."""
        selector = f"[barely-id='{element_id}']"
        loc = self.page.locator(selector) if self.strict_mode else self.page.locator(selector).first
        loc.scroll_into_view_if_needed()
        
        # If the text is just a newline, press Enter on the element
        if text == "\n" or text == "\\n":
            loc.press("Enter")
        elif text.endswith("\n"):
            loc.fill(text.rstrip("\n"))
            loc.press("Enter")
        else:
            loc.fill(text)
            if press_enter:
                loc.press("Enter")
                
        try:
            self.page.wait_for_timeout(1200)
            self.page.wait_for_load_state("networkidle", timeout=3000)
        except Exception:
            pass

    def press_key(self, key: str = "Enter", element_id: Optional[int] = None):
        """Presses a keyboard key like Enter, Tab, Escape."""
        if element_id:
            selector = f"[barely-id='{element_id}']"
            loc = self.page.locator(selector) if self.strict_mode else self.page.locator(selector).first
            loc.press(key)
        else:
            self.page.keyboard.press(key)
        try:
            self.page.wait_for_timeout(1200)
            self.page.wait_for_load_state("networkidle", timeout=3000)
        except Exception:
            pass

    def take_screenshot(self, path: str):
        """Takes a full page screenshot."""
        self.page.screenshot(path=path, full_page=True)
        
    def take_screenshot_base64(self) -> str:
        """Takes a compressed base64 encoded jpeg viewport screenshot for the DB."""
        import base64
        # Viewport-only with quality=50 reduces image size by ~80% while retaining high visual fidelity
        bytes_data = self.page.screenshot(type="jpeg", quality=50, full_page=False)
        return base64.b64encode(bytes_data).decode("utf-8")

    def stop(self):
        """Cleans up browser resources."""
        if self._context:
            self._context.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
