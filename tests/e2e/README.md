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
