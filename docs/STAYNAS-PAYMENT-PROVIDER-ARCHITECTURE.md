# StayNas Payment Provider Architecture

## Scope separation

StayNas has two intentionally separate payment configuration scopes:

1. **Platform subscription collections** — Nolmark founder administrators configure the providers used to collect StayNas subscription invoices.
2. **Property guest payments** — each property administrator configures the provider accounts used for guest deposits, folios and booking payments.

A property administrator cannot view or modify platform subscription credentials. Founder administration does not implicitly grant access to a property's guest-payment credentials.

## Administrator experience

The configuration UI is available under **Admin → Settings → Payment Providers**.

- Founder administrators see platform subscription collection settings.
- Property administrators see only the active property's guest-payment settings.
- Credentials are entered in the UI and stored through the server-side `staynas_create_provider_secret` RPC in Supabase Vault.
- Public provider account rows store only the Vault UUID reference. The decrypted value is returned only to server-side code through `staynas_read_provider_secret`.
- Provider credentials are never selected into browser responses, logged, or copied into public configuration.
- Provider changes are written to the CC-04 financial audit log.
- New or changed provider configurations remain inactive.

Supabase Vault must be enabled for the project. The Vault encryption key is managed by Supabase and is not stored in StayNas tables.

## Persistence

- `staynas_platform_payment_provider_accounts` — founder-controlled platform collection providers.
- `staynas_guest_payment_provider_accounts` — property-scoped guest collection providers with a composite property/organisation ownership constraint.
- `commercial_provider_accounts` — CC-04 tenant-scoped payment-account mapping used by subscription payment attempts. Founder platform Pesapal configuration is synchronized to this table when configured/activated.
- `commercial_payment_transactions` and the CC-04 allocation/reversal ledger remain the financial system of record for subscription collections.

## Provider adapter contract

Every provider adapter must implement:

- connectivity test against the provider's sandbox/live environment;
- payment initiation;
- authoritative transaction-status query;
- webhook/IPN verification followed by server-side provider verification.

Browser redirects and inbound webhook payloads are not settlement authority. The adapter registry is keyed by both provider and scope, so a provider certified for platform subscription collections is not automatically enabled for property guest payments.

Supported configuration identifiers include Pesapal, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, bank transfer and manual collection.

## Activation gate

Saving credentials is not the same as enabling payments. A provider remains `adapter_pending` until its scope-specific adapter has passed:

1. sandbox connectivity and credential validation;
2. successful and failed payment initiation;
3. server-side status verification;
4. callback/IPN replay and signature/identity checks;
5. amount, currency, tenant/property isolation and idempotency tests;
6. end-to-end settlement and reconciliation checks.

Only a provider in `ready` integration state can be activated. Unimplemented adapters fail closed.

## Current certification boundary

The configuration model, secure credential storage, dual-scope administrator UI, server-side authorization, audit trail and provider adapter contract are implemented. The direct M-Pesa, Airtel Money, Mixx by Yas and HaloPesa adapters are not yet certified or enabled. Do not represent these providers as live integrations until their merchant API contracts and sandbox tests are complete.