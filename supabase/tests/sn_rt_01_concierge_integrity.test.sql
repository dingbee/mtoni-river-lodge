\set ON_ERROR_STOP on

-- Isolated PostgreSQL contract test for SN-RT-01 review migration.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;

CREATE TYPE public.app_role AS ENUM ('owner','manager','admin','reservations','reception','marketing');
CREATE TYPE public.ops_task_status AS ENUM ('pending','in_progress','completed','cancelled');

CREATE TABLE public.staynas_properties(
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.staynas_property_members(
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.ai_concierge_sessions(
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  guest_id uuid,
  UNIQUE(id, property_id)
);
CREATE TABLE public.ai_concierge_leads(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  property_id uuid REFERENCES public.staynas_properties(id),
  name text,
  email text,
  phone text,
  country text,
  travel_period_start date,
  travel_period_end date,
  party_adults integer,
  party_children integer,
  interests text[] DEFAULT '{}',
  intent_level text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  notes text,
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_escalations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id),
  guest_id uuid,
  channel text NOT NULL,
  reason text NOT NULL,
  summary text,
  ai_confidence numeric,
  priority smallint NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ops_tasks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid,
  task_type text NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  priority integer NOT NULL DEFAULT 2,
  status public.ops_task_status NOT NULL DEFAULT 'pending',
  category text,
  completed_at timestamptz,
  completed_by uuid
);
CREATE TABLE public.notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel text NOT NULL DEFAULT 'in_app',
  title text NOT NULL,
  body text,
  href text,
  kind text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.staynas_ai_property_in_active_context(p_property_id uuid, p_allowed_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.staynas_property_members member
    WHERE member.user_id=auth.uid()
      AND member.property_id=p_property_id
      AND member.status='active'
      AND member.role=ANY(p_allowed_roles)
  )
$$;

ALTER TABLE public.ai_concierge_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_escalations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.ai_concierge_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_escalations TO authenticated;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public, auth TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO public.staynas_properties(id,status) VALUES
('11111111-1111-4111-8111-111111111111','active'),
('22222222-2222-4222-8222-222222222222','active');
INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.staynas_property_members(property_id,user_id,role,status) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','active');
INSERT INTO public.ai_concierge_sessions(id,property_id) VALUES
('11111111-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222223','22222222-2222-4222-8222-222222222222');

\i supabase/review/20261109150000_sn_rt_01_concierge_runtime_integrity.sql

DO $test$
BEGIN
  IF has_function_privilege('anon',
    'public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,numeric,smallint,text)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the privileged escalation function';
  END IF;
  IF has_function_privilege('anon',
    'public.staynas_consume_public_rate_limit(text,integer,integer)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the privileged rate limit function';
  END IF;
END
$test$;

SET request.jwt.claim.role = 'service_role';
SET ROLE service_role;
DO $service_tests$
DECLARE result record;
BEGIN
  SELECT * INTO result FROM public.staynas_create_concierge_escalation(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111112',
    NULL, 'human_requested', 'Guest asked for a staff member.', 0.9, 2,
    repeat('a',64)
  );
  IF NOT result.created OR result.escalation_id IS NULL OR result.task_id IS NULL THEN
    RAISE EXCEPTION 'first escalation request must create a record and task';
  END IF;

  SELECT * INTO result FROM public.staynas_create_concierge_escalation(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111112',
    NULL, 'human_requested', 'Guest asked for a staff member.', 0.9, 2,
    repeat('a',64)
  );
  IF result.created OR result.escalation_id IS NULL THEN
    RAISE EXCEPTION 'duplicate escalation must return the original record';
  END IF;

  IF public.staynas_consume_public_rate_limit(repeat('b',64),1,60) IS NOT TRUE THEN
    RAISE EXCEPTION 'first request must pass the rate limit';
  END IF;
  IF public.staynas_consume_public_rate_limit(repeat('b',64),1,60) IS NOT FALSE THEN
    RAISE EXCEPTION 'second request must be rate limited';
  END IF;

  BEGIN
    PERFORM * FROM public.staynas_create_concierge_escalation(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222223',
      NULL, 'other', 'Cross-property attempt.', 0.5, 3,
      repeat('c',64)
    );
    RAISE EXCEPTION 'cross-property session reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END
$service_tests$;
RESET ROLE;
RESET request.jwt.claim.role;

-- Staff authorization must be bound to the active property membership.
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $staff_tests$
DECLARE result record;
BEGIN
  SELECT * INTO result FROM public.staynas_create_concierge_escalation(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111112',
    NULL, 'complaint', 'Guest reported a complaint.', 0.4, 1,
    repeat('d',64)
  );
  IF NOT result.created THEN RAISE EXCEPTION 'authorized staff escalation should be created'; END IF;

  IF (SELECT count(*) FROM public.ai_escalations) <> 2 THEN
    RAISE EXCEPTION 'active property staff can only read their own escalations';
  END IF;

  BEGIN
    PERFORM * FROM public.staynas_create_concierge_escalation(
      '22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222223',
      NULL, 'other', 'Unauthorized property attempt.', 0.5, 3,
      repeat('e',64)
    );
    RAISE EXCEPTION 'cross-tenant staff escalation was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$staff_tests$;
RESET ROLE;
RESET request.jwt.claim.role;
RESET request.jwt.claim.sub;

-- Lead ownership, consent evidence and idempotency are database-enforced.
DO $lead_tests$
BEGIN
  BEGIN
    INSERT INTO public.ai_concierge_leads(property_id,session_id,name)
    VALUES (NULL,'11111111-1111-4111-8111-111111111112','Unowned');
    RAISE EXCEPTION 'unowned lead was accepted';
  EXCEPTION WHEN not_null_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.ai_concierge_leads(property_id,session_id,name,idempotency_key)
    VALUES ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111112','No consent',repeat('f',64));
    RAISE EXCEPTION 'lead without consent evidence was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.ai_concierge_leads(property_id,session_id,name,idempotency_key,consent_at,consent_version)
  VALUES ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111112','Valid guest',repeat('1',64),now(),'concierge-lead-v1');

  BEGIN
    INSERT INTO public.ai_concierge_leads(property_id,session_id,name,idempotency_key,consent_at,consent_version)
    VALUES ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111112','Duplicate guest',repeat('1',64),now(),'concierge-lead-v1');
    RAISE EXCEPTION 'duplicate lead idempotency key was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$lead_tests$;

DO $handoff_tests$
BEGIN
  IF (SELECT count(*) FROM public.ai_escalations) <> 2 THEN
    RAISE EXCEPTION 'expected two unique escalation records';
  END IF;
  IF (SELECT count(*) FROM public.ops_tasks) <> 2 THEN
    RAISE EXCEPTION 'each new escalation must create exactly one operations task';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE kind='concierge_escalation') <> 2 THEN
    RAISE EXCEPTION 'staff notification must be property-assigned and deduplicated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_escalations WHERE ops_task_id IS NOT NULL AND property_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'escalation must retain its operations task link';
  END IF;
END
$handoff_tests$;

SELECT 'SN-RT-01 database contracts passed' AS result;
