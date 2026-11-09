-- Runs against an isolated PostgreSQL instance in GitHub Actions.
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('77777777-7777-4777-8777-777777777771'),
  ('77777777-7777-4777-8777-777777777772')
ON CONFLICT (id) DO NOTHING;
DO $
DECLARE v_founder_organisation_id uuid;
BEGIN
  INSERT INTO public.staynas_organisations(slug,name,status)
  VALUES ('nolmark-cdma','Nolmark CDMA test founder','active')
  ON CONFLICT (slug) DO UPDATE SET status='active'
  RETURNING id INTO v_founder_organisation_id;
  INSERT INTO public.staynas_properties(id,organisation_id,slug,code,name,status)
  VALUES ('77777777-7777-4777-8777-777777777773',v_founder_organisation_id,'cc06-demo-founder','CC06DEMO','CC06 Demo Founder Property','active')
  ON CONFLICT (id) DO UPDATE SET organisation_id=EXCLUDED.organisation_id,status='active';
  INSERT INTO public.staynas_property_members(property_id,user_id,role,status)
  VALUES ('77777777-7777-4777-8777-777777777773','77777777-7777-4777-8777-777777777771','owner','active')
  ON CONFLICT (property_id,user_id,role) DO UPDATE SET status='active';
END $;
DO $
DECLARE
  v_first record;
  v_duplicate record;
  v_inserted record;
  v_limited record;
  v_count integer;
  i integer;
BEGIN
  IF has_table_privilege('anon', 'public.staynas_website_demo_requests', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read demo requests';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.staynas_website_demo_requests', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated requires SELECT so RLS can enforce founder-only visibility';
  END IF;
  IF has_table_privilege('authenticated', 'public.staynas_website_demo_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.staynas_website_demo_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not write demo requests directly';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.staynas_website_demo_requests', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.staynas_website_demo_requests', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.staynas_website_demo_requests', 'UPDATE')
     OR has_table_privilege('service_role', 'public.staynas_website_demo_requests', 'DELETE') THEN
    RAISE EXCEPTION 'service_role table grants are not least-privilege';
  END IF;
  IF has_function_privilege('anon', 'public.submit_staynas_website_demo_request(jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.submit_staynas_website_demo_request(jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.submit_staynas_website_demo_request(jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'demo submission RPC execute grants are incorrect';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staynas_website_demo_requests'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on demo requests';
  END IF;
END $$;

SET ROLE service_role;
DO $$
DECLARE
  v_first record;
  v_duplicate record;
  v_inserted record;
  v_limited record;
  v_count integer;
  i integer;
BEGIN
  SELECT * INTO v_first
  FROM public.submit_staynas_website_demo_request(
    jsonb_build_object(
      'name', 'First Guest',
      'email', 'first@example.com',
      'property_type', 'Hotel',
      'property_count_band', '1',
      'interests', jsonb_build_array('Reservations & booking'),
      'source', 'staynas.com'
    ),
    'ip-hash-test'
  );
  IF v_first.request_id IS NULL OR v_first.duplicate OR v_first.rate_limited THEN
    RAISE EXCEPTION 'first submission should be persisted';
  END IF;

  SELECT * INTO v_duplicate
  FROM public.submit_staynas_website_demo_request(
    jsonb_build_object(
      'name', 'First Guest',
      'email', 'first@example.com',
      'property_type', 'Hotel',
      'property_count_band', '1',
      'interests', jsonb_build_array('Reservations & booking')
    ),
    'ip-hash-test'
  );
  IF v_duplicate.request_id <> v_first.request_id OR NOT v_duplicate.duplicate OR v_duplicate.rate_limited THEN
    RAISE EXCEPTION 'duplicate email should return the existing request';
  END IF;

  FOR i IN 2..5 LOOP
    SELECT * INTO v_inserted
    FROM public.submit_staynas_website_demo_request(
      jsonb_build_object(
        'name', 'Guest ' || i,
        'email', 'guest' || i || '@example.com',
        'property_type', 'Lodge',
        'property_count_band', '1',
        'interests', jsonb_build_array('Reservations & booking')
      ),
      'ip-hash-test'
    );
    IF v_inserted.request_id IS NULL OR v_inserted.duplicate OR v_inserted.rate_limited THEN
      RAISE EXCEPTION 'submission % should be accepted within the hourly limit', i;
    END IF;
  END LOOP;

  SELECT * INTO v_limited
  FROM public.submit_staynas_website_demo_request(
    jsonb_build_object(
      'name', 'Sixth Guest',
      'email', 'sixth@example.com',
      'property_type', 'Hotel',
      'property_count_band', '1',
      'interests', jsonb_build_array()
    ),
    'ip-hash-test'
  );
  IF NOT v_limited.rate_limited OR v_limited.duplicate THEN
    RAISE EXCEPTION 'sixth request from one IP hash should be rate limited';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.staynas_website_demo_requests
  WHERE ip_hash = 'ip-hash-test';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'expected five persisted requests, found %', v_count;
  END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777772', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.staynas_website_demo_requests;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'non-founder authenticated users must not see demo requests';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777771', false);
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.staynas_website_demo_requests;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'founder should see all five requests, found %', v_count;
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
