# StayNas PayIn mobile-money adapter — sandbox readiness

## Provider selection
PayIn is the first sandbox adapter candidate based on its published developer documentation: https://docs.payin.co.tz/. The documented API supports Tanzania collections through M-Pesa, Airtel Money, Tigo Pesa/Mixx by Yas and Halo Pesa, a dedicated no-real-money sandbox, TZS amounts, idempotency keys and signed HMAC-SHA256 webhooks.

This is a technical shortlist, not commercial/provider approval. Before onboarding or production enablement, verify current licensing/authorization, contract, settlement terms, fees, support/SLA, data handling and sandbox credentials directly with PayIn.

## Tenant integration configuration
Use provider ID \`payin\`, purpose \`payments\`. Store \`api_key\`, \`api_secret\`, and \`webhook_secret\` only in the server-side secret vault, never in \`public_config\` or browser responses. Keep \`environment = sandbox\` until formal release acceptance.

Optional \`public_config.operator\` is restricted to \`mpesa\`, \`airtel\`, \`tigopesa\`, or \`halopesa\`. If omitted, PayIn may auto-detect the network. Check PayIn's current \`GET /v1/operators\` response before presenting a network as available.

## Implemented in this slice
- Server-only adapter with explicit sandbox/live base URLs.
- TZS-only whole-shilling validation and published collection limits TZS 100–10,000,000.
- Tanzanian MSISDN validation and server-only credentials.
- Stable merchant-reference idempotency header.
- Status polling mapping and raw-body HMAC-SHA256 verification with five-minute timestamp window.
- Unit tests for request mapping, tenant credentials, TZS/currency, amount, phone, status, and callback signature.

## Remaining gates — not production-ready
- No PayIn account, sandbox credentials or webhook secret have been supplied or tested against the provider sandbox.
- No production callback route is registered in this slice. It must resolve the payment attempt to its tenant-scoped integration before verifying the signature, then reconcile provider transaction, merchant reference, property, integration, exact amount and currency. Existing server payment-finalization logic remains the only authority allowed to mark a booking paid.
- Do not trust browser return URLs or unverified callbacks. Persist callback events idempotently and prevent duplicate finalization.
- Verify schema, grants and RLS in an isolated test database before authenticated E2E UAT.
- Live environment stays disabled until security review, provider approval and E2E acceptance.

## Sandbox acceptance matrix
1. One collection per stable payment-attempt idempotency key.
2. Duplicate request/callback delivery does not create duplicate transactions or finalize twice.
3. Pending remains pending; only verified completion can trigger finalization.
4. Failed, cancelled and expired attempts never mark a booking paid.
5. Invalid signature, stale timestamp, wrong tenant/integration, transaction/merchant mismatch, amount mismatch or currency mismatch is rejected without leaking secrets.
6. Property A cannot access Property B's integration, secret reference, booking or payment event.
7. Amount and currency reconcile exactly to server-stored booking totals in TZS.
