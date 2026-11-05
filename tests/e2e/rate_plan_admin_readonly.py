"""
Read-only authenticated UI acceptance for the StayNas rate-plan workspace.

Required environment:
  STAYNAS_UI_BASE_URL   default http://localhost:8080
  STAYNAS_UI_EMAIL      property finance/owner test account
  STAYNAS_UI_PASSWORD   password for that test account
  STAYNAS_EXPECTED_CURRENCY optional exact property currency, e.g. USD

The script never creates, edits, publishes, or deletes rate-plan data.
"""
from __future__ import annotations

import asyncio
import os
from playwright.async_api import async_playwright

BASE = os.environ.get("STAYNAS_UI_BASE_URL", "http://localhost:8080")
EMAIL = os.environ.get("STAYNAS_UI_EMAIL", "")
PASSWORD = os.environ.get("STAYNAS_UI_PASSWORD", "")
EXPECTED_CURRENCY = os.environ.get("STAYNAS_EXPECTED_CURRENCY", "").upper()


async def main() -> None:
    if not EMAIL or not PASSWORD:
        raise SystemExit("Set STAYNAS_UI_EMAIL and STAYNAS_UI_PASSWORD to run authenticated acceptance.")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await context.new_page()
        console_errors: list[str] = []
        page.on("pageerror", lambda error: console_errors.append(str(error)))

        await page.goto(f"{BASE}/auth", wait_until="networkidle")
        await page.locator('input[type="email"]').fill(EMAIL)
        await page.locator('input[type="password"]').fill(PASSWORD)
        await page.get_by_role("button", name="Sign in").click()
        await page.wait_for_url("**/admin/**", timeout=30_000)

        await page.goto(f"{BASE}/admin/finance/rate-plans", wait_until="networkidle")
        await page.get_by_role("heading", name="Rate Plans").wait_for()
        await page.get_by_text("Authorized published-rate catalogue").wait_for()
        await page.get_by_text("Property rate plans").wait_for()

        body = await page.locator("body").inner_text()
        currency_candidates = ["TZS", "USD", "EUR", "GBP", "KES"]
        if EXPECTED_CURRENCY:
            assert EXPECTED_CURRENCY in body, (
                f"Expected property currency {EXPECTED_CURRENCY} was not visible in the rate-plan workspace."
            )
        else:
            assert any(code in body for code in currency_candidates), (
                "No explicit property currency was visible in the rate-plan workspace."
            )

        # Read-only details, inheritance and publication history checks.
        detail_buttons = page.get_by_role("button", name="Details")
        if await detail_buttons.count():
            await detail_buttons.first.click()
            await page.get_by_text("Cancellation policy").wait_for()
            await page.get_by_text("Rate data").wait_for()
            await page.get_by_role("button", name="Close details").click()

            await page.get_by_role("button", name="Preview inheritance").first.click()
            await page.get_by_text("Resolved rate-plan inheritance").wait_for()
            await page.get_by_text("Selected plan's own policy").wait_for()
            await page.get_by_role("button", name="Close preview").click()

            await page.get_by_role("button", name="History").first.click()
            await page.get_by_text("Rate plan version history").wait_for()
            await page.get_by_text("Publication audit").wait_for()

        # Verify the responsive shell at a mobile viewport without changing data.
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.reload(wait_until="networkidle")
        await page.get_by_role("heading", name="Rate Plans").wait_for()
        assert await page.get_by_text("Authorized published-rate catalogue").is_visible()

        assert not console_errors, "Browser runtime errors: " + " | ".join(console_errors)
        print("PASS — authenticated rate-plan UI, property currency, published catalogue, details/history and mobile shell.")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
