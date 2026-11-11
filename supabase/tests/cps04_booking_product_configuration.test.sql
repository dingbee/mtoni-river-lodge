-- CPS-04 executable database contracts: tenant scope, immutable rate publications,
-- property currency, room assignments, RLS, uniqueness and publication versioning.
BEGIN;
SELECT plan(1);

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

-- Seed canonical platform room types; rooms.catalogue_type_id is a real FK.
INSERT INTO public.staynas_room_catalogue_types (id, slug, name, status) VALUES
  ('50000000-0000-4000-8000-000000000001', 'cps04-catalogue-a', 'CPS04 Catalogue A', 'active'),
  ('50000000-0000-4000-8000-000000000002', 'cps04-catalogue-b', 'CPS04 Catalogue B', 'active');

INSERT INTO public.rooms (id, property_id, catalogue_type_id, slug, name, base_price, currency, status) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'cps04-room-a', 'CPS04 Room A', 120000, 'TZS', 'active'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'cps04-room-b', 'CPS04 Room B', 45000, 'KES', 'active');

-- Rate plans must be created as drafts, assigned to real room types, then published.
INSERT INTO public.staynas_rate_plans
  (id, property_id, code, name, currency, publication_status, active) VALUES
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CPS04-A1', 'CPS04 A Standard', 'TZS', 'draft', true),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'CPS04-B1', 'CPS04 B Standard', 'KES', 'draft', true),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'CPS04-A2', 'CPS04 A Currency Fixture', 'TZS', 'draft', true),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'CPS04-A3', 'CPS04 A Assignment Fixture', 'TZS', 'draft', true);

INSERT INTO public.staynas_rate_plan_room_types
  (property_id, rate_plan_id, room_type_id, active, display_order) VALUES
  ('20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', true, 1),
  ('20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', true, 1),
  ('20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', true, 1),
  ('20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001', true, 1);

SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
SELECT set_config('staynas.rate_plan_publication_reason', 'CPS-04 database fixture publication lifecycle', true);

-- Plan A is published twice so publication 1 is genuinely obsolete.
UPDATE public.staynas_rate_plans SET publication_status = 'published' WHERE id = '60000000-0000-4000-8000-000000000001';
UPDATE public.staynas_rate_plans SET publication_status = 'suspended' WHERE id = '60000000-0000-4000-8000-000000000001';
UPDATE public.staynas_rate_plans SET publication_status = 'draft' WHERE id = '60000000-0000-4000-8000-000000000001';
UPDATE public.staynas_rate_plans SET publication_status = 'published' WHERE id = '60000000-0000-4000-8000-000000000001';

UPDATE public.staynas_rate_plans SET publication_status = 'published'
WHERE id IN (
  '60000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000004'
);

SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
UPDATE public.staynas_rate_plans SET publication_status = 'published'
WHERE id = '60000000-0000-4000-8000-000000000002';

SELECT set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);

-- Add deliberately invalid latest snapshots to prove currency and assignment checks
-- against the same immutable publication contract used by production.
INSERT INTO public.staynas_rate_plan_publications
  (property_id, rate_plan_id, publication_number, rate_plan_version, code, name, currency,
   published_by, published_at, resolved_data, inheritance_trace, lineage, own_policy,
   room_type_assignments, snapshot_hash)
SELECT rp.property_id, rp.id, 2, rp.version, rp.code, rp.name, 'EUR',
       '30000000-0000-4000-8000-000000000001', now(), '{}'::jsonb, '[]'::jsonb,
       '[]'::jsonb, '{}'::jsonb,
       jsonb_build_array(jsonb_build_object('room_type_id', '50000000-0000-4000-8000-000000000001')),
       md5('cps04-currency-mismatch')
FROM public.staynas_rate_plans rp
WHERE rp.id = '60000000-0000-4000-8000-000000000003';

INSERT INTO public.staynas_rate_plan_publications
  (property_id, rate_plan_id, publication_number, rate_plan_version, code, name, currency,
   published_by, published_at, resolved_data, inheritance_trace, lineage, own_policy,
   room_type_assignments, snapshot_hash)
SELECT rp.property_id, rp.id, 2, rp.version, rp.code, rp.name, 'TZS',
       '30000000-0000-4000-8000-000000000001', now(), '{}'::jsonb, '[]'::jsonb,
       '[]'::jsonb, '{}'::jsonb,
       jsonb_build_array(jsonb_build_object('room_type_id', '50000000-0000-4000-8000-000000000099')),
       md5('cps04-room-assignment-mismatch')
FROM public.staynas_rate_plans rp
WHERE rp.id = '60000000-0000-4000-8000-000000000004';

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
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'staynas_booking_product_configurations'
      AND indexname = 'staynas_booking_product_unique'
      AND indexdef ILIKE '%COALESCE(campaign_slug%'
  ) THEN
    RAISE EXCEPTION 'Booking product uniqueness index is missing or does not normalize NULL campaign slugs';
  END IF;
END
$test$;

-- Valid permanent and campaign configurations use the latest property-currency publication.
INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel, publication_status)
VALUES
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.staynas_rate_plan_publications
    WHERE rate_plan_id = '60000000-0000-4000-8000-000000000001' AND publication_number = 2),
   'permanent', 'draft');

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel, publication_status)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       (SELECT id FROM public.staynas_rate_plan_publications
        WHERE rate_plan_id = '60000000-0000-4000-8000-000000000001' AND publication_number = 2),
       'permanent', 'draft');
    RAISE EXCEPTION 'Duplicate permanent booking product unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$test$;

INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel, campaign_slug, offer_code, offer_name)
VALUES
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   (SELECT id FROM public.staynas_rate_plan_publications
    WHERE rate_plan_id = '60000000-0000-4000-8000-000000000001' AND publication_number = 2),
   'campaign', 'summer-escape', 'SUMMER', 'Summer Escape');

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
       (SELECT id FROM public.staynas_rate_plan_publications
        WHERE rate_plan_id = '60000000-0000-4000-8000-000000000001' AND publication_number = 2),
       'permanent');
    RAISE EXCEPTION 'Cross-property room fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Cross-property room fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       (SELECT id FROM public.staynas_rate_plan_publications
        WHERE rate_plan_id = '60000000-0000-4000-8000-000000000001' AND publication_number = 1),
       'permanent');
    RAISE EXCEPTION 'Obsolete rate-plan publication fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Obsolete rate-plan publication fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       (SELECT id FROM public.staynas_rate_plan_publications
        WHERE rate_plan_id = '60000000-0000-4000-8000-000000000003' AND publication_number = 2),
       'permanent');
    RAISE EXCEPTION 'Currency mismatch fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Currency mismatch fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.staynas_booking_product_configurations
      (property_id, room_id, rate_plan_publication_id, channel)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       (SELECT id FROM public.staynas_rate_plan_publications
        WHERE rate_plan_id = '60000000-0000-4000-8000-000000000004' AND publication_number = 2),
       'permanent');
    RAISE EXCEPTION 'Room-type assignment fixture unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Room-type assignment fixture unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;

-- Tenant B's valid product is isolated from Tenant A by the real membership RLS policy.
INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel)
VALUES
  ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
   (SELECT id FROM public.staynas_rate_plan_publications
    WHERE rate_plan_id = '60000000-0000-4000-8000-000000000002' AND publication_number = 1),
   'permanent');

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

-- Published edits become hidden draft version 2 rather than silently changing a live page.
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

SELECT pass('CPS-04 database invariants, lifecycle and tenant-isolation assertions passed');
SELECT * FROM finish();
ROLLBACK;
