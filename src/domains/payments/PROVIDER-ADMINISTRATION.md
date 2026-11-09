# StayNas Payment Provider Administration

## Separate payment scopes

StayNas has two intentionally separate provider-configuration scopes:

1. **Platform subscription collections** — Nolmark founder administrators configure providers used to collect StayNas subscription invoices. Configuration is stored in `staynas_platform_payment_provider_accounts`.
2. **Property guest payments** — an active property owner/admin/manager configures providers used to collect guest payments for that property. Configuration is stored in `staynas_guest_payment_provider_accounts` and is bound to both the property and its organisation.

These scopes do not share provider-account rows, ownership, credentials, settlement records, or activation decisions. CC-04 subscription finance remains separate from guest booking payments.

## Administrator experience

The settings entry is `/admin/settings/payment-providers`.

- Founder administrators see platform subscription collection configuration.
- Tenant property administrators see the active property's guest-payment configuration.
- Provider account reference, environment, supported currencies and non-secret public settings are configurable in the UI.
- Credentials are entered in the administrator UI and written to Supabase Vault through service-role-only RPC functions.
- Application tables store only the Vault UUID reference. Secret values are never selected into UI responses.
- Credential reads are available only to server-side adapter code through `readProviderCredentials`.

## Supported provider catalogue

The configuration catalogue includes Pesapal, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, bank transfer and manual payment.

A catalogue entry is not proof of an operational integration. Every scope/provider pair requires a certified adapter implementing:

- connection test;
- checkout initiation;
- authoritative server-side status query;
- webhook signature/authenticity verification and reconciliation evidence.

The shared contract and registry are in `provider-adapter.contract.ts`. The registry fails closed when an adapter is absent.

## Tanzania provider onboarding dependencies

- **Vodacom M-Pesa:** its official Open API portal exposes C2B, reversals and transaction-status queries. A business account/short code and product approval are required before sandbox development and go-live review. See the [M-Pesa developer portal](https://business.m-pesa.com/developers/) and [Tanzania onboarding guide](https://business.m-pesa.com/vodacom-tanzania/business-onboarding-tanzania/).
- **Airtel Money:** Airtel's Tanzania developer portal requires an organisation account, application registration, product selection, sandbox testing and production approval. See the [Airtel Tanzania developer portal](https://developers.airtel.co.tz/home).
- **Mixx by Yas:** the public site confirms merchant payment and corporate services, but the merchant API contract is not publicly exposed there. Obtain the partner API specification, credentials, callback requirements and certification process from Yas/Mixx before implementing the direct adapter. See [Mixx by Yas](https://www.mixx.co.tz/).
- **HaloPesa:** the public site confirms merchant payment services and directs businesses to merchant onboarding, but does not publish a complete developer API contract. Obtain the merchant integration specification and test credentials from HaloPesa before implementing the direct adapter. See [HaloPesa](https://halopesa.co.tz/).

A multi-network aggregator is a possible alternative, but it must be selected and commercially approved before adding an aggregator-specific adapter. The current provider catalogue does not silently route one wallet through another provider.

## Activation policy

New and changed provider configurations are saved inactive with `integration_status='adapter_pending'`. Activation is rejected unless the matching adapter has been certified and the configuration has `integration_status='ready'`.

As of this implementation, the mobile-money providers are configuration-ready but their provider-specific live adapters are not certified. No M-Pesa, Airtel Money, Mixx by Yas or HaloPesa checkout is represented as operational. Provider-specific API contracts, merchant onboarding, sandbox credentials and callback specifications are required before adapter implementation and UAT.

## Security and release boundaries

- Supabase Vault owns encrypted credential storage.
- Client roles have no table access to provider configuration or Vault RPCs.
- Service-role-only RPC functions create and read provider secrets.
- Property provider rows enforce the property/organisation pair with a composite foreign key.
- Tenant configuration APIs derive the property and organisation from verified membership; browser-supplied tenant IDs are not trusted.
- Provider activation is separate from credential configuration.
- CI uses an isolated Vault fixture. No production migration, credential, provider activation or Vercel deployment is performed by this change.
