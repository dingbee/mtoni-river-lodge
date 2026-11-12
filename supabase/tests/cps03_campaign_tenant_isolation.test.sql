-- CPS-03 property isolation and publication visibility contract.
-- Executed against an isolated PostgreSQL 17 database after the CPS-03 migration.
BEGIN;

DO $test$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'public.booking_pages',
    'public.booking_campaigns',
    'public.campaign_page_content',
    'public.campaign_room_selections',
    'public.campaign_offers',
    'public.campaign_attribution'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = v_table::regclass AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on %', v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('anon','public.booking_pages','INSERT')
    OR has_table_privilege('anon','public.booking_campaigns','INSERT')
    OR has_table_privilege('anon','public.campaign_page_content','INSERT')
    OR has_table_privilege('anon','public.campaign_attribution','INSERT')
    OR has_table_privilege('authenticated','public.campaign_attribution','INSERT') THEN
    RAISE EXCEPTION 'Public or tenant client can directly write campaign attribution or public content';
  END IF;

  IF NOT has_table_privilege('service_role','public.campaign_attribution','INSERT') THEN
    RAISE EXCEPTION 'Trusted server role cannot persist campaign attribution';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.campaign_room_selections'::regclass
      AND conname='campaign_room_selections_room_property_fkey'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.campaign_attribution'::regclass
      AND conname='campaign_attribution_booking_property_fkey'
  ) THEN
    RAISE EXCEPTION 'Composite property integrity constraints are missing';
  END IF;
END
$test$;

INSERT INTO auth.users(id) VALUES
  ('40000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002');
INSERT INTO public.user_roles(user_id,role) VALUES
  ('40000000-0000-4000-8000-000000000001','owner'),
  ('40000000-0000-4000-8000-000000000002','owner');
INSERT INTO public.staynas_organisations(id,slug,name) VALUES
  ('10000000-0000-4000-8000-000000000001','cps03-org-one','CPS03 Organisation One'),
  ('10000000-0000-4000-8000-000000000002','cps03-org-two','CPS03 Organisation Two');
INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status,currency,timezone) VALUES
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','cps03-property-one','CPS03P1','CPS03 Property One','active','TZS','Africa/Dar_es_Salaam'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','cps03-property-two','CPS03P2','CPS03 Property Two','active','TZS','Africa/Dar_es_Salaam');
INSERT INTO public.staynas_property_members(property_id,user_id,role,status) VALUES
  ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','owner','active'),
  ('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','owner','active');
INSERT INTO public.staynas_user_property_context(user_id,property_id) VALUES
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
INSERT INTO public.staynas_room_catalogue_types(id,slug,name) VALUES
  ('32000000-0000-4000-8000-000000000001','cps03-room-type-one','CPS03 Room Type One'),
  ('32000000-0000-4000-8000-000000000002','cps03-room-type-two','CPS03 Room Type Two');
INSERT INTO public.rooms(id,property_id,slug,name,status,catalogue_type_id,base_price,currency) VALUES
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','room-one','Room One','active','32000000-0000-4000-8000-000000000001',100000,'TZS'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','room-two','Room Two','active','32000000-0000-4000-8000-000000000002',120000,'TZS');
INSERT INTO public.staynas_rate_plans(id,property_id,code,name,currency,publication_status,active) VALUES
  ('51000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RACK','Rack Rate','TZS','draft',true);
INSERT INTO public.staynas_rate_plan_room_types(property_id,rate_plan_id,room_type_id,active,display_order) VALUES
  ('20000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',true,1);
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.set_staynas_rate_plan_publication(
  '51000000-0000-4000-8000-000000000001','published',true,'CPS03 test publication reason'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);

INSERT INTO public.booking_pages(organisation_id,property_id,slug,title,status)
VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','book','Book Direct','draft');

INSERT INTO public.booking_campaigns(id,organisation_id,property_id,slug,name,status)
VALUES ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','resident-escape','Resident Escape','draft');

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.booking_campaigns(organisation_id,property_id,slug,name,status)
    VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','direct-publish','Direct Publish','published');
    RAISE EXCEPTION 'Tenant inserted a published campaign';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$test$;

INSERT INTO public.campaign_page_content(campaign_id,property_id,version,status,content)
VALUES ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'draft','{"headline":"Resident Escape"}');

INSERT INTO public.campaign_room_selections(campaign_id,property_id,room_id)
VALUES ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');

INSERT INTO public.campaign_offers(campaign_id,property_id,offer_code,title,rate_plan_publication_id)
VALUES ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','resident-rate','Resident Rate',(SELECT id FROM public.staynas_rate_plan_publications WHERE rate_plan_id='51000000-0000-4000-8000-000000000001' ORDER BY publication_number DESC LIMIT 1));

SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.booking_campaigns(organisation_id,property_id,slug,name)
    VALUES ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','cross-tenant','Cross Tenant');
    RAISE EXCEPTION 'Cross-property campaign insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.campaign_room_selections(campaign_id,property_id,room_id)
    VALUES ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Cross-property room reference unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.booking_campaigns SET status='published', published_at=now()
    WHERE id='60000000-0000-4000-8000-000000000001';
    IF FOUND THEN RAISE EXCEPTION 'Tenant client unexpectedly published a campaign'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.booking_campaigns(organisation_id,property_id,slug,name)
    VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','book','Slug Collision');
    RAISE EXCEPTION 'Campaign reused the permanent booking page slug';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.booking_campaigns WHERE property_id='20000000-0000-4000-8000-000000000002') <> 0 THEN
    RAISE EXCEPTION 'Tenant can read another property campaign';
  END IF;
END
$test$;

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.staynas_properties SET currency='USD'
WHERE id='20000000-0000-4000-8000-000000000001';
DO $test$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.cps03_configure_booking_campaign(
      '60000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      ARRAY['30000000-0000-4000-8000-000000000001']::uuid[],
      (SELECT id FROM public.staynas_rate_plan_publications WHERE rate_plan_id='51000000-0000-4000-8000-000000000001' ORDER BY publication_number DESC LIMIT 1),
      'resident-rate','Resident Rate','a mismatched currency must be rejected',
      '40000000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Campaign offer accepted a mismatched rate-plan currency'; END IF;
END
$test$;
UPDATE public.staynas_properties SET currency='TZS'
WHERE id='20000000-0000-4000-8000-000000000001';
DO $test$
BEGIN
  PERFORM public.cps03_configure_booking_campaign(
    '60000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    ARRAY['30000000-0000-4000-8000-000000000001']::uuid[],
    (SELECT id FROM public.staynas_rate_plan_publications WHERE rate_plan_id='51000000-0000-4000-8000-000000000001' ORDER BY publication_number DESC LIMIT 1),
    'resident-rate',
    'Resident Rate',
    'Published resident rate snapshot',
    '40000000-0000-4000-8000-000000000001'
  );
END
$test$;
UPDATE public.booking_pages SET status='published', published_at=now()
WHERE property_id='20000000-0000-4000-8000-000000000001';
UPDATE public.staynas_properties SET currency='USD'
WHERE id='20000000-0000-4000-8000-000000000001';
DO $test$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.cps03_publish_booking_campaign(
      '60000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      1
    );
  EXCEPTION WHEN raise_exception THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Campaign publication accepted a mismatched rate-plan currency'; END IF;
END
$test$;
UPDATE public.staynas_properties SET currency='TZS'
WHERE id='20000000-0000-4000-8000-000000000001';
DO $test$
BEGIN
  PERFORM public.cps03_publish_booking_campaign(
    '60000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    1
  );
END
$test$;

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.staynas_properties SET currency='USD'
WHERE id='20000000-0000-4000-8000-000000000001';
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.booking_campaigns WHERE id='60000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Valid USD property was incorrectly hidden from the public campaign route';
  END IF;
  IF (SELECT count(*) FROM public.booking_pages WHERE property_id='20000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Valid USD property was incorrectly hidden from the permanent direct booking page';
  END IF;
END
$test$;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.staynas_properties SET currency='TZS'
WHERE id='20000000-0000-4000-8000-000000000001';
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    UPDATE public.booking_campaigns SET name='Tenant Bypass'
    WHERE id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Tenant modified published campaign configuration';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.campaign_page_content SET content='{"headline":"Tenant Bypass"}'::jsonb
    WHERE campaign_id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Tenant modified immutable campaign content';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.campaign_offers SET active=false
    WHERE campaign_id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Tenant modified published campaign offer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.campaign_room_selections
    WHERE campaign_id='60000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Tenant modified published campaign room selection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;
RESET ROLE;
SET LOCAL ROLE service_role;

INSERT INTO public.booking_campaigns(id,organisation_id,property_id,slug,name,status)
VALUES ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','second-campaign','Second Campaign','draft');
DO $test$
DECLARE v_schedule jsonb;
BEGIN
  v_schedule := public.cps03_set_campaign_schedule(
    '60000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    current_date,
    current_date + 7,
    '40000000-0000-4000-8000-000000000001'
  );
  IF ((v_schedule->>'starts_at')::timestamptz AT TIME ZONE 'Africa/Dar_es_Salaam')::date <> current_date THEN
    RAISE EXCEPTION 'Campaign start date was not interpreted in the property timezone';
  END IF;
  IF ((v_schedule->>'ends_at')::timestamptz AT TIME ZONE 'Africa/Dar_es_Salaam')::date <> current_date + 7 THEN
    RAISE EXCEPTION 'Campaign end date was not interpreted in the property timezone';
  END IF;
END
$test$;
DO $test$
DECLARE v_created jsonb;
BEGIN
  v_created := public.cps03_create_booking_campaign(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'timezone-created-campaign',
    'Timezone Created Campaign',
    current_date,
    current_date + 2,
    '40000000-0000-4000-8000-000000000001'
  );
  IF ((v_created->>'starts_at')::timestamptz AT TIME ZONE 'Africa/Dar_es_Salaam')::date <> current_date THEN
    RAISE EXCEPTION 'Campaign creation did not use property-local start date';
  END IF;
END
$test$;
INSERT INTO public.campaign_page_content(campaign_id,property_id,version,status,content)
VALUES ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',1,'draft','{"headline":"Second Campaign"}');
INSERT INTO public.campaign_room_selections(campaign_id,property_id,room_id)
VALUES ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
INSERT INTO public.campaign_offers(campaign_id,property_id,offer_code,title,rate_plan_publication_id)
VALUES ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','second-rate','Second Rate',(SELECT id FROM public.staynas_rate_plan_publications WHERE rate_plan_id='51000000-0000-4000-8000-000000000001' ORDER BY publication_number DESC LIMIT 1));
DO $test$
BEGIN
  BEGIN
    PERFORM public.cps03_publish_booking_campaign(
      '60000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      1
    );
    RAISE EXCEPTION 'Campaign publication exceeded the configured active-campaign quota';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%quota has been reached%' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;
SET LOCAL ROLE anon;

DO $test$
BEGIN
  IF (SELECT count(*) FROM public.booking_pages WHERE property_id='20000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Published permanent booking page is not publicly readable';
  END IF;
  IF (SELECT count(*) FROM public.booking_campaigns WHERE id='60000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Published campaign is not publicly readable';
  END IF;
  IF (SELECT count(*) FROM public.campaign_page_content WHERE campaign_id='60000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Published campaign content is not publicly readable';
  END IF;
  IF (SELECT count(*) FROM public.campaign_room_selections WHERE campaign_id='60000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Published campaign room selection is not publicly readable';
  END IF;
  IF (SELECT count(*) FROM public.campaign_offers WHERE campaign_id='60000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Published campaign offer is not publicly readable';
  END IF;
  IF (SELECT count(*) FROM public.booking_campaigns WHERE id='60000000-0000-4000-8000-000000000002') <> 0 THEN
    RAISE EXCEPTION 'Draft campaign became publicly visible after quota rejection';
  END IF;
END
$test$;

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.staynas_properties SET status='suspended'
WHERE id='20000000-0000-4000-8000-000000000001';
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.booking_campaigns WHERE id='60000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'Published campaign remained publicly visible after property deactivation';
  END IF;
END
$test$;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.staynas_properties SET status='active'
WHERE id='20000000-0000-4000-8000-000000000001';
INSERT INTO public.campaign_attribution(campaign_id,property_id,session_key,event_type,event_key,utm_campaign)
VALUES ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','session-key-cps03-0001','page_view','60000000-0000-4000-8000-000000000001:session-key-cps03-0001:page_view','resident-escape')
ON CONFLICT (property_id,event_key) DO NOTHING;
INSERT INTO public.campaign_attribution(campaign_id,property_id,session_key,event_type,event_key,utm_campaign)
VALUES ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','session-key-cps03-0001','page_view','60000000-0000-4000-8000-000000000001:session-key-cps03-0001:page_view','resident-escape')
ON CONFLICT (property_id,event_key) DO NOTHING;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.campaign_attribution WHERE property_id='20000000-0000-4000-8000-000000000001' AND event_key='60000000-0000-4000-8000-000000000001:session-key-cps03-0001:page_view') <> 1 THEN
    RAISE EXCEPTION 'Campaign attribution event key is not idempotent';
  END IF;
END
$test$;
SELECT public.cps03_transition_booking_campaign(
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'pause'
);
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.booking_campaigns WHERE id='60000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'Paused campaign remained publicly visible';
  END IF;
END
$test$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT public.cps03_transition_booking_campaign(
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'archive'
);
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.booking_campaigns WHERE id='60000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'Archived campaign remained publicly visible';
  END IF;
END
$test$;
RESET ROLE;
ROLLBACK;
