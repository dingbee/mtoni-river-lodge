-- SPE-08 property-scoped pricing intelligence contracts.
BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staynas_pricing_intelligence_runs','staynas_pricing_recommendations',
    'staynas_pricing_recommendation_events','staynas_pricing_forecasts',
    'staynas_pricing_scenarios','staynas_competitor_observations'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'Required table missing: %', t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.' || t)) THEN RAISE EXCEPTION 'RLS disabled: %', t; END IF;
    IF has_table_privilege('anon','public.' || t,'SELECT') THEN RAISE EXCEPTION 'Anonymous read privilege exists: %', t; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
        AND policyname=t || '_property_read' AND qual LIKE '%staynas_user_has_property_access%'
    ) THEN RAISE EXCEPTION 'Property-scoped read policy missing: %', t; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.staynas_pricing_recommendations'::regclass AND tgname='staynas_pi_recommendation_transition_guard' AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'Recommendation transition guard missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.staynas_pricing_recommendation_events'::regclass AND tgname='staynas_pi_events_immutable' AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'Append-only audit guard missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staynas_pricing_forecasts' AND column_name='method_version')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staynas_pricing_forecasts' AND column_name='data_coverage')
    THEN RAISE EXCEPTION 'Forecast version/coverage metadata missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staynas_pricing_recommendations' AND column_name='explanation')
    THEN RAISE EXCEPTION 'Recommendation explanation column missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.staynas_pricing_recommendation_events'::regclass
      AND conname='staynas_pi_event_recommendation_property_fk'
  ) THEN RAISE EXCEPTION 'Recommendation event/property composite FK missing'; END IF;
  IF has_table_privilege('authenticated','public.staynas_pricing_recommendation_events','DELETE')
    THEN RAISE EXCEPTION 'Authenticated users can delete recommendation audit history'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='staynas_pricing_recommendations'
      AND policyname='staynas_pi_recommendations_property_update'
      AND qual LIKE '%owner%' AND qual LIKE '%manager%' AND qual LIKE '%admin%' AND qual NOT LIKE '%finance%'
  ) THEN RAISE EXCEPTION 'Recommendation approval policy is not limited to property administrators'; END IF;
END $$;

-- Synthetic disposable fixtures prove the RLS predicates. No production/UAT data is used.
INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');
INSERT INTO public.staynas_organisations(id,slug,name) VALUES
  ('99999999-9999-4999-8999-999999999999','spe08-test-org','SPE-08 Test Organisation');
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name) VALUES
  ('44444444-4444-4444-8444-444444444444','99999999-9999-4999-8999-999999999999','spe08-property-a','SPE08-A','SPE-08 Property A'),
  ('55555555-5555-4555-8555-555555555555','99999999-9999-4999-8999-999999999999','spe08-property-b','SPE08-B','SPE-08 Property B');
INSERT INTO public.staynas_property_members(property_id,user_id,status) VALUES
  ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','active'),
  ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','active'),
  ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','active');
INSERT INTO public.user_roles(user_id,role) VALUES
  ('11111111-1111-4111-8111-111111111111','manager'),
  ('22222222-2222-4222-8222-222222222222','owner'),
  ('33333333-3333-4333-8333-333333333333','finance');
INSERT INTO public.staynas_pricing_recommendations(
  id,property_id,recommendation_type,window_from,window_to,confidence,method_version,
  current_context,proposed_action,evidence,explanation,status
) VALUES
  ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','rate_review','2026-12-01','2026-12-02',0.7,'test-v1','{}','{}','[]','{}','pending_review'),
  ('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555','rate_review','2026-12-01','2026-12-02',0.7,'test-v1','{}','{}','[]','{}','pending_review');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.staynas_pricing_recommendations;
  IF n <> 1 THEN RAISE EXCEPTION 'Property A user expected 1 visible recommendation, found %',n; END IF;
  SELECT count(*) INTO n FROM public.staynas_pricing_recommendations WHERE property_id='55555555-5555-4555-8555-555555555555';
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-property recommendation read was not denied'; END IF;
  BEGIN
    INSERT INTO public.staynas_pricing_recommendations(
      property_id,recommendation_type,window_from,window_to,confidence,method_version,
      current_context,proposed_action,evidence,explanation
    ) VALUES ('55555555-5555-4555-8555-555555555555','rate_review','2026-12-03','2026-12-04',0.6,'test-v1','{}','{}','[]','{}');
    RAISE EXCEPTION 'Cross-property recommendation insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.staynas_pricing_recommendations
    SET status='approved',reviewed_by='11111111-1111-4111-8111-111111111111',reviewed_at=now(),decision_reason='UAT approval'
    WHERE id='66666666-6666-4666-8666-666666666666';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Assigned property manager approval failed'; END IF;
  INSERT INTO public.staynas_pricing_recommendation_events(
    property_id,recommendation_id,event_type,actor_id,reason
  ) VALUES ('44444444-4444-4444-8444-444444444444','66666666-6666-4666-8666-666666666666','approved','11111111-1111-4111-8111-111111111111','UAT approval');
  BEGIN
    INSERT INTO public.staynas_pricing_recommendation_events(
      property_id,recommendation_id,event_type,actor_id
    ) VALUES ('44444444-4444-4444-8444-444444444444','77777777-7777-4777-8777-777777777777','generated','11111111-1111-4111-8111-111111111111');
    RAISE EXCEPTION 'Cross-property recommendation event link unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.staynas_pricing_recommendations SET proposed_action='{"tampered":true}'
    WHERE id='66666666-6666-4666-8666-666666666666';
    RAISE EXCEPTION 'Recommendation evidence mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Pricing recommendation evidence and proposal are immutable' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.staynas_pricing_recommendations SET status='approved'
    WHERE id='66666666-6666-4666-8666-666666666666';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Finance role unexpectedly approved a pricing recommendation'; END IF;
END $$;

RESET ROLE;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.staynas_pricing_recommendation_events SET reason='tampered'
      WHERE recommendation_id='66666666-6666-4666-8666-666666666666';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Pricing intelligence audit history is append-only' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Recommendation audit mutation was not blocked'; END IF;
END $$;

ROLLBACK;
