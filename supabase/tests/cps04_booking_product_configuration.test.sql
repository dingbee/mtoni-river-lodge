-- CPS-04 executable database contracts: scope, currency, rate assignment, RLS and publication versioning.
BEGIN;

INSERT INTO public.staynas_organisations (id, slug, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'org-a', 'Organisation A'),
  ('10000000-0000-4000-8000-000000000002', 'org-b', 'Organisation B');

INSERT INTO public.staynas_properties (id, organisation_id, currency, timezone, status) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'TZS', 'Africa/Dar_es_Salaam', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'KES', 'Africa/Nairobi', 'active');

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
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'published', true);

INSERT INTO public.staynas_rate_plan_publications
  (id, property_id, rate_plan_id, publication_number, currency, room_type_assignments) VALUES
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 1, 'TZS', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 2, 'TZS', '[{"room_type_id":"50000000-0000-4000-8000-000000000001"}]'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 1, 'KES', '[{"room_type_id":"50000000-0000-4000-8000-000000000002"}]');

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

-- Service-role fixtures exercise the actual trigger validation, not just schema shape.
INSERT INTO public.staynas_booking_product_configurations
  (property_id, room_id, rate_plan_publication_id, channel, publication_status)
VALUES
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '70000000-0000-4000-8000-000000000002', 'permanent', 'draft');

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
      (property_id, room_id, rate_plan_publication_id, channel, campaign_slug, offer_code, offer_name)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
       '70000000-0000-4000-8000-000000000002', 'campaign', 'bad-offer', 'BAD', 'Bad offer');
    RAISE EXCEPTION 'Valid campaign fixture setup failed unexpectedly';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$test$;

-- Content edits to a published configuration must unpublish and increment its version.
UPDATE public.staynas_booking_product_configurations
SET publication_status = 'published', public_visible = true;
UPDATE public.staynas_booking_product_configurations
SET display_order = display_order + 1;

DO $test$
DECLARE
  v_status text;
  v_visible boolean;
  v_version integer;
BEGIN
  SELECT publication_status, public_visible, configuration_version
    INTO v_status, v_visible, v_version
  FROM public.staynas_booking_product_configurations
  WHERE channel = 'permanent';

  IF v_status <> 'draft' OR v_visible OR v_version <> 2 THEN
    RAISE EXCEPTION 'Published configuration edit did not create a hidden draft version';
  END IF;
END
$test$;

ROLLBACK;
