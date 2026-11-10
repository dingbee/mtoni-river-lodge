\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
\i supabase/verification/lb01_product_connection_persistence.sql

-- Minimal booking-domain fixture; LB-01 setup above supplies the approved connection.
CREATE TABLE IF NOT EXISTS public.guests(id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.bookings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
 guest_id uuid REFERENCES public.guests(id),
 status text NOT NULL
);
INSERT INTO public.guests(id) VALUES ('80000000-0000-4000-8000-000000000001') ON CONFLICT DO NOTHING;

\i supabase/migrations/20261109210000_lb02_guest_stay_outbox.sql
\i supabase/migrations/20261109211000_lb02_outbox_delivery_runtime.sql
\i supabase/migrations/20261109212000_lb02_outlet_inbox_projection.sql

INSERT INTO public.bookings(id,property_id,guest_id,status)
SELECT '90000000-0000-4000-8000-000000000001', local_property_id,
 '80000000-0000-4000-8000-000000000001','confirmed'
FROM public.staynas_product_connections WHERE correlation_id='lb01-test-auth-active';

DO $lb02source$
BEGIN
 IF (SELECT count(*) FROM public.lb02_outbox_events WHERE event_type='guest.stay_status_changed.v1') <> 1 THEN
   RAISE EXCEPTION 'Booking confirmation did not enqueue exactly one guest stay event';
 END IF;
 IF EXISTS (SELECT 1 FROM public.lb02_outbox_events
   WHERE payload ?| ARRAY['name','email','phone','guestId','bookingId']) THEN
   RAISE EXCEPTION 'StayNas outbox contains guest PII or native identifiers';
 END IF;
END $lb02source$;

UPDATE public.bookings SET status='checked_in'
WHERE id='90000000-0000-4000-8000-000000000001';
DO $lb02version$
BEGIN
 IF (SELECT count(*) FROM public.lb02_outbox_events WHERE event_type='guest.stay_status_changed.v1') <> 2 THEN
   RAISE EXCEPTION 'Booking lifecycle update did not enqueue a second versioned event';
 END IF;
 IF (SELECT count(DISTINCT aggregate_version) FROM public.lb02_outbox_events) <> 2 THEN
   RAISE EXCEPTION 'Stay event aggregate versions are not monotonic';
 END IF;
END $lb02version$;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb02delivery$
DECLARE v_id uuid; v_claimed integer;
BEGIN
 SELECT id INTO v_id FROM public.lb02_outbox_events ORDER BY created_at LIMIT 1;
 SELECT count(*) INTO v_claimed FROM public.lb02_claim_outbox_events(
   (SELECT id FROM public.staynas_product_connections WHERE correlation_id='lb01-test-auth-active'),25
 );
 IF v_claimed <> 2 THEN RAISE EXCEPTION 'Expected two claimable StayNas events, got %',v_claimed; END IF;
 IF public.lb02_record_outbox_delivery(v_id,'accepted',202,NULL) <> 'delivered' THEN
   RAISE EXCEPTION 'StayNas outbox delivery acknowledgement failed';
 END IF;
END $lb02delivery$;
RESET ROLE;
