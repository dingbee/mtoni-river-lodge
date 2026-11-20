SET search_path=public,extensions;
-- production parity columns (present in production types, absent from migrations)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_addition numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',false) \g /dev/null
\echo '[B1] currency RPC'
SELECT currency FROM staynas_update_property_currency('TZS');
\echo '[B2] withdraw USD plan while property is still USD (only way it can be withdrawn)'
SELECT 'B2 '||publication_status FROM set_staynas_rate_plan_publication('f0000000-0000-4000-8000-000000000001','suspended',true,'Withdraw USD plan');
RESET ROLE;
UPDATE staynas_properties SET currency='TZS' WHERE id=(SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
\echo '[B3] create + publish a TZS 125,000 plan'
INSERT INTO staynas_rate_plans(id,property_id,code,name,currency,pricing_basis,rate_plan_data)
VALUES ('f0000000-0000-4000-8000-000000000003',staynas_active_property_id(auth.uid()),'BARTZS','Best Available TZS','TZS','per_room',
 '{"base_rates":{"d0000000-0000-4000-8000-000000000001":{"nightly_rate":125000,"currency":"TZS"}}}');
INSERT INTO staynas_rate_plan_room_types(property_id,rate_plan_id,room_type_id) VALUES (staynas_active_property_id(auth.uid()),'f0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001');
SELECT 'B3 '||publication_status FROM set_staynas_rate_plan_publication('f0000000-0000-4000-8000-000000000003','published',true,'TZS release');
RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false) \g /dev/null
\echo '[B4] availability row: currency label vs amount'
SELECT 'B4 currency='||currency||' nightly_total='||nightly_total||' quote_ccy='||(pricing_quote->>'currency')||' base_price='||base_price FROM get_staynas_room_availability_priced_with_rate_plan(current_date+7,current_date+8,(SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'),2,0,0,NULL);
CREATE TEMP TABLE b_quote AS SELECT staynas_create_reservation_quote((SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'),'deluxe-double',current_date+7,current_date+8,2,0,0,'[]','f0000000-0000-4000-8000-000000000003',NULL,'guest@example.test',600) q;
SELECT 'B5 quote '||(q->>'currency')||' '||(q->>'total') FROM b_quote;
CREATE TEMP TABLE b_res AS SELECT staynas_create_reservation_from_quote((q->>'quote_id')::uuid,(SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'),q->>'quote_id','Test Guest','guest@example.test',NULL,NULL,NULL,'pay_at_property','website',NULL,NULL,'pending',NULL,NULL,NULL) r FROM b_quote;
SELECT 'B6 reservation response currency='||(r->>'currency')||' total='||(r->>'total') FROM b_res;
RESET ROLE;
SELECT 'B7 persisted booking currency='||currency||' total='||total||' snapshot_ccy='||(pricing_snapshot->>'currency') FROM bookings;
\echo '[B8] legacy create_booking callable by anon?'
SELECT 'B8 anon can execute legacy create_booking: '||has_function_privilege('anon','public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb)','EXECUTE');
