\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
 AS $$ SELECT coalesce(current_setting('request.test_role',true),current_user) $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
 AS $$ SELECT nullif(current_setting('request.test_uid',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','reservations','user','owner','manager','reception','marketing','housekeeping','finance','editor');

CREATE TABLE public.staynas_product_connections(
 id uuid PRIMARY KEY,local_property_id uuid NOT NULL,integration_property_id uuid NOT NULL,
 remote_tenant_id uuid NOT NULL,remote_property_id uuid NOT NULL,remote_product text NOT NULL,
 status text NOT NULL,local_approved_at timestamptz,remote_approved_at timestamptz,correlation_id text NOT NULL
);
CREATE TABLE public.guests(id uuid PRIMARY KEY);
CREATE TABLE public.bookings(
 id uuid PRIMARY KEY,property_id uuid NOT NULL,guest_id uuid NOT NULL REFERENCES public.guests(id),
 status text NOT NULL,checked_in_at timestamptz,check_out date NOT NULL,currency text NOT NULL,
 room_id uuid,reference text NOT NULL,extras_total numeric(14,2) NOT NULL DEFAULT 0,
 total numeric(14,2) NOT NULL,balance_due numeric(14,2) NOT NULL,balance_amount numeric(14,2) NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pms_folio_postings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES public.bookings(id),
 guest_id uuid,room_id uuid,source_system text,source_tenant_id uuid,source_property_id uuid,
 source_location_id uuid,source_order_id uuid,idempotency_key text,correlation_id text,
 amount numeric(14,2) NOT NULL CHECK(amount>0),currency text NOT NULL,description text,status text,
 folio_reference text,posting_reference text,posted_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.lb02_guest_stay_references(
 connection_id uuid NOT NULL,property_id uuid NOT NULL,guest_reference uuid NOT NULL,stay_reference uuid NOT NULL,
 booking_id uuid NOT NULL,guest_id uuid NOT NULL,revoked_at timestamptz
);
CREATE TABLE public.lb02_outlet_projections(
 connection_id uuid NOT NULL,integration_property_id uuid NOT NULL,outlet_reference uuid NOT NULL,
 guest_visible_status text NOT NULL,revoked_at timestamptz
);
CREATE TABLE public.staynas_property_members(
 property_id uuid NOT NULL,user_id uuid NOT NULL,role public.app_role NOT NULL,status text NOT NULL
);

\i supabase/migrations/20261110120000_lb03_room_charge_authorization_posting.sql
\i supabase/migrations/20261110121000_lb03_folio_reversal_approval.sql
\i supabase/migrations/20261110122000_lb03_reversal_approval_queue.sql

INSERT INTO auth.users(id) VALUES ('90000000-0000-4000-8000-000000000001');
INSERT INTO public.guests(id) VALUES ('80000000-0000-4000-8000-000000000001');
INSERT INTO public.bookings(id,property_id,guest_id,status,checked_in_at,check_out,currency,room_id,reference,extras_total,total,balance_due,balance_amount)
VALUES ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000001','checked_in',now(),current_date+3,'USD',
 '50000000-0000-4000-8000-000000000001','UAT-BOOKING-001',0,500,500,500);
INSERT INTO public.staynas_product_connections VALUES (
 '40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001','lexibite','active',now(),now(),'lb03-uat-correlation'
);
INSERT INTO public.lb02_guest_stay_references VALUES (
 '40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
 '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',NULL
);
INSERT INTO public.lb02_outlet_projections VALUES (
 '40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000002','open',NULL
);
INSERT INTO public.staynas_property_members VALUES (
 '60000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','finance','active'
);

GRANT SELECT,UPDATE ON public.bookings TO service_role;

SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb03base$
DECLARE a jsonb; p jsonb; d jsonb;
BEGIN
 a:=public.lb03_authorize_room_charge(
  '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  'uat-idem-0001','b0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  'USD',100,'[{"component":"VAT","amount":18}]'::jsonb,5,0,'lb03-uat-correlation'
 );
 IF a->>'status'<>'AUTHORIZED' THEN RAISE EXCEPTION 'Authorization failed: %',a; END IF;
 d:=public.lb03_authorize_room_charge(
  '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
  'uat-idem-0001','b0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  'USD',100,'[{"component":"VAT","amount":18}]'::jsonb,5,0,'lb03-uat-correlation'
 );
 IF d->>'duplicate'<>'true' OR d->>'authorizationReference'<>a->>'authorizationReference' THEN
  RAISE EXCEPTION 'Authorization replay did not recover the original decision';
 END IF;
 BEGIN
  PERFORM public.lb03_authorize_room_charge(
   '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',
   'uat-idem-0001','b0000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
   '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
   'USD',101,'[{"component":"VAT","amount":18}]'::jsonb,5,0,'lb03-uat-correlation'
  );
  RAISE EXCEPTION 'Expected idempotency payload conflict';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 p:=public.lb03_post_room_charge('40000000-0000-4000-8000-000000000001',
  a->>'authorizationReference','uat-idem-0001','UAT POS transaction 1');
 IF p->>'status'<>'POSTED' THEN RAISE EXCEPTION 'Folio posting failed: %',p; END IF;
 d:=public.lb03_post_room_charge('40000000-0000-4000-8000-000000000001',
  a->>'authorizationReference','uat-idem-0001','UAT POS transaction 1');
 IF d->>'duplicate'<>'true' OR d->>'postingReference'<>p->>'postingReference' THEN
  RAISE EXCEPTION 'Duplicate posting did not return original folio posting';
 END IF;
END $lb03base$;

-- A second independent POS transaction is left authorized for a true two-session posting race.
DO $lb03concurrent$
DECLARE a jsonb;
BEGIN
 a:=public.lb03_authorize_room_charge(
  '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',
  'uat-idem-0002','b0000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  'USD',50,'[]'::jsonb,0,0,'lb03-uat-correlation'
 );
END $lb03concurrent$;
DO $lb03negative$
BEGIN
 BEGIN
  PERFORM public.lb03_authorize_room_charge(
   '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003',
   'uat-wrong-outlet','b0000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099',
   '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
   'USD',10,'[]'::jsonb,0,0,'lb03-uat-correlation'
  );
  RAISE EXCEPTION 'Unmapped outlet was authorized';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.lb03_authorize_room_charge(
   '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004',
   'uat-wrong-currency','b0000000-0000-4000-8000-000000000004',
   '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
   '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
   'TZS',10,'[]'::jsonb,0,0,'lb03-uat-correlation'
  );
  RAISE EXCEPTION 'Currency mismatch was authorized';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 UPDATE public.bookings SET status='checked_out' WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.lb03_authorize_room_charge(
   '40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000005',
   'uat-not-checked-in','b0000000-0000-4000-8000-000000000005',
   '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
   '80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
   'USD',10,'[]'::jsonb,0,0,'lb03-uat-correlation'
  );
  RAISE EXCEPTION 'Checked-out guest was authorized';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 UPDATE public.bookings SET status='checked_in' WHERE id='70000000-0000-4000-8000-000000000001';
END $lb03negative$;
RESET ROLE;

-- Hotel-side approval is required before any folio credit adjustment is posted.
SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb03reversal$
DECLARE r jsonb;
BEGIN
 r:=public.lb03_request_room_charge_reversal('40000000-0000-4000-8000-000000000001',
  (SELECT posting_reference FROM public.lb03_room_charge_operations WHERE idempotency_key='uat-idem-0001'),
  'uat-reversal-001',10,'incorrect_amount','Correcting the first portion of the POS charge');
 IF r->>'status'<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Reversal did not enter hotel approval: %',r; END IF;
END $lb03reversal$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.test_role','authenticated',false);
SELECT set_config('request.test_uid','90000000-0000-4000-8000-000000000001',false);
DO $lb03queue$
BEGIN
 IF (SELECT count(*) FROM public.lb03_list_pending_room_charge_reversals())<>1 THEN
  RAISE EXCEPTION 'Hotel reversal approval queue did not expose the pending property-scoped request';
 END IF;
END $lb03queue$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.test_role','authenticated',false);
SELECT set_config('request.test_uid','90000000-0000-4000-8000-000000000001',false);
DO $lb03approval$
DECLARE r jsonb;
BEGIN
 r:=public.lb03_approve_room_charge_reversal((SELECT id FROM public.lb03_room_charge_reversal_requests WHERE idempotency_key='uat-reversal-001'));
 IF r->>'status'<>'PARTIALLY_REVERSED' THEN RAISE EXCEPTION 'Partial folio adjustment was not posted: %',r; END IF;
END $lb03approval$;
RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.test_role','service_role',false);
DO $lb03reversal2$
DECLARE r jsonb;
BEGIN
 r:=public.lb03_request_room_charge_reversal('40000000-0000-4000-8000-000000000001',
  (SELECT posting_reference FROM public.lb03_room_charge_operations WHERE idempotency_key='uat-idem-0001'),
  'uat-reversal-002',90,'incorrect_amount','Complete the approved POS transaction correction');
 IF r->>'status'<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Second reversal did not enter approval: %',r; END IF;
END $lb03reversal2$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.test_role','authenticated',false);
SELECT set_config('request.test_uid','90000000-0000-4000-8000-000000000001',false);
DO $lb03approval2$
DECLARE r jsonb;
BEGIN
 r:=public.lb03_approve_room_charge_reversal((SELECT id FROM public.lb03_room_charge_reversal_requests WHERE idempotency_key='uat-reversal-002'));
 IF r->>'status'<>'REVERSED' THEN RAISE EXCEPTION 'Full folio reversal was not posted: %',r; END IF;
END $lb03approval2$;
RESET ROLE;
DO $lb03assert$
BEGIN
 IF (SELECT count(*) FROM public.pms_folio_adjustments WHERE source_transaction_id='b0000000-0000-4000-8000-000000000001')<>2 THEN
  RAISE EXCEPTION 'Expected two immutable compensating folio adjustments';
 END IF;
 IF (SELECT state FROM public.lb03_room_charge_operations WHERE idempotency_key='uat-idem-0001')<>'REVERSED' THEN
  RAISE EXCEPTION 'Original room charge did not reach REVERSED state';
 END IF;
 IF (SELECT total FROM public.bookings WHERE id='70000000-0000-4000-8000-000000000001')<>500 THEN
  RAISE EXCEPTION 'Compensating adjustments did not restore the folio total';
 END IF;
END $lb03assert$;
