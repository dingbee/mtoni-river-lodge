-- CPS-04 executable database contracts: scope, currency, rate assignment, RLS and publication versioning.
BEGIN;

INSERT INTO public.staynas_organisations (id, slug, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Organisation A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Organisation B');

INSERT INTO public.staynas_properties (id, organisation_id, slug, code, name, currency, timezone, status) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'cps04-property-a', 'CPS04A', 'CPS04 Property A', 'TZS', 'Africa/Dar_es_Salaam', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'cps04-property-b', 'CPS04B', 'CPS04 Property B', 'KES', 'Africa/Nairobi', 'active');

INSERT INTO auth.users (id) VALUES
  ('30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002');

INSERT INTO public.staynas_property_members (property_id, user_id, role, status) VALUES
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'owner', 'active');

INSERT INTO public.rooms (id, property_id, catalogue_type_id, status) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'active'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'active');

INSERT INTO public.staynas_rate_plans (id, property_id, publication_status, active) VALUES
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'published', true),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'published', true),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'published', true),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'published', true);

INSERT INTO public.staynas_rate_plan_publications
  (id, property_id, rate_plan_id, publication_number, currency, room_type_assignments) VALUES
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 1, 'TZS', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 2, 'TZS', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 1, 'KES', '[{"room_type_id":"50000000-0000-4000-8000-000000000002"}]'),
  ('70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 3, 'TZS', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 4, 'TZS', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 1, 'EUR', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 1, 'TZS', '[{"room_type_id":"500000000000000000000000000099"}]');

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.staynas_booking_product_configurations'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Booking product configuration RLS is not enabled';
  END IF;

  IF has_table_privilege('anon', 'public.staynas_booking_product_configurations', 'SELECT')
     OR has_table_privilege('anon', 'public.staynas_booking_product_configurations', 'INSERT')
     OR has_table_privilege('anon', 'public.staynas_booking_product_configurations', 'UPDATE')
     OR has_table_privilege('anon', 'public.staynas_booking_product_configurations', 'DELETE') THEN
    RAISE EXCEPTION 'Anonymous users have direct access to booking product configurations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staynas_booking_product_configurations'::regclass
      AND conname = 'staynas_booking_product_unique'
  ) THEN
    RAISE EXCEPTION 'Booking product uniqueness constraint is missing';
  END IF;
END
$test$;

-- Valid permanent product uses the latest property-currency publication.
INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel, publication_status)
VALUES
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000002', 'permanent', 'draft');

-- Valid campaign configuration is persisted independently, with no client price override.
INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel, campaign_slug, offer_code, offer_name)
VALUES
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000002', 'campaign', 'summer-escape', 'SUMMER', 'Summer Escape');

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
       '70000000-0000-4000-8000-000000000002', 'permanent');
    RAISE EXCEPTION 'Cross-property room fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Cross-property room fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       '70000000-0000-4000-8000-000000000001', 'permanent');
    RAISE EXCEPTION 'Obsolete rate-plan publication fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Obsolete rate-plan publication fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       '70000000-0000-4000-8000-000000000004', 'permanent');
    RAISE EXCEPTION 'Currency mismatch fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Currency mismatch fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       '70000000-0000-4000-8000-000000000005', 'permanent');
    RAISE EXCEPTION 'Room-type assignment fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Room-type assignment fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;

-- Tenant A can see its own configuration but not Tenant B's.
INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel)
VALUES
  ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
   '70000000-0000-4000-8000-000000000003', 'permanent');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
DO $test$
DECLARE
  own_count integer;
  foreign_count integer;
BEGIN
  SELECT count(*) INTO own_count
  FROM public.staynas_booking_product_configurations
  WHERE property_id = '20000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO foreign_count
  FROM public.staynas_booking_product_configurations
  WHERE property_id = '20000000-0000-4000-8000-000000000002';
  IF own_count <> 2 OR foreign_count <> 0 THEN
    RAISE EXCEPTION 'Tenant RLS isolation failed (own %, foreign %)', own_count, foreign_count;
  END IF;
END
$test$;
RESET ROLE;

-- Published edits must become a new hidden draft version.
UPDATE public.staynas_booking_product_configurations
SET publication_status = 'published', public_visible = true;
UPDATE public.staynas_booking_product_configurations
SET display_order = display_order + 1;

DO $test$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.staynas_booking_product_configurations
  WHERE publication_status = 'draft' AND public_visible = false AND configuration_version = 2;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Published configuration edits did not create hidden draft versions';
  END IF;
END
$test$;

ROLLBACK;
