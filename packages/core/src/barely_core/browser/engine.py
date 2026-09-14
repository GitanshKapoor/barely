import os
from pathlib import Path
from typing import List, Dict, Any
from playwright.sync_api import sync_playwright, Browser, Page, BrowserContext

class BrowserEngine:
    """
    Manages Playwright browser sessions and DOM distillation.
    Designed for Enterprise Concurrency (Bottleneck 4) and Speed (Bottleneck 1).
    IOS_VIEWPORT = {"width": 393, "height": 852} # iPhone 15
    ANDROID_VIEWPORT = {"width": 412, "height": 915} # Pixel 7
    DESKTOP_VIEWPORT = {"width": 1280, "height": 720}

    def __init__(self, headless: bool = True, device: str = "desktop"):
        self.headless = headless
        self.device = device
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
        self.page.locator(selector).scroll_into_view_if_needed()
        self.page.locator(selector).click()
        self.page.wait_for_load_state("networkidle")

    def type_element(self, element_id: int, text: str):
        """Types text into an element."""
        selector = f"[barely-id='{element_id}']"
        self.page.locator(selector).scroll_into_view_if_needed()
        self.page.locator(selector).fill(text)

    def take_screenshot(self, path: str):
        """Takes a full page screenshot."""
        self.page.screenshot(path=path, full_page=True)
        
    def take_screenshot_base64(self) -> str:
        """Takes a base64 encoded jpeg screenshot for the DB."""
        import base64
        bytes_data = self.page.screenshot(type="jpeg", quality=60, full_page=True)
        return base64.b64encode(bytes_data).decode("utf-8")

    def stop(self):
        """Cleans up browser resources."""
        if self._context:
            self._context.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
