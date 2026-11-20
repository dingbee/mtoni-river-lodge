-- StayNas currency integrity — behavioural contract (runs in a rolled-back transaction).
-- Reproduces the Nolmark CDMA incident on synthetic properties: a property switches
-- USD -> TZS, a rate is re-priced to TZS 125,000 and a guest books 1 night / 2 adults.
BEGIN;
SELECT plan(32);

-- ---------------------------------------------------------------- fixtures
INSERT INTO auth.users(id,email) VALUES
 ('c1700000-0000-4000-8000-000000000001','cit-manager-a@example.test'),
 ('c1700000-0000-4000-8000-000000000002','cit-manager-b@example.test');
INSERT INTO public.staynas_organisations(id,slug,name)
VALUES ('c1700000-0000-4000-8000-0000000000a0','cit-org','Currency Integrity Test Org');
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,timezone,currency,status) VALUES
 ('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-0000000000a0','cit-property-a','CITA','CIT Property A','Africa/Dar_es_Salaam','USD','active'),
 ('c1700000-0000-4000-8000-0000000000a2','c1700000-0000-4000-8000-0000000000a0','cit-property-b','CITB','CIT Property B','Africa/Nairobi','KES','active');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('c1700000-0000-4000-8000-000000000001','manager'),('c1700000-0000-4000-8000-000000000002','manager');
-- Membership is explicit and exclusive per test property.
DELETE FROM public.staynas_property_members
WHERE user_id IN ('c1700000-0000-4000-8000-000000000001','c1700000-0000-4000-8000-000000000002');
INSERT INTO public.staynas_property_members(property_id,user_id,role) VALUES
 ('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-000000000001','manager'),
 ('c1700000-0000-4000-8000-0000000000a2','c1700000-0000-4000-8000-000000000002','manager');
INSERT INTO public.staynas_user_property_context(user_id,property_id) VALUES
 ('c1700000-0000-4000-8000-000000000001','c1700000-0000-4000-8000-0000000000a1'),
 ('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-0000000000a2')
ON CONFLICT (user_id) DO UPDATE SET property_id=EXCLUDED.property_id;
INSERT INTO public.staynas_room_catalogue_types(id,slug,name,capacity_adults,max_occupancy) VALUES
 ('c1700000-0000-4000-8000-0000000000b1','cit-a-double','CIT A Double',2,2),
 ('c1700000-0000-4000-8000-0000000000b2','cit-b-double','CIT B Double',2,2);
INSERT INTO public.rooms(id,property_id,slug,name,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,catalogue_type_id,configuration_source) VALUES
 ('c1700000-0000-4000-8000-0000000000c1','c1700000-0000-4000-8000-0000000000a1','cit-a-double','CIT A Double',2,0,2,2,80,'USD','c1700000-0000-4000-8000-0000000000b1','tenant_configured'),
 ('c1700000-0000-4000-8000-0000000000c2','c1700000-0000-4000-8000-0000000000a2','cit-b-double','CIT B Double',2,0,2,2,9000,'KES','c1700000-0000-4000-8000-0000000000b2','tenant_configured');

CREATE TEMP TABLE cit_ctx(k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON cit_ctx TO authenticated, service_role;

-- Property A manager publishes two USD plans while the property sells in USD.
SET LOCAL ROLE authenticated;
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"c1700000-0000-4000-8000-000000000001","role":"authenticated"}',true); END $do$;
INSERT INTO public.staynas_rate_plans(id,property_id,code,name,currency,pricing_basis,rate_plan_data) VALUES
 ('c1700000-0000-4000-8000-0000000000d1','c1700000-0000-4000-8000-0000000000a1','CITBAR','CIT Best Available','USD','per_room',
  '{"base_rates":{"c1700000-0000-4000-8000-0000000000b1":{"nightly_rate":80,"currency":"USD"}}}'),
 ('c1700000-0000-4000-8000-0000000000d2','c1700000-0000-4000-8000-0000000000a1','CITLEGACY','CIT Legacy USD','USD','per_room',
  '{"base_rates":{"c1700000-0000-4000-8000-0000000000b1":{"nightly_rate":95,"currency":"USD"}}}');
INSERT INTO public.staynas_rate_plan_room_types(property_id,rate_plan_id,room_type_id) VALUES
 ('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-0000000000d1','c1700000-0000-4000-8000-0000000000b1'),
 ('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-0000000000d2','c1700000-0000-4000-8000-0000000000b1');
DO $do$ BEGIN PERFORM public.set_staynas_rate_plan_publication('c1700000-0000-4000-8000-0000000000d1','published',true,'Initial USD release'); END $do$;
DO $do$ BEGIN PERFORM public.set_staynas_rate_plan_publication('c1700000-0000-4000-8000-0000000000d2','published',true,'Initial USD release'); END $do$;

-- ------------------------------------------------- 1. property currency change
SELECT lives_ok(
  $$SELECT * FROM public.staynas_update_property_currency('TZS')$$,
  'Property manager can change the operating currency through the invoker RPC');
RESET ROLE;
SELECT is((SELECT currency FROM public.staynas_properties WHERE id='c1700000-0000-4000-8000-0000000000a1'),'TZS',
  'Property A currency is persisted as TZS');
SELECT is((SELECT previous_value||'->'||new_value FROM public.staynas_property_settings_audit
           WHERE property_id='c1700000-0000-4000-8000-0000000000a1' ORDER BY id DESC LIMIT 1),'USD->TZS',
  'Currency change is audited');

-- ------------------------------------------- 2. withdrawing and re-pricing plans
SET LOCAL ROLE authenticated;
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"c1700000-0000-4000-8000-000000000001","role":"authenticated"}',true); END $do$;
SELECT lives_ok(
  $$SELECT public.set_staynas_rate_plan_publication('c1700000-0000-4000-8000-0000000000d1','suspended',true,'Re-price in TZS')$$,
  'A plan left in the previous currency can be suspended');
SELECT throws_like(
  $$SELECT public.set_staynas_rate_plan_publication('c1700000-0000-4000-8000-0000000000d1','published',true,'Republish in USD')$$,
  '%must match property currency%',
  'A plan still priced in USD cannot be republished under a TZS property');
SELECT throws_like(
  $$UPDATE public.staynas_rate_plans SET rate_plan_data='{"base_rates":{"c1700000-0000-4000-8000-0000000000b1":{"nightly_rate":125000,"currency":"USD"}}}'
    WHERE id='c1700000-0000-4000-8000-0000000000d1'$$,
  '%CURRENCY_MISMATCH%',
  'A TZS amount cannot be entered under the old USD label');
SELECT lives_ok(
  $$UPDATE public.staynas_rate_plans SET currency='TZS',
      rate_plan_data='{"base_rates":{"c1700000-0000-4000-8000-0000000000b1":{"nightly_rate":125000,"currency":"TZS"}}}'
    WHERE id='c1700000-0000-4000-8000-0000000000d1'$$,
  'The suspended plan is re-priced at TZS 125,000');
SELECT lives_ok(
  $$SELECT public.set_staynas_rate_plan_publication('c1700000-0000-4000-8000-0000000000d1','published',true,'TZS 125,000 release')$$,
  'The re-priced TZS plan is published');
SELECT is((SELECT currency FROM public.staynas_rate_plan_publications
           WHERE rate_plan_id='c1700000-0000-4000-8000-0000000000d1' ORDER BY publication_number DESC LIMIT 1),'TZS',
  'The immutable publication snapshot is denominated in TZS');

-- Property B manager publishes a KES plan.
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"c1700000-0000-4000-8000-000000000002","role":"authenticated"}',true); END $do$;
INSERT INTO public.staynas_rate_plans(id,property_id,code,name,currency,pricing_basis,rate_plan_data) VALUES
 ('c1700000-0000-4000-8000-0000000000d3','c1700000-0000-4000-8000-0000000000a2','CITBARB','CIT B Best Available','KES','per_room',
  '{"base_rates":{"c1700000-0000-4000-8000-0000000000b2":{"nightly_rate":9000,"currency":"KES"}}}');
INSERT INTO public.staynas_rate_plan_room_types(property_id,rate_plan_id,room_type_id) VALUES
 ('c1700000-0000-4000-8000-0000000000a2','c1700000-0000-4000-8000-0000000000d3','c1700000-0000-4000-8000-0000000000b2');
DO $do$ BEGIN PERFORM public.set_staynas_rate_plan_publication('c1700000-0000-4000-8000-0000000000d3','published',true,'KES release'); END $do$;
RESET ROLE;

-- ----------------------------------------------------- 3. guest-facing pricing
SET LOCAL ROLE service_role;
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true); END $do$;
SELECT results_eq(
  $$SELECT currency, nightly_total, (pricing_quote->>'currency'), is_available
    FROM public.get_staynas_room_availability_priced_with_rate_plan(current_date+7,current_date+8,'c1700000-0000-4000-8000-0000000000a1',2,0,0,NULL)$$,
  $$VALUES ('TZS'::text, 125000.00::numeric, 'TZS'::text, true)$$,
  'Availability returns TZS 125,000 with TZS currency metadata (stale USD plan is not sold)');
SELECT is(
  (SELECT base_price FROM public.get_staynas_room_availability_priced_with_rate_plan(current_date+7,current_date+8,'c1700000-0000-4000-8000-0000000000a1',2,0,0,NULL)),
  NULL::numeric,
  'A legacy USD room price is never returned under the TZS label');
SELECT is(
  (SELECT jsonb_path_query_array(public.discover_staynas_public_rate_plans('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-0000000000c1',current_date+7,current_date+8,2,0,0),'$.plans[*].currency')),
  '["TZS"]'::jsonb,
  'Guest plan discovery lists only plans priced in the property currency');
SELECT is(
  public.resolve_staynas_published_room_pricing('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-0000000000c1',current_date+7,current_date+8,2,0,0,'c1700000-0000-4000-8000-0000000000d2',now())->>'error_code',
  'CURRENCY_MISMATCH',
  'Explicitly selecting the plan still priced in USD is rejected, not reinterpreted');
SELECT results_eq(
  $$SELECT currency, nightly_total FROM public.get_staynas_room_availability_priced_with_rate_plan(current_date+7,current_date+8,'c1700000-0000-4000-8000-0000000000a2',2,0,0,NULL)$$,
  $$VALUES ('KES'::text, 9000.00::numeric)$$,
  'Property B prices independently in KES');
SELECT is(
  (SELECT count(*)::integer FROM public.get_staynas_room_availability_priced_with_rate_plan(current_date+7,current_date+8,'c1700000-0000-4000-8000-0000000000a1',2,0,0,NULL)
   WHERE room_id='c1700000-0000-4000-8000-0000000000c2'),
  0,
  'Property A availability never contains Property B rooms');
SELECT ok(
  public.resolve_staynas_published_room_pricing('c1700000-0000-4000-8000-0000000000a1','c1700000-0000-4000-8000-0000000000c1',current_date+7,current_date+8,2,0,0,'c1700000-0000-4000-8000-0000000000d3',now())->>'ok' = 'false',
  'Property A cannot be priced with Property B''s rate plan');

-- ---------------------------------------------------- 4. quote and reservation
INSERT INTO cit_ctx
SELECT 'quote', public.staynas_create_reservation_quote('c1700000-0000-4000-8000-0000000000a1','cit-a-double',current_date+7,current_date+8,2,0,0,'[]'::jsonb,'c1700000-0000-4000-8000-0000000000d1',NULL,'cit.guest@example.test',600)::text;
SELECT is((SELECT v::jsonb->>'currency' FROM cit_ctx WHERE k='quote')||' '||(SELECT v::jsonb->>'total' FROM cit_ctx WHERE k='quote'),
  'TZS 125000.00', 'Server quote is TZS 125,000');
SELECT ok(
  (SELECT public.staynas_create_reservation_from_quote((v::jsonb->>'quote_id')::uuid,'c1700000-0000-4000-8000-0000000000a2',(v::jsonb->>'quote_id'),'CIT Guest','cit.guest@example.test',NULL,NULL,NULL,'pay_at_property','website',NULL,NULL,'pending',NULL,NULL,NULL)->>'ok'
   FROM cit_ctx WHERE k='quote') = 'false',
  'A Property A quote cannot be booked against Property B');
INSERT INTO cit_ctx
SELECT 'reservation', public.staynas_create_reservation_from_quote((v::jsonb->>'quote_id')::uuid,'c1700000-0000-4000-8000-0000000000a1',(v::jsonb->>'quote_id'),'CIT Guest','cit.guest@example.test',NULL,NULL,NULL,'pay_at_property','website',NULL,NULL,'pending',NULL,NULL,NULL)::text
FROM cit_ctx WHERE k='quote';
RESET ROLE;
SELECT is((SELECT v::jsonb->>'ok' FROM cit_ctx WHERE k='reservation'),'true','Booking submission succeeds');
SELECT results_eq(
  $$SELECT currency, subtotal, total, pricing_snapshot->>'currency' FROM public.bookings
    WHERE id=(SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation')$$,
  $$VALUES ('TZS'::text, 125000.00::numeric, 125000.00::numeric, 'TZS'::text)$$,
  'Persisted reservation is TZS 125,000 and agrees with its pricing snapshot');
SELECT results_eq(
  $$SELECT nightly_rate, pricing_snapshot->>'currency' FROM public.booking_nights
    WHERE booking_id=(SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation')$$,
  $$VALUES (125000.00::numeric, 'TZS'::text)$$,
  'Nightly snapshot preserves TZS 125,000');

-- --------------------------------------- 5. payment, refund and cancellation
SET LOCAL ROLE authenticated;
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"c1700000-0000-4000-8000-000000000001","role":"authenticated"}',true); END $do$;
SELECT lives_ok(
  $$SELECT public.record_booking_payment((SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation'),50000,'manual_payment','cash','Deposit','cit-payment-0001')$$,
  'Partial payment is recorded');
RESET ROLE;
SELECT results_eq(
  $$SELECT currency, amount FROM public.payment_events
    WHERE booking_id=(SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation') AND event_type='manual_payment'$$,
  $$VALUES ('TZS'::text, 50000::numeric)$$,
  'Payment is recorded in the reservation currency TZS');
SELECT is((SELECT balance_amount FROM public.bookings WHERE id=(SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation')),
  75000::numeric, 'Outstanding balance is TZS 75,000');
SET LOCAL ROLE authenticated;
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"c1700000-0000-4000-8000-000000000001","role":"authenticated"}',true); END $do$;
SELECT lives_ok(
  $$SELECT public.record_booking_refund(
      (SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation'),
      (SELECT id FROM public.payment_events WHERE idempotency_key='cit-payment-0001'),
      20000,'cash','Partial refund','cit-refund-0001')$$,
  'Partial refund is recorded');
SELECT lives_ok(
  $$SELECT public.staynas_transition_booking((SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation'),'cancelled','Guest cancelled')$$,
  'Reservation can be cancelled');
RESET ROLE;
SELECT results_eq(
  $$SELECT currency, amount FROM public.payment_events
    WHERE booking_id=(SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation') AND event_type='refund'$$,
  $$VALUES ('TZS'::text, -20000::numeric)$$,
  'Refund is recorded in TZS');
SELECT results_eq(
  $$SELECT status::text, currency, total FROM public.bookings WHERE id=(SELECT (v::jsonb->>'booking_id')::uuid FROM cit_ctx WHERE k='reservation')$$,
  $$VALUES ('cancelled'::text, 'TZS'::text, 125000.00::numeric)$$,
  'Cancellation preserves the agreed TZS monetary snapshot');

-- --------------------------------------------- 6. reconciliation and grants
SET LOCAL ROLE service_role;
DO $do$ BEGIN PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true); END $do$;
SELECT ok(
  EXISTS (SELECT 1 FROM public.staynas_currency_integrity_findings('c1700000-0000-4000-8000-0000000000a1')
          WHERE entity='rate_plan' AND reference='CITLEGACY' AND severity='blocking' AND recorded_currency='USD'),
  'Reconciliation report flags the published plan still priced in USD');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.staynas_currency_integrity_findings('c1700000-0000-4000-8000-0000000000a1') WHERE entity='booking'),
  'No reservation disagrees with its pricing snapshot');
RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)','EXECUTE'),
  'Legacy unpriced booking functions are not callable from the browser');
SELECT ok(
  NOT has_function_privilege('anon','public.staynas_currency_integrity_findings(uuid)','EXECUTE'),
  'Currency reconciliation is not exposed anonymously');

SELECT * FROM finish();
ROLLBACK;
