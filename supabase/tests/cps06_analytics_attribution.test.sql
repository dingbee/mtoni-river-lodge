-- CPS-06 structural contracts: durable attribution, tenant isolation,
-- server-only ingestion, lifecycle capture and currency-safe campaign reporting.
BEGIN;
SELECT plan(1);

DO $test$
DECLARE
  v_rel oid;
  v_report text;
  v_lifecycle text;
BEGIN
  SELECT c.oid INTO v_rel
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='staynas_booking_analytics_events';
  IF v_rel IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=v_rel) THEN
    RAISE EXCEPTION 'CPS-06 analytics event table is missing or RLS is disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='staynas_booking_attributions' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'CPS-06 attribution table is missing or RLS is disabled';
  END IF;

  IF has_table_privilege('anon','public.staynas_booking_analytics_events','SELECT')
     OR has_table_privilege('anon','public.staynas_booking_analytics_events','INSERT')
     OR has_table_privilege('anon','public.staynas_booking_attributions','SELECT') THEN
    RAISE EXCEPTION 'Anonymous role has direct access to CPS-06 analytics data';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='attribution_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_reservation_quotes' AND column_name='attribution_id'
  ) THEN
    RAISE EXCEPTION 'Quote and booking attribution linkage columns are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.bookings'::regclass AND tgname='staynas_booking_analytics_lifecycle' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.payment_events'::regclass AND tgname='staynas_payment_analytics_lifecycle' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.bookings'::regclass AND tgname='staynas_z_booking_attribution_property_guard' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.staynas_reservation_quotes'::regclass AND tgname='staynas_quote_attribution_property_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Booking/payment lifecycle or attribution property guard triggers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='staynas_booking_analytics_events'
      AND indexname='staynas_booking_analytics_event_key_uidx'
  ) THEN
    RAISE EXCEPTION 'Property-scoped analytics event idempotency constraint is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('staynas_upsert_booking_attribution','staynas_record_booking_analytics_event')
      AND has_function_privilege('anon',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Anonymous role can execute server-only attribution or event-ingestion RPCs';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_lifecycle
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='staynas_capture_booking_analytics_lifecycle';
  IF v_lifecycle IS NULL
     OR position('manual_payment' in v_lifecycle)=0
     OR position('payment_completed' in v_lifecycle)=0
     OR position('provider_reversal' in v_lifecycle)=0
     OR position('payment_reversed' in v_lifecycle)=0
     OR position('payment_refunded' in v_lifecycle)=0 THEN
    RAISE EXCEPTION 'Payment ledger event normalization does not cover manual, Pesapal, cash refund and provider reversal events';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_report
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='staynas_get_booking_analytics';
  IF v_report IS NULL
     OR position('net_collected_by_currency' in v_report)=0
     OR position('confirmed_booking_value' in v_report)=0
     OR position('amount_paid' in v_report)=0
     OR position('outstanding' in v_report)=0
     OR position('refunds' in v_report)=0
     OR position('provider_reversals' in v_report)=0
     OR position('last_touch_acquisition' in v_report)=0 THEN
    RAISE EXCEPTION 'Financial reconciliation or campaign currency separation is incomplete';
  END IF;
END
$test$;

-- Synthetic, transaction-scoped end-to-end lifecycle fixture. All rows are
-- rolled back at the end of this test; no shared or live tenant data is touched.
INSERT INTO auth.users(id) VALUES
  ('91000000-0000-4000-8000-000000000001');
INSERT INTO public.user_roles(user_id,role) VALUES
  ('91000000-0000-4000-8000-000000000001','owner');
INSERT INTO public.staynas_organisations(id,slug,name) VALUES
  ('92000000-0000-4000-8000-000000000001','cps06-e2e-org','CPS-06 E2E Organisation'),
  ('92000000-0000-4000-8000-000000000002','cps06-e2e-org-two','CPS-06 E2E Organisation Two');
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status,currency,timezone) VALUES
  ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
   'cps06-e2e-property','CPS06E2E','CPS-06 E2E Property','active','TZS','Africa/Dar_es_Salaam'),
  ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',
   'cps06-e2e-property-two','CPS06E2E2','CPS-06 E2E Property Two','active','TZS','Africa/Dar_es_Salaam');
INSERT INTO public.staynas_property_members(property_id,user_id,role,status) VALUES
  ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.staynas_user_property_context(user_id,property_id) VALUES
  ('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
INSERT INTO public.staynas_room_catalogue_types(id,slug,name,status) VALUES
  ('94000000-0000-4000-8000-000000000001','cps06-e2e-room-type','CPS-06 E2E Room Type','active'),
  ('94000000-0000-4000-8000-000000000002','cps06-e2e-room-type-two','CPS-06 E2E Room Type Two','active');
INSERT INTO public.rooms(id,property_id,catalogue_type_id,slug,name,status,base_price,currency) VALUES
  ('95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',
   '94000000-0000-4000-8000-000000000001','cps06-e2e-room','CPS-06 E2E Room','active',100,'TZS'),
  ('95000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002',
   '94000000-0000-4000-8000-000000000002','cps06-e2e-room-two','CPS-06 E2E Room Two','active',100,'TZS');
INSERT INTO public.booking_campaigns(id,organisation_id,property_id,slug,name,status) VALUES
  ('96000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
   '93000000-0000-4000-8000-000000000001','cps06-e2e-campaign','CPS-06 E2E Campaign','published');

SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"91000000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);

DO $e2e$
DECLARE
  v_attribution_a uuid;
  v_attribution_b uuid;
  v_quote_a uuid := '97000000-0000-4000-8000-000000000001';
  v_quote_b uuid := '97000000-0000-4000-8000-000000000002';
  v_booking_a uuid := '98000000-0000-4000-8000-000000000001';
  v_booking_b uuid := '98000000-0000-4000-8000-000000000002';
  v_manual_payment uuid := '99000000-0000-4000-8000-000000000001';
  v_report jsonb;
  v_money jsonb;
  v_campaign jsonb;
  v_reversal jsonb;
  v_first_touch jsonb;
  v_last_touch jsonb;
  v_rejected boolean := false;
BEGIN
  SELECT (public.staynas_upsert_booking_attribution(
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'cps06-e2e-session-alpha-0001',
    null,null,'96000000-0000-4000-8000-000000000001',null,
    '{"source":"google","medium":"cpc"}'::jsonb,now(),true
  )->>'attribution_id')::uuid INTO v_attribution_a;

  BEGIN
    INSERT INTO public.staynas_reservation_quotes(
      id,property_id,room_id,request,quote_snapshot,quote_hash,expires_at,attribution_id
    ) VALUES (
      '97000000-0000-4000-8000-000000000099',
      '93000000-0000-4000-8000-000000000002',
      '95000000-0000-4000-8000-000000000002',
      '{}'::jsonb,'{}'::jsonb,'cps06-cross-property-attribution',now()+interval '1 day',
      v_attribution_a
    );
    RAISE EXCEPTION 'Cross-property quote attribution unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;


  PERFORM public.staynas_upsert_booking_attribution(
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'cps06-e2e-session-alpha-0001',
    null,null,'96000000-0000-4000-8000-000000000001',null,
    '{"source":"direct","medium":"none"}'::jsonb,now(),false
  );
  PERFORM public.staynas_upsert_booking_attribution(
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'cps06-e2e-session-alpha-0001',
    null,null,'96000000-0000-4000-8000-000000000001',null,
    '{"source":"newsletter","medium":"email"}'::jsonb,now(),true
  );

  SELECT first_touch,last_touch INTO v_first_touch,v_last_touch
  FROM public.staynas_booking_attributions WHERE id=v_attribution_a;
  IF v_first_touch->>'source'<>'google' OR v_last_touch->>'source'<>'newsletter' THEN
    RAISE EXCEPTION 'First/last touch attribution update contract failed';
  END IF;

  SELECT (public.staynas_upsert_booking_attribution(
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'cps06-e2e-session-beta-0002',
    null,null,'96000000-0000-4000-8000-000000000001',null,
    '{"source":"partner","medium":"referral"}'::jsonb,now(),true
  )->>'attribution_id')::uuid INTO v_attribution_b;

  PERFORM public.staynas_record_booking_analytics_event(
    '93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    'campaign_page_viewed','cps06-e2e-page-view-alpha-0001','browser_observed',
    v_attribution_a,'96000000-0000-4000-8000-000000000001',null,null,
    'cps06-e2e-session-alpha-0001','google','cpc','launch','hero','stay',
    null,'/p/cps06-e2e-property/campaign/cps06-e2e-campaign',null,null,null,'{}'::jsonb
  );
  PERFORM public.staynas_record_booking_analytics_event(
    '93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    'campaign_page_viewed','cps06-e2e-page-view-alpha-0001','browser_observed',
    v_attribution_a,'96000000-0000-4000-8000-000000000001',null,null,
    'cps06-e2e-session-alpha-0001','google','cpc','launch','hero','stay',
    null,'/p/cps06-e2e-property/campaign/cps06-e2e-campaign',null,null,null,'{}'::jsonb
  );

  BEGIN
    PERFORM public.staynas_record_booking_analytics_event(
      '93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
      'payment_completed','cps06-e2e-browser-forged-payment-0001','browser_observed',
      v_attribution_a,'96000000-0000-4000-8000-000000000001',null,null,
      'cps06-e2e-session-alpha-0001',null,null,null,null,null,null,null,null,'TZS',100,'{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Browser-sourced financial event was not rejected'; END IF;

  INSERT INTO public.staynas_reservation_quotes(id,property_id,room_id,request,quote_snapshot,quote_hash,expires_at)
  VALUES
    (v_quote_a,'93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',
     '{"source":"cps06-e2e"}','{"total":100,"currency":"TZS"}','cps06-e2e-quote-alpha',now()+interval '1 day'),
    (v_quote_b,'93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',
     '{"source":"cps06-e2e"}','{"total":200,"currency":"TZS"}','cps06-e2e-quote-beta',now()+interval '1 day');

  IF NOT public.staynas_attach_quote_attribution(v_quote_a,'93000000-0000-4000-8000-000000000001',v_attribution_a)
     OR NOT public.staynas_attach_quote_attribution(v_quote_b,'93000000-0000-4000-8000-000000000001',v_attribution_b) THEN
    RAISE EXCEPTION 'Quote attribution attachment failed';
  END IF;

  PERFORM public.staynas_record_booking_analytics_event(
    '93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    'quote_generated','cps06-e2e-quote-event-alpha-0001','server_confirmed',
    v_attribution_a,'96000000-0000-4000-8000-000000000001',null,v_quote_a,
    'cps06-e2e-session-alpha-0001',null,null,null,null,null,null,'/p/cps06-e2e-property/book',null,null,null,'{}'::jsonb
  );
  PERFORM public.staynas_record_booking_analytics_event(
    '93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    'booking_started','cps06-e2e-booking-start-alpha-0001','server_confirmed',
    v_attribution_a,'96000000-0000-4000-8000-000000000001',null,v_quote_a,
    'cps06-e2e-session-alpha-0001',null,null,null,null,null,null,'/p/cps06-e2e-property/book',null,null,null,'{}'::jsonb
  );

  INSERT INTO public.bookings(
    id,reference,room_id,check_in,check_out,nights,adults,guest_name,guest_email,
    total,currency,status,payment_status,property_id,reservation_quote_id,balance_amount,paid_amount
  ) VALUES
    (v_booking_a,'CPS06-E2E-A','95000000-0000-4000-8000-000000000001',
     current_date+30,current_date+31,1,1,'CPS06 Guest A','cps06-a@example.test',
     100,'TZS','pending','deposit_paid','93000000-0000-4000-8000-000000000001',v_quote_a,50,50),
    (v_booking_b,'CPS06-E2E-B','95000000-0000-4000-8000-000000000001',
     current_date+32,current_date+33,1,1,'CPS06 Guest B','cps06-b@example.test',
     200,'TZS','pending','paid','93000000-0000-4000-8000-000000000001',v_quote_b,0,200);

  IF (SELECT count(*) FROM public.bookings
      WHERE id IN (v_booking_a,v_booking_b) AND attribution_id IS NOT NULL)<>2 THEN
    RAISE EXCEPTION 'Quote-to-reservation attribution inheritance failed';
  END IF;

  UPDATE public.bookings SET status='confirmed' WHERE id IN (v_booking_a,v_booking_b);
  UPDATE public.bookings
  SET pesapal_order_tracking_id='cps06-e2e-pesapal-track',
      payment_provider='pesapal'
  WHERE id=v_booking_b;

  INSERT INTO public.payment_events(id,booking_id,provider,event_type,amount,currency,raw)
  VALUES (v_manual_payment,v_booking_a,'manual','manual_payment',60,'TZS','{"note":"E2E manual settlement"}');

  INSERT INTO public.payment_events(id,booking_id,provider,event_type,amount,currency,reverses_event_id,raw)
  VALUES ('99000000-0000-4000-8000-000000000002',v_booking_a,'manual','refund',-10,'TZS',
          v_manual_payment,'{"note":"E2E cash refund"}');

  INSERT INTO public.payment_events(id,booking_id,provider,event_type,amount,currency,order_tracking_id,status_code,raw)
  VALUES ('99000000-0000-4000-8000-000000000003',v_booking_b,'pesapal','payment_completed',200,'TZS',
          'cps06-e2e-pesapal-track',1,'{"status":"COMPLETED"}');

  v_reversal := public.finalize_pesapal_reversal(
    v_booking_b,'cps06-e2e-pesapal-track',200,'TZS','status_check','{"fixture":"cps06-e2e"}'::jsonb
  );
  IF coalesce((v_reversal->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pesapal provider reversal fixture failed: %',v_reversal;
  END IF;

  IF (SELECT count(*) FROM public.staynas_booking_analytics_events
      WHERE property_id='93000000-0000-4000-8000-000000000001'
        AND event_key='cps06-e2e-page-view-alpha-0001')<>1 THEN
    RAISE EXCEPTION 'Analytics event idempotency failed';
  END IF;
  IF (SELECT count(*) FROM public.staynas_booking_analytics_events
      WHERE booking_id=v_booking_a AND event_type='payment_completed')<>1
     OR (SELECT count(*) FROM public.staynas_booking_analytics_events
      WHERE booking_id=v_booking_a AND event_type='payment_refunded')<>1
     OR (SELECT count(*) FROM public.staynas_booking_analytics_events
      WHERE booking_id=v_booking_b AND event_type='payment_completed')<>1
     OR (SELECT count(*) FROM public.staynas_booking_analytics_events
      WHERE booking_id=v_booking_b AND event_type='payment_reversed')<>1 THEN
    RAISE EXCEPTION 'Authoritative payment lifecycle events were not normalized exactly once';
  END IF;
END
$e2e$;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;

DO $report$
DECLARE
  v_report jsonb;
  v_money jsonb;
  v_campaign jsonb;
  v_first_touch jsonb;
  v_last_touch jsonb;
BEGIN
  v_report := public.staynas_get_booking_analytics(
    '93000000-0000-4000-8000-000000000001',now()-interval '1 day',now()+interval '1 day'
  );
  SELECT value INTO v_money
  FROM jsonb_array_elements(v_report->'currencies') value
  WHERE value->>'currency'='TZS';
  IF v_money IS NULL
     OR (v_money->>'gross_booking_value')::numeric<>300
     OR (v_money->>'confirmed_booking_value')::numeric<>300
     OR (v_money->>'amount_paid')::numeric<>260
     OR (v_money->>'outstanding')::numeric<>250
     OR (v_money->>'refunds')::numeric<>10
     OR (v_money->>'provider_reversals')::numeric<>200
     OR (v_money->>'net_collected')::numeric<>50 THEN
    RAISE EXCEPTION 'Currency-safe financial reconciliation failed: %',v_money;
  END IF;

  SELECT value INTO v_campaign
  FROM jsonb_array_elements(v_report->'campaigns') value
  WHERE value->>'id'='96000000-0000-4000-8000-000000000001';
  IF v_campaign IS NULL
     OR (v_campaign->>'views')::integer<>1
     OR (v_campaign->>'reservations')::integer<>2
     OR (v_campaign->>'paid_bookings')::integer<>2
     OR (v_campaign->'net_collected_by_currency'->0->>'net_collected')::numeric<>50 THEN
    RAISE EXCEPTION 'Campaign conversion/revenue attribution failed: %',v_campaign;
  END IF;

  SELECT value INTO v_first_touch
  FROM jsonb_array_elements(v_report->'acquisition') value
  WHERE value->>'source'='google' AND value->>'medium'='cpc';
  SELECT value INTO v_last_touch
  FROM jsonb_array_elements(v_report->'last_touch_acquisition') value
  WHERE value->>'source'='newsletter' AND value->>'medium'='email';
  IF v_first_touch IS NULL OR (v_first_touch->>'paid_bookings')::integer<>1
     OR v_last_touch IS NULL OR (v_last_touch->>'paid_bookings')::integer<>1 THEN
    RAISE EXCEPTION 'First-touch or last-touch conversion attribution did not reconcile';
  END IF;

  BEGIN
    PERFORM public.staynas_get_booking_analytics(
      '93000000-0000-4000-8000-000000000099',now()-interval '1 day',now()+interval '1 day'
    );
    RAISE EXCEPTION 'Property analytics access did not reject an unknown/foreign property';
  EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
    NULL;
  END;
END
$report$;

RESET ROLE;

SELECT pass('CPS-06 attribution, RLS, idempotency, lifecycle and currency contracts passed');
SELECT * FROM finish();
ROLLBACK;
