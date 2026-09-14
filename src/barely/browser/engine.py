import os
from pathlib import Path
from typing import List, Dict, Any
from playwright.sync_api import sync_playwright, Browser, Page, BrowserContext

class BrowserEngine:
    """
    Manages Playwright browser sessions and DOM distillation.
    Designed for Enterprise Concurrency (Bottleneck 4) and Speed (Bottleneck 1).
    """
    def __init__(self, headless: bool = True):
        self.headless = headless
        self._playwright = None
        self._browser: Browser = None
        self._context: BrowserContext = None
        self.page: Page = None
        
        # Load the distiller script once to save I/O time
        script_path = Path(__file__).parent / "distiller.js"
        self._distiller_script = script_path.read_text(encoding="utf-8")

    def start(self):
        """Initializes the browser."""
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=self.headless)
        self._context = self._browser.new_context(
            viewport={"width": 1280, "height": 720},
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

    def stop(self):
        """Cleans up browser resources."""
        if self._context:
            self._context.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
