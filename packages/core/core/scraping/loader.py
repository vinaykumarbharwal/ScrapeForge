import random
import asyncio
from typing import Dict, Any, Optional
from playwright.async_api import Page, Browser, Playwright

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Edge/122.0.0.0"
]

async def apply_anti_detection(page: Page) -> None:
    # 1. Randomize viewport to mimic different screen resolutions
    width = 1280 + random.randint(0, 200)
    height = 800 + random.randint(0, 200)
    await page.set_viewport_size({"width": width, "height": height})

    # 2. Choose a random User-Agent and apply common headers
    user_agent = random.choice(USER_AGENTS)
    await page.set_extra_http_headers({
        "User-Agent": user_agent,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://www.google.com/"
    })

    # 3. Mask webdriver automation flag & mock chrome runtime variables
    await page.add_init_script("""
        // Overwrite the webdriver property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
        
        // Mock window.chrome runtime to look like real Chrome
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };
        
        // Mock permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    """)

    # 4. Perform a micro-mouse movement to simulate user activity
    try:
        await page.mouse.move(
            x=300 + random.randint(0, 100),
            y=200 + random.randint(0, 100)
        )
    except Exception:
        # Ignore mouse movement failures on pages that haven't fully rendered layout coordinates
        pass

class ScraperLoader:
    def __init__(self, rate_limit_ms: int = 0):
        self.rate_limit_ms = rate_limit_ms
        self._last_request_time = 0.0

    async def wait_rate_limit(self) -> None:
        if self.rate_limit_ms <= 0:
            return
        
        # Enforce rate limiting delay
        await asyncio.sleep(self.rate_limit_ms / 1000.0)

    async def load_page(self, browser: Browser, url: str) -> Page:
        # Rate limit before making request
        await self.wait_rate_limit()

        context = await browser.new_context()
        page = await context.new_page()
        
        # Apply stealth indicators
        await apply_anti_detection(page)
        
        try:
            # Navigate with networkidle state for loading dynamic content
            await page.goto(url, wait_until="networkidle", timeout=30000)
        except Exception as e:
            # Fallback to domcontentloaded if networkidle times out
            print(f"Navigation to {url} timed out on networkidle, falling back: {e}")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            except Exception as inner_e:
                await page.close()
                await context.close()
                raise inner_e

        return page
