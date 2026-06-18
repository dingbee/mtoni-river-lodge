"""
End-to-end regression: the booking wizard must advance
  Dates  →  Room  →  Guest details  →  Payment gateway
without ever bouncing back to an earlier step or rendering an empty form.

How it runs
-----------
- Hits the locally running TanStack Start dev server at http://localhost:8080
  (or BOOK_TEST_BASE if you override it).
- Uses the real backend so server functions return realistic data.
- Intercepts the final Pesapal redirect at the network layer so the test
  never touches the external payment gateway.

Run it
------
    PYTHONPATH= python3 tests/e2e/booking_flow.py

Requires Python 3.11+ and the `playwright` package with Chromium installed.
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from playwright.async_api import async_playwright

BASE = os.environ.get("BOOK_TEST_BASE", "http://localhost:8080")
SCREENSHOTS = Path(os.environ.get("BOOK_TEST_SCREENSHOTS", "/tmp/booking-e2e"))
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

# Anything reachable that looks like the Pesapal hosted checkout page.
PESAPAL_HOST_PATTERN = re.compile(r"pesapal\.com", re.I)

MOCK_GATEWAY_HTML = (
    "<!doctype html><html><head><title>Mock Pesapal Gateway</title></head>"
    "<body data-test='pesapal-mock'><h1>Mock Pesapal Gateway</h1>"
    "<p>The booking flow successfully reached the payment gateway.</p>"
    "</body></html>"
)


async def fill_label(page, label_re: str, value: str) -> None:
    """Fill the input/textarea sitting in the same wrapper as the given label."""
    label = page.get_by_text(re.compile(label_re, re.I)).first
    await label.locator("..").locator("input, textarea").first.fill(value)


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # ── Capture step-number progression from the URL ─────────────────
        step_history: list[int] = []

        def on_nav(frame):
            if frame is page.main_frame:
                m = re.search(r"[?&]step=(\d)", frame.url)
                if m:
                    step_history.append(int(m.group(1)))

        page.on("framenavigated", on_nav)

        # ── Mock the external Pesapal redirect ───────────────────────────
        async def handle_pesapal(route):
            await route.fulfill(
                status=200,
                content_type="text/html",
                body=MOCK_GATEWAY_HTML,
            )

        await page.route(
            lambda url: bool(PESAPAL_HOST_PATTERN.search(url)),
            handle_pesapal,
        )

        # ── 1. Dates step ────────────────────────────────────────────────
        await page.goto(f"{BASE}/book?step=1", wait_until="networkidle")
        # Wait briefly for hydration so date-input onChange handlers attach.
        await page.wait_for_timeout(1000)
        dates = page.locator('input[type="date"]')
        await dates.nth(0).fill("2027-06-01")
        await dates.nth(1).fill("2027-06-03")
        await page.wait_for_function(
            "/\\d+\\s+Night/i.test(document.body.innerText)", timeout=5_000
        )
        await page.screenshot(path=str(SCREENSHOTS / "1_dates.png"))

        # ── 2. Submit search → Room step ─────────────────────────────────
        await page.get_by_role(
            "button", name=re.compile("Check Availability", re.I)
        ).click()
        await page.wait_for_url(re.compile(r"step=2"), timeout=20_000)
        await page.wait_for_selector("button:has-text('Select')", timeout=10_000)
        await page.screenshot(path=str(SCREENSHOTS / "2_select.png"))

        # Hold long enough to detect a spurious bounce back to step 1.
        await page.wait_for_timeout(2_000)
        assert "step=2" in page.url, (
            f"Search succeeded but UI bounced off Room step (now {page.url})"
        )

        # ── 3. Pick a room → Guest details ───────────────────────────────
        await page.get_by_role("button", name=re.compile(r"^Select", re.I)).first.click()
        await page.wait_for_url(re.compile(r"step=3"), timeout=10_000)
        await page.wait_for_selector("text=Guest Details", timeout=10_000)
        await page.screenshot(path=str(SCREENSHOTS / "3_guest.png"))

        await fill_label(page, r"^Full name$", "E2E Test Guest")
        # Unique-looking email so we can identify this test in the DB if needed.
        await fill_label(page, r"^Email$", "e2e+booking@mtoniriverlodge.test")
        await fill_label(page, r"^Phone$", "+255700000000")
        await fill_label(page, r"^Country$", "Tanzania")

        # ── 4. Submit booking → Payment gateway ──────────────────────────
        async with page.expect_navigation(
            url=PESAPAL_HOST_PATTERN, timeout=30_000
        ):
            await page.get_by_role(
                "button", name=re.compile(r"Pay 50% Deposit", re.I)
            ).click()
        await page.screenshot(path=str(SCREENSHOTS / "4_payment_gateway.png"))

        # ── Assertions ───────────────────────────────────────────────────
        normalised = [
            s for i, s in enumerate(step_history) if i == 0 or s != step_history[i - 1]
        ]
        print("step_history:", step_history)
        print("normalised:  ", normalised)
        print("final url:   ", page.url)

        # Step numbers must move forward only (1 → 2 → 3); they may stay.
        for a, b in zip(normalised, normalised[1:]):
            assert b >= a, f"backwards step transition detected: {normalised}"
        assert 2 in normalised, f"never reached Room step: {normalised}"
        assert 3 in normalised, f"never reached Guest step: {normalised}"
        assert PESAPAL_HOST_PATTERN.search(page.url), (
            f"booking submit did not redirect to payment gateway, ended at {page.url}"
        )
        # And the gateway page actually rendered our mock body — proving the
        # initiatePayment server function returned a real redirect_url.
        body_text = await page.locator("body").inner_text()
        assert "Mock Pesapal Gateway" in body_text, (
            "navigation reached pesapal.* but mock body didn't render"
        )

        print("OK — booking flow advanced Dates → Room → Guest → Payment cleanly.")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
