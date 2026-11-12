-- Ensure PostgREST ON CONFLICT can infer the campaign attribution idempotency key.
-- event_key is nullable for historical/manual rows; ordinary UNIQUE semantics allow multiple NULLs.
drop index if exists public.campaign_attribution_event_key_uidx;
create unique index campaign_attribution_event_key_uidx
  on public.campaign_attribution (property_id, event_key);
