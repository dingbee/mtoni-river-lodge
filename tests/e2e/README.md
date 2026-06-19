# End-to-end tests

Python Playwright scripts that drive the live dev server.

## booking_flow.py

Regression for the booking wizard: verifies the flow progresses
**Dates → Room → Guest → Payment gateway** without any back-navigation or
empty-state bounce. Uses the real backend for availability + booking
creation, and intercepts the Pesapal redirect at the network layer so the
test never hits the external gateway.

### Run

1. Start the dev server (it should be listening on `http://localhost:8080`).
2. Install Playwright once: `pip install playwright && playwright install chromium`.
3. Run:

   ```bash
   python3 tests/e2e/booking_flow.py
   ```

Override the base URL or screenshot directory with `BOOK_TEST_BASE` /
`BOOK_TEST_SCREENSHOTS` env vars. Screenshots from each step land in
`/tmp/booking-e2e/` by default.

## stay_visual_regression.py

Mobile-viewport visual regression for `/stay`. Loads the page at an
iPhone 13 viewport, pre-warms lazy images, then captures screenshots at
five scroll stops below the availability search — the band where the
compositor corruption used to appear. Each screenshot is compared
against a committed baseline under `tests/e2e/baselines/stay-mobile/`
with a mean-pixel-difference threshold.

### Run

```bash
# Compare against committed baselines (fails on regression).
python3 tests/e2e/stay_visual_regression.py

# Refresh baselines after an intentional visual change.
UPDATE_BASELINES=1 python3 tests/e2e/stay_visual_regression.py
```

Override `STAY_TEST_BASE` (default `http://localhost:8080`) and
`STAY_TEST_DIFFS` (default `/tmp/stay-visual/`) as needed. Diff images
for failing stops are written under `STAY_TEST_DIFFS` for inspection.
