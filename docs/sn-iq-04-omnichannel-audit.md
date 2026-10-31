# SN-IQ-04 — Omnichannel Communications

**Branch:** feat/sn-iq-04-omnichannel-communications  
**Base:** SN-IQ-03 verified application commit e36949080e25b5652237cb35dfce99f3fc4e4932  
**Current milestone:** SN-IQ-04.1 — baseline audit and channel contract  
**Status:** In progress; audit findings recorded. No provider credentials changed, no DB migration applied, and no deployment performed.

## Objective

Allow a guest conversation to continue across the supported website, WhatsApp Business Cloud API and email channels while preserving property context, guest identity, consent, message history, human approval, and auditable delivery state.

## Agreed scope

- Stabilize the website concierge as the baseline channel.
- Integrate WhatsApp Business Cloud API (Meta Cloud API; do not use the legacy Twilio/Lovable gateway).
- Integrate Resend for outbound email and delivery events.
- Unify guest identity and conversation history across channels without unsafe identity merges.
- Support inbound and outbound messages, staff handoff, human approval and reusable templates.
- Persist provider message IDs, delivery receipts, failures, retry state and idempotency keys.
- Enforce channel-specific consent, opt-out and communication preferences.
- Keep provider governance and secret administration founder-controlled under Nolmark CDMA; property-scoped conversations and guest data remain tenant-isolated.

## Baseline audit — 2026-10-30

| Area | Existing baseline | Finding |
|---|---|---|
| Website chat | /api/public/concierge/chat calls handleConciergeChat; existing session token and property context are passed. | Keep as canonical conversation entry point; verify session/property continuity and abuse controls in the implementation milestone. |
| Channel registry | ai_concierge_channels; founder-only list/update server functions and seeded web/WhatsApp/email channel rows. | Governance boundary exists. Registry is global and founder-controlled, which is appropriate for provider governance; do not expose provider secrets to tenant users. |
| Conversation timeline | listConciergeConversations filters sessions by active property and channel. | Lists session summaries only; it does not yet establish a complete cross-channel message timeline. |
| Identity | Sessions carry guest_id, guest_name, guest_email, channel and identity confidence. | No verified cross-channel identity-linking contract or collision-safe merge flow found in the reviewed path. |
| Drafts and approval | ai_communication_drafts supports pending/approved/edited/rejected/sent states; manager role is required for sensitive status changes. | The sent state can currently be set as a draft status update without a provider send operation. Separate approval from dispatch and provider-confirmed delivery. |
| Escalations | Property-scoped escalation list/create/update functions exist. | Reuse for human handoff; verify assignment and conversation continuity in E2E. |
| WhatsApp | src/lib/whatsapp/send.server.ts sends staff alerts through a Twilio connector gateway and requires Lovable/Twilio credentials. | Not the agreed guest-facing Meta WhatsApp Business Cloud API integration. Replace/isolated adapter required; do not consume Lovable credits or route StayNas traffic through Lovable. |
| Email | src/lib/email/send-internal.server.ts queues transactional email via enqueue_email; sender/domain and queue implementation are legacy property-branded and not a verified Resend adapter. | Do not reuse as the SN-IQ-04 guest communications provider without separating tenant-neutral message dispatch from the legacy sender. Resend delivery-event integration is not established in the reviewed path. |
| Webhooks and receipts | No Meta inbound webhook or Resend event receiver was found in the reviewed route inventory. | Signature verification, inbound deduplication, provider event persistence and retry/replay protection are outstanding. |
| Consent/preferences | Email suppression/unsubscribe support exists in the legacy sender. | No unified channel preference/consent contract was verified across web, WhatsApp and email. |

## Architecture and safety constraints

1. No provider send may occur from model inference alone. Outbound messages require an approved draft or an explicitly permitted transactional event.
2. approved means human-approved; sent means accepted by the provider; delivered/read are separate provider-confirmed states where supported.
3. Persist an immutable message/event record with property, conversation, channel, direction, actor, provider, provider message ID, idempotency key and timestamps.
4. Verify Meta webhook signatures and Resend webhook signatures before accepting events. Deduplicate inbound messages and provider callbacks.
5. Resolve a guest identity only from verified identifiers and explicit linking evidence. Never merge solely on matching display name or unverified phone/email.
6. Enforce active-property scope on all staff conversation/message operations. Provider secrets and global channel controls remain founder-only under Nolmark CDMA.
7. Consent and opt-out are channel-specific and must be checked immediately before dispatch. Transactional exceptions must be explicitly classified and legally reviewed.
8. Retries must be bounded and idempotent; permanent provider failures must remain visible and actionable.
9. No production database migrations, production data/role changes, or production deployment during this milestone. DB-dependent verification requires an isolated Supabase environment.
10. Do not use Lovable or the Lovable connector gateway for StayNas implementation or provider dispatch.

## Execution sequence

- SN-IQ-04.1 — Baseline and contracts: complete schema/provider/webhook inventory; define message, identity, consent, delivery and approval contracts. Add contract tests.
- SN-IQ-04.2 — Durable message ledger: add reviewed migration artifacts for property-scoped conversations/messages, identity links, channel preferences, dispatch attempts and provider events; keep unapplied pending isolated DB verification.
- SN-IQ-04.3 — Provider adapters: implement Meta WhatsApp Cloud API and Resend server adapters with secret isolation, request validation, idempotency and bounded retries.
- SN-IQ-04.4 — Inbound webhooks: implement signature-verified, deduplicated WhatsApp and Resend event ingestion.
- SN-IQ-04.5 — Unified inbox and approval: render actual message history, human assignment/approval, templates and provider-backed send state.
- SN-IQ-04.6 — Identity, consent and E2E: collision-safe identity linking, preference enforcement, cross-channel continuity, delivery/failure recovery tests and preview certification.

## Initial acceptance criteria

- A guest can begin on website chat and continue on WhatsApp or email without losing the correct property and conversation context.
- Staff see one property-scoped timeline with accurate inbound/outbound messages and delivery states.
- AI-generated outbound content cannot dispatch without the required human approval.
- Opt-outs and channel preferences block disallowed sends.
- Duplicate webhook deliveries and retries do not duplicate messages or side effects.
- Provider secrets and channel governance are founder-only; tenant data remains property-scoped.
- Full tests, TypeScript, lint, production build and E2E preview checks pass before any production promotion.

## Deferred dependencies

See Deferred Verification Register. SN-IQ-03 property-scoped booking/hold RPC and two-property authenticated-role RLS verification remain deferred and must not be represented as passed.


## SN-IQ-04.2 — Durable ledger contract implementation

**Artifacts added (not applied):**
- `supabase/migrations/20261030200000_sn_iq_04_omnichannel_ledger.sql`
- `src/domains/ai/concierge/omnichannel.contracts.ts`
- `src/domains/ai/concierge/omnichannel.contracts.test.ts`
- `src/domains/ai/concierge/omnichannel.ledger.types.ts`
- `.github/workflows/sn-iq-04-verification.yml`

**Ledger tables defined:**
- `ai_omnichannel_messages` — immutable conversation message record with direction, actor, channel, status, provider IDs, client idempotency ID and property/session linkage.
- `ai_guest_identity_links` — verified channel identifiers with keyed digest lookup and optional encrypted identifier value; no raw identifier lookup values.
- `ai_guest_channel_preferences` — channel- and purpose-specific consent state, source, evidence and withdrawal timestamp.
- `ai_communication_dispatch_attempts` — approval evidence, request fingerprint, idempotency key, attempt number, provider response and bounded retry scheduling fields.
- `ai_omnichannel_delivery_events` — provider event ledger with unique provider event ID for callback deduplication.

**Security posture encoded:**
- Browser roles receive no write grants on the new ledger tables.
- Only authenticated staff receive read access to messages, filtered by active property and active-property session authorization.
- Identity, consent, dispatch and provider-event tables are not granted to browser roles; trusted server-side workers use service-role access only after application authorization.
- Composite property/session foreign key ensures a message cannot point at a conversation belonging to a different property.
- Explicit grants are used because Supabase changed default public-schema Data API exposure on 2026-10-30.
- Marketing consent contract requires affirmative guest action; withdrawal requires a timestamp; rejected drafts cannot be dispatched; approved dispatch requires approver and timestamp.

**Verification boundary:** Vitest contract coverage and CI are authored. CI has not yet been confirmed green. SQL migration remains unapplied. No live RLS, foreign-key, grants, Data API exposure, service-role, or two-property isolation test has been run. The migration requires isolated database review before application; it must not be run against production.


## SN-IQ-04.3 — Server-side provider adapters

**Implementation artifacts added:**
- `src/domains/ai/concierge/providers/provider-http.server.ts`
- `src/domains/ai/concierge/providers/meta-whatsapp.server.ts`
- `src/domains/ai/concierge/providers/resend-email.server.ts`
- `src/domains/ai/concierge/providers/provider-adapters.server.test.ts`

**Meta WhatsApp Cloud API**
- Implements authenticated text and approved-template sends through the versioned Graph API `/{phone_number_id}/messages` endpoint.
- Uses server-only `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, and explicit `META_GRAPH_API_VERSION` configuration.
- Validates E.164 recipient numbers, text length, template name and locale before network dispatch.
- Returns the provider-issued WhatsApp message ID; classifies rate-limit, timeout and server errors for bounded retry orchestration.
- Meta's send endpoint does not provide a general idempotency-key header. The adapter therefore requires the caller to enforce single-dispatch semantics using the durable StayNas dispatch ledger. The supplied idempotency key is validated as part of the dispatch contract but is not represented as provider-side deduplication.

**Resend**
- Implements authenticated email sends through `POST https://api.resend.com/emails`.
- Uses server-only `RESEND_API_KEY` and sends the durable dispatch key in the `Idempotency-Key` request header.
- Validates sender, recipients, subject, body and optional cc/bcc/reply-to/tags.
- Returns Resend's provider-issued email ID and classifies retryable HTTP responses.

**Shared controls**
- Provider credentials are read only from server environment configuration or explicit server-side dependency injection for tests; no browser API or tenant UI receives credentials.
- Request timeouts are bounded. Provider error messages are sanitized and response bodies are not logged.
- Both adapters fail closed when required credentials/configuration are missing.
- These adapters are transport boundaries only. The caller must first authorize the property/session, check channel consent and opt-out, enforce required human approval, persist the message and dispatch attempt, and then record provider acceptance/failure. No AI inference path may call the adapters directly.

**Required server configuration (not set by this code change):**
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_GRAPH_API_VERSION`
- `RESEND_API_KEY`

No provider secrets were created, copied, or modified. No production environment settings were changed.

**Verification boundary:** Adapter regression tests were added and CI was updated to execute them alongside contract tests, TypeScript, lint and production build. Execution is still pending because the Vercel integration is currently rate-limited and the latest GitHub Actions attempt had no jobs. Do not claim these tests or build passed until a runnable CI attempt completes.


## SN-IQ-04.4 — Verified inbound webhook ingestion

**Implementation artifacts added:**
- `src/domains/ai/concierge/webhooks/webhook-signatures.server.ts`
- `src/domains/ai/concierge/webhooks/webhook-normalization.server.ts`
- `src/domains/ai/concierge/webhooks/webhook-ingestion.server.ts`
- `src/domains/ai/concierge/webhooks/webhook-security.server.test.ts`
- `src/routes/api/public/webhooks.meta.ts`
- `src/routes/api/public/webhooks.resend.ts`
- `supabase/migrations/20261030213000_sn_iq_04_4_provider_routing_and_property_settings.sql`
- `supabase/migrations/20261030214000_sn_iq_04_4_webhook_inbox.sql`
- `src/domains/ai/concierge/property-channel-settings.functions.ts`
- `src/routes/_authenticated.admin.settings.channels.tsx`

**Webhook controls**
- Meta POST validates `X-Hub-Signature-256` against the exact raw request body using HMAC-SHA256 and constant-time comparison. GET implements the challenge/verify-token handshake.
- Resend validates Svix `svix-id`, `svix-timestamp` and all supported `v1` signatures against the exact raw body, with a five-minute timestamp tolerance and constant-time comparison.
- WhatsApp inbound messages and status callbacks are normalized to provider-neutral events. Resend delivery/bounce/complaint events are normalized; unsupported event types are ignored.
- Events are routed only by trusted founder-managed mappings: Meta phone-number ID, or the configured Resend account. The payload cannot supply a property ID.
- Verified events are persisted to `ai_provider_webhook_inbox` using a unique `(provider, provider_event_id)` conflict key. Replays are acknowledged as duplicates, not inserted again.
- Webhook inbox, provider mapping and message ledger tables are server/service-role only. The inbox records property assignment and normalized event evidence; a subsequent processing worker must attach inbound messages to a validated property conversation and update message/delivery ledger state.

**Administration separation**
- Tenant Admin UI: `/admin/settings/channels`. Property owner/manager/admin can enable channels, inbound/outbound operations, human-approval requirements, and marketing-consent requirements. Queries are bound to the authenticated active property.
- Founder Admin: existing founder-only Concierge Channels page remains the global provider/channel governance surface. Founder-managed provider-to-property mappings are stored separately from tenant settings. Provider credentials and webhook signing secrets remain protected deployment secrets; no raw secrets are returned to either browser role.
- Property channel settings and founder provider mappings are separate tables with separate authorization boundaries. Provider bindings are not readable/writable by tenant roles.

**Required founder-managed secrets/configuration (not provisioned by this change):**
- `META_APP_SECRET`
- `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `RESEND_WEBHOOK_SIGNING_SECRET`
- `RESEND_WEBHOOK_ACCOUNT_ID`
- Existing outbound credentials: `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_GRAPH_API_VERSION`, `RESEND_API_KEY`.

**Verification boundary**
- Webhook signature and normalization regression tests have been added to the SN-IQ-04 workflow.
- CI execution, TypeScript, lint and production build are not yet verified. Prior workflow run `41100795302` had zero GitHub Actions jobs, so its failed conclusion is not evidence of a test failure.
- All three migration artifacts remain unapplied. No production DB, provider secrets, Vercel deployment settings, production deployment or Lovable resources were changed.
- Isolated DB verification is still required for grants, RLS, mapping uniqueness, inbox deduplication, and property scoping. End-to-end webhook replay and provider-console handshake checks remain pending.
- The inbound message processor that creates/attaches a property-scoped conversation and materializes the omnichannel message row remains a follow-on integration task; the current endpoint safely persists verified normalized events in the property-routed inbox.


**Administration UI completion update**
- Founder Admin provider-routing UI: `/admin/ai/concierge/providers`, linked from the founder-only Concierge Channels page. It maps Meta phone-number IDs and Resend sender identities/account IDs to one property and shows active routing records.
- Tenant Admin property controls: `/admin/settings/channels`, linked from the Settings hub.
- Credential entry remains deliberately outside these pages: founder must provision the access tokens and webhook signing secrets in the protected deployment secret manager. The UI does not persist or reveal secrets. The migration must be applied before either settings page can read/write its tables.


## SN-IQ-04.5 — Property-scoped inbox processor

**Implementation artifacts added:**
- `src/domains/ai/concierge/webhooks/webhook-processor.server.ts`
- `src/domains/ai/concierge/webhooks/webhook-processor.server.test.ts`
- `supabase/migrations/20261030220000_sn_iq_04_5_inbox_processing.sql`

**Processing behavior**
- Newly persisted Meta and Resend inbox events are immediately passed to the processor. Duplicate provider deliveries re-read the existing inbox row and retry processing if it remains received/failed.
- An atomic status claim prevents concurrent workers from processing the same inbox event. A processing claim older than five minutes can be reclaimed after a worker interruption.
- WhatsApp inbound events create a new session under the property already assigned by the founder-managed provider mapping, then create a provider-authored inbound message in the omnichannel ledger.
- Resend and Meta delivery events locate the original outbound ledger message by property, provider and provider message ID, append a deduplicated delivery event, and project the provider state onto the message.
- Message status projection is monotonic for accepted → delivered → read; failure/bounce states remain terminal. Unknown delivery references are marked ignored rather than attached to another property's data.
- Inbound contact details are retained on the new conversation only. No automatic cross-channel guest identity merge is attempted. Identity linking remains a separate verified-consent workflow.
- The inbox row records session_id/message_id after processing, with composite property foreign keys in the new migration.

**Important boundaries**
- The processor is invoked inline after verified webhook persistence. A scheduled recovery worker is not yet configured; stale claims can be reclaimed when the same event is redelivered, but a periodic sweeper should be added before production to recover events without provider redelivery.
- Inbound messages are materialized in `ai_omnichannel_messages`; the legacy website chat history table is not automatically populated. The unified inbox UI must read the omnichannel ledger in SN-IQ-04.6.
- All migrations remain unapplied. Database FK/grant/RLS and real concurrent replay behavior require isolated Supabase verification.
- Regression tests cover delivery-state mapping; the full processor integration tests, TypeScript, lint and production build remain unexecuted due the Vercel deployment rate-limit check preventing GitHub Actions jobs.
- No production deployment, production DB write, secret provisioning or Lovable operation performed.
