"""
Visual regression for the /stay landing page on a mobile viewport.

What it checks
--------------
After the recent compositor-corruption fixes (Reveal layer promotion,
mislabeled JPEGs, backdrop-blur in the hero) the /stay page must render
cleanly on small screens — no tiled images and no scanline artifacts in
the room-listing band that sits directly below the availability search.

The script loads /stay at an iPhone-class viewport, scrolls past the
availability section in steady increments, and captures a screenshot at
each stop. Screenshots are compared against committed baselines under
``tests/e2e/baselines/stay-mobile/``. The first run (or any run with
``UPDATE_BASELINES=1``) writes the baselines instead of comparing.

Comparison uses a per-pixel mean-absolute-difference threshold — small
sub-pixel font/AA jitter is tolerated, but the kind of large-area
corruption we hit before (repeated image tiles, horizontal scanlines)
blows past it easily.

Run
---
    python3 tests/e2e/stay_visual_regression.py
    UPDATE_BASELINES=1 python3 tests/e2e/stay_visual_regression.py

Override the base URL with ``STAY_TEST_BASE`` and the diff output
directory with ``STAY_TEST_DIFFS`` (default ``/tmp/stay-visual/``).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BASE = os.environ.get("STAY_TEST_BASE", "http://localhost:8080")
UPDATE = os.environ.get("UPDATE_BASELINES") == "1"

BASELINE_DIR = Path(__file__).parent / "baselines" / "stay-mobile"
DIFF_DIR = Path(os.environ.get("STAY_TEST_DIFFS", "/tmp/stay-visual"))
BASELINE_DIR.mkdir(parents=True, exist_ok=True)
DIFF_DIR.mkdir(parents=True, exist_ok=True)

# iPhone 13 logical viewport — matches the device the corruption was
# originally reported on.
VIEWPORT = {"width": 390, "height": 844}
DEVICE_SCALE_FACTOR = 2
USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)

# Scroll stops, in CSS pixels from the top of the document. The first
# stop lands just below the availability search; the rest walk down
# through the room-listing band where the corruption used to appear.
SCROLL_STOPS = [
    ("01_below_availability", 720),
    ("02_room_grid_top", 1100),
    ("03_room_grid_mid", 1600),
    ("04_room_grid_bottom", 2100),
    ("05_experiences", 2600),
]

# Mean absolute pixel difference (0-255) tolerated per channel. Real
# corruption produces deltas an order of magnitude above this.
DIFF_THRESHOLD = 6.0


def compare(baseline_path: Path, actual_path: Path, diff_path: Path) -> float:
    baseline = Image.open(baseline_path).convert("RGB")
    actual = Image.open(actual_path).convert("RGB")
    if baseline.size != actual.size:
        raise AssertionError(
            f"size mismatch for {actual_path.name}: "
            f"baseline {baseline.size} vs actual {actual.size}"
        )
    diff = ImageChops.difference(baseline, actual)
    # Mean absolute diff across all pixels and channels.
    stats = diff.getextrema()  # ((min,max), (min,max), (min,max))
    # Use a proper mean via histogram to keep it dependency-light.
    pixels = diff.size[0] * diff.size[1] * 3
    total = sum(i * c for i, c in enumerate(diff.histogram()[:256])) * 3  # rough
    # Better: compute exact mean per channel.
    chan_means = []
    for band in diff.split():
        hist = band.histogram()
        s = sum(i * c for i, c in enumerate(hist))
        chan_means.append(s / (band.size[0] * band.size[1]))
    mean = sum(chan_means) / len(chan_means)
    if mean > DIFF_THRESHOLD:
        diff.save(diff_path)
    return mean


async def main() -> int:
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=DEVICE_SCALE_FACTOR,
            user_agent=USER_AGENT,
            is_mobile=True,
            has_touch=True,
        )
        page = await ctx.new_page()

        await page.goto(f"{BASE}/stay", wait_until="networkidle")
        # Disable CSS animations/transitions so screenshots are stable.
        await page.add_style_tag(content="""
            *, *::before, *::after {
                animation: none !important;
                transition: none !important;
                caret-color: transparent !important;
            }
        """)
        # Wait for room images to settle.
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(500)

        for name, y in SCROLL_STOPS:
            await page.evaluate(f"window.scrollTo(0, {y})")
            # Let the compositor settle; this is where the corruption
            # used to surface.
            await page.wait_for_timeout(400)
            actual_path = DIFF_DIR / f"{name}.png"
            await page.screenshot(path=str(actual_path), full_page=False)
            baseline_path = BASELINE_DIR / f"{name}.png"

            if UPDATE or not baseline_path.exists():
                # Persist as the new baseline.
                Image.open(actual_path).save(baseline_path)
                print(f"baseline written: {name}")
                continue

            diff_path = DIFF_DIR / f"{name}.diff.png"
            mean = compare(baseline_path, actual_path, diff_path)
            status = "OK" if mean <= DIFF_THRESHOLD else "FAIL"
            print(f"{status} {name}: mean Δ = {mean:.2f} (threshold {DIFF_THRESHOLD})")
            if mean > DIFF_THRESHOLD:
                failures.append(f"{name} (Δ={mean:.2f}, diff at {diff_path})")

        await browser.close()

    if failures:
        print("\nvisual regression failures:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK — /stay mobile screenshots match baselines.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))