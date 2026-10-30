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
