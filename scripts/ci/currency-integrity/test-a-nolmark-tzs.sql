-- Test A: Nolmark CDMA, USD -> TZS, TZS 125,000 / 1 night / 2 adults, full lifecycle through persistence.
\set ON_ERROR_STOP 1
SET search_path=public,extensions;
\echo '[A1] manager changes property currency to TZS via staynas_update_property_currency (invoker RPC)'
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',false) \g /dev/null
SELECT 'A1 property currency='||currency FROM staynas_update_property_currency('TZS');
SELECT 'A1 audit '||previous_value||'->'||new_value FROM staynas_property_settings_audit ORDER BY id DESC LIMIT 1;
\echo '[A2] suspend the USD plan published before the change'
SELECT 'A2 '||publication_status||' '||currency FROM set_staynas_rate_plan_publication('f0000000-0000-4000-8000-000000000001','suspended',true,'Re-price in TZS');
\echo '[A3] re-price the plan: TZS 125,000 (payload shape written by saveStayNasRatePlan)'
UPDATE staynas_rate_plans SET currency='TZS',
  rate_plan_data='{"base_rates":{"d0000000-0000-4000-8000-000000000001":{"nightly_rate":125000,"currency":"TZS"}}}'
WHERE id='f0000000-0000-4000-8000-000000000001';
SELECT 'A3 '||currency||' '||(rate_plan_data->'base_rates'->'d0000000-0000-4000-8000-000000000001')::text FROM staynas_rate_plans WHERE id='f0000000-0000-4000-8000-000000000001';
SELECT 'A3 republished '||publication_status FROM set_staynas_rate_plan_publication('f0000000-0000-4000-8000-000000000001','published',true,'TZS 125,000 release');
SELECT 'A3 publication #'||publication_number||' '||currency FROM staynas_rate_plan_publications WHERE rate_plan_id='f0000000-0000-4000-8000-000000000001' ORDER BY publication_number DESC LIMIT 1;
RESET ROLE;
\echo '[A4] public availability (service role)'
SET ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false) \g /dev/null
CREATE TEMP TABLE a_avail AS
SELECT * FROM get_staynas_room_availability_priced_with_rate_plan(current_date+7,current_date+8,
  (SELECT id FROM staynas_properties WHERE code='CDMA' OR (slug='nolmark-cdma-staynas' AND code<>'CTRL') LIMIT 1),2,0,0,NULL);
SELECT 'A4 '||slug||' currency='||currency||' nightly_total='||nightly_total||' quote_ccy='||(pricing_quote->>'currency')||' base_price='||COALESCE(base_price::text,'null')||' available='||is_available FROM a_avail;
DO $$ BEGIN
  IF (SELECT count(*) FROM a_avail WHERE currency='TZS' AND nightly_total=125000 AND is_available AND pricing_quote->>'currency'='TZS')<>1
  THEN RAISE EXCEPTION 'A4 FAIL availability does not report TZS 125,000'; END IF;
END $$;
\echo '[A5] public plan discovery'
SELECT 'A5 '||(d->>'currency')||' plans='||jsonb_array_length(d->'plans')||' '||(d->'plans'->0->>'currency')||' '||(d->'plans'->0->>'total')
FROM (SELECT discover_staynas_public_rate_plans((SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'),'e0000000-0000-4000-8000-000000000001',current_date+7,current_date+8,2,0,0) d) x;
\echo '[A6] server-issued quote'
CREATE TEMP TABLE a_quote AS SELECT staynas_create_reservation_quote((SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'),'deluxe-double',current_date+7,current_date+8,2,0,0,'[]','f0000000-0000-4000-8000-000000000001',NULL,'guest@example.test',600) q;
SELECT 'A6 quote currency='||(q->>'currency')||' accommodation='||(q->>'accommodation_subtotal')||' total='||(q->>'total') FROM a_quote;
\echo '[A7] reservation from quote (browser total is never submitted)'
CREATE TEMP TABLE a_res AS SELECT staynas_create_reservation_from_quote((q->>'quote_id')::uuid,(SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'),q->>'quote_id','Test Guest','guest@example.test',NULL,NULL,NULL,'pay_at_property','website',NULL,NULL,'pending',NULL,NULL,NULL) r FROM a_quote;
SELECT 'A7 ok='||(r->>'ok')||' currency='||(r->>'currency')||' total='||(r->>'total') FROM a_res;
RESET ROLE;
\echo '[A8] persisted reservation evidence'
SELECT 'A8 booking '||currency||' subtotal='||subtotal||' total='||total||' balance_due='||balance_due||' snapshot_ccy='||(pricing_snapshot->>'currency')||' status='||status||' payment='||payment_status FROM bookings WHERE id=(SELECT (r->>'booking_id')::uuid FROM a_res);
SELECT 'A8 night '||date||' '||nightly_rate||' '||(pricing_snapshot->>'currency') FROM booking_nights WHERE booking_id=(SELECT (r->>'booking_id')::uuid FROM a_res);
DO $$ DECLARE b record; BEGIN
  SELECT * INTO b FROM bookings WHERE id=(SELECT (r->>'booking_id')::uuid FROM a_res);
  IF b.currency<>'TZS' OR b.subtotal<>125000 OR b.total<>(SELECT (q->>'total')::numeric FROM a_quote) OR b.pricing_snapshot->>'currency'<>'TZS'
  THEN RAISE EXCEPTION 'A8 FAIL persisted booking %/% snapshot %',b.currency,b.total,b.pricing_snapshot->>'currency'; END IF;
  IF EXISTS (SELECT 1 FROM booking_nights n WHERE n.booking_id=b.id AND (n.nightly_rate<>125000 OR n.pricing_snapshot->>'currency'<>'TZS'))
  THEN RAISE EXCEPTION 'A8 FAIL nightly snapshot'; END IF;
END $$;
\echo '[A9] reconciliation report after the fix'
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false) \g /dev/null
SELECT 'A9 '||entity||' '||reference||' '||recorded_currency||'->'||expected_currency||' '||severity FROM staynas_currency_integrity_findings((SELECT property_id FROM rooms WHERE id='e0000000-0000-4000-8000-000000000001'));
\echo 'TEST A PASSED'
