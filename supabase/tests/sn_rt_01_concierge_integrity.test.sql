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
CREATE TABLE public.staynas_property_domains(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  hostname text NOT NULL,
  verification_status text NOT NULL,
  verified_at timestamptz
);
CREATE TABLE public.rooms(property_id uuid NOT NULL REFERENCES public.staynas_properties(id), slug text);
CREATE TABLE public.extras(property_id uuid NOT NULL REFERENCES public.staynas_properties(id), slug text);
CREATE TABLE public.ai_concierge_intents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid);
CREATE TABLE public.ai_concierge_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid);
CREATE TABLE public.ai_personalization_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid, session_id uuid);

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
CREATE TABLE public.ai_concierge_messages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_concierge_sessions(id),
  role text NOT NULL,
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  escalated boolean NOT NULL DEFAULT false,
  model text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_concierge_channels(
  channel text PRIMARY KEY,
  provider text,
  display_name text NOT NULL,
  status text NOT NULL,
  inbound_enabled boolean NOT NULL DEFAULT false,
  outbound_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.ai_concierge_channels(channel,display_name,status,inbound_enabled,outbound_enabled)
VALUES ('web','Website Concierge','active',true,true);
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
  completed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
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
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_concierge_sessions, public.ai_concierge_messages, public.ai_concierge_leads, public.ai_escalations TO anon;
GRANT ALL ON TABLE public.ai_concierge_sessions, public.ai_concierge_messages, public.ai_concierge_leads, public.ai_escalations TO authenticated;
GRANT SELECT ON TABLE public.rooms TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.rooms, public.extras, public.ai_concierge_channels, public.ops_tasks, public.notifications TO anon;
GRANT ALL ON TABLE public.rooms, public.extras, public.ai_concierge_channels, public.ops_tasks, public.notifications TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_concierge_sessions, public.ai_concierge_messages, public.ai_concierge_leads, public.ai_escalations, public.rooms, public.extras, public.ai_concierge_channels, public.ops_tasks, public.notifications TO service_role;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

INSERT INTO public.staynas_properties(id,status) VALUES
('11111111-1111-4111-8111-111111111111','active'),
('22222222-2222-4222-8222-222222222222','active');
INSERT INTO auth.users(id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO auth.users(id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.staynas_property_members(property_id,user_id,role,status) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','active'),
('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner','active');
INSERT INTO public.ai_concierge_sessions(id,property_id) VALUES
('11111111-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222223','22222222-2222-4222-8222-222222222222');

\i supabase/review/20261109150000_sn_rt_01_concierge_runtime_integrity.sql

DO $test$
BEGIN
  IF has_function_privilege('anon',
    'public.staynas_create_concierge_escalation(uuid,uuid,uuid,text,text,text,numeric,smallint,text)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the privileged escalation function';
  END IF;
  IF has_function_privilege('anon',
    'public.staynas_consume_public_rate_limit(text,integer,integer)',
    'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the privileged rate limit function';
  END IF;
  IF has_table_privilege('anon','public.ai_concierge_sessions','TRUNCATE')
     OR has_table_privilege('anon','public.ai_concierge_messages','TRUNCATE')
     OR has_table_privilege('anon','public.ai_concierge_leads','TRUNCATE')
     OR has_table_privilege('anon','public.ai_escalations','TRUNCATE')
     OR has_table_privilege('anon','public.ai_concierge_sessions','SELECT')
     OR has_table_privilege('anon','public.ai_concierge_messages','SELECT')
     OR has_table_privilege('anon','public.ai_concierge_leads','SELECT')
     OR has_table_privilege('anon','public.ai_escalations','SELECT') THEN
    RAISE EXCEPTION 'anon must not retain privileged access to Concierge records';
  END IF;
  IF has_table_privilege('authenticated','public.ai_escalations','INSERT')
     OR has_table_privilege('authenticated','public.ai_escalations','UPDATE')
     OR has_table_privilege('authenticated','public.ai_escalations','DELETE')
     OR has_table_privilege('authenticated','public.ai_escalations','TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated staff must use the scoped escalation RPC';
  END IF;
  IF NOT has_table_privilege('authenticated','public.ai_concierge_leads','SELECT')
     OR NOT has_table_privilege('authenticated','public.ai_concierge_leads','UPDATE') THEN
    RAISE EXCEPTION 'authorized staff lead read/update access must be preserved';
  END IF;
  IF NOT has_table_privilege('service_role','public.ai_concierge_sessions','SELECT')
     OR NOT has_table_privilege('service_role','public.ai_concierge_sessions','INSERT')
     OR NOT has_table_privilege('service_role','public.ai_concierge_sessions','UPDATE')
     OR NOT has_table_privilege('service_role','public.ai_concierge_messages','SELECT')
     OR NOT has_table_privilege('service_role','public.ai_concierge_messages','INSERT')
     OR NOT has_table_privilege('service_role','public.ai_concierge_leads','INSERT')
     OR NOT has_table_privilege('service_role','public.ai_concierge_leads','UPDATE')
     OR NOT has_table_privilege('service_role','public.extras','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_property_domains','SELECT') THEN
    RAISE EXCEPTION 'server-only Concierge runtime privileges are incomplete';
  END IF;
  IF has_table_privilege('service_role','public.ai_escalations','INSERT') THEN
    RAISE EXCEPTION 'service role must create escalations through the scoped RPC';
  END IF;
  IF has_table_privilege('authenticated','public.ai_concierge_leads','INSERT')
     OR has_table_privilege('authenticated','public.ai_concierge_leads','DELETE')
     OR has_table_privilege('authenticated','public.ai_concierge_sessions','INSERT')
     OR has_table_privilege('authenticated','public.ai_concierge_messages','INSERT') THEN
    RAISE EXCEPTION 'staff must not write raw Concierge records outside validated workflows';
  END IF;
  IF has_table_privilege('anon','public.rooms','TRUNCATE')
     OR has_table_privilege('anon','public.extras','TRUNCATE')
     OR has_table_privilege('anon','public.ai_concierge_channels','TRUNCATE')
     OR has_table_privilege('anon','public.ops_tasks','TRUNCATE')
     OR has_table_privilege('anon','public.notifications','TRUNCATE')
     OR has_table_privilege('authenticated','public.ops_tasks','TRUNCATE')
     OR has_table_privilege('authenticated','public.notifications','TRUNCATE')
     OR has_table_privilege('service_role','public.ai_concierge_sessions','TRUNCATE')
     OR has_table_privilege('service_role','public.ai_concierge_messages','TRUNCATE')
     OR has_table_privilege('service_role','public.ai_concierge_leads','TRUNCATE')
     OR has_table_privilege('service_role','public.ai_escalations','TRUNCATE')
     OR has_table_privilege('service_role','public.ops_tasks','TRUNCATE')
     OR has_table_privilege('service_role','public.notifications','TRUNCATE') THEN
    RAISE EXCEPTION 'anonymous, staff and server roles must not retain destructive table privileges';
  END IF;
  IF NOT has_table_privilege('anon','public.rooms','SELECT') THEN
    RAISE EXCEPTION 'public room catalogue read access must be preserved';
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
    NULL, 'web', 'human_requested', 'Guest asked for a staff member.', 0.9, 2,
    repeat('a',64)
  );
  IF NOT result.created OR result.escalation_id IS NULL OR result.task_id IS NULL THEN
    RAISE EXCEPTION 'first escalation request must create a record and task';
  END IF;

  SELECT * INTO result FROM public.staynas_create_concierge_escalation(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111112',
    NULL, 'web', 'human_requested', 'Guest asked for a staff member.', 0.9, 2,
    repeat('a',64)
  );
  IF result.created OR result.escalation_id IS NULL THEN
    RAISE EXCEPTION 'duplicate escalation must return the original record';
  END IF;

  SELECT * INTO result FROM public.staynas_create_concierge_escalation(
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222223',
    NULL, 'web', 'human_requested', 'Property B guest requested assistance.', 0.9, 2,
    repeat('f',64)
  );
  IF NOT result.created OR result.escalation_id IS NULL THEN
    RAISE EXCEPTION 'property B service escalation must be created for isolation tests';
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
      NULL, 'web', 'other', 'Cross-property attempt.', 0.5, 3,
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
    NULL, 'web', 'complaint', 'Guest reported a complaint.', 0.4, 1,
    repeat('d',64)
  );
  IF NOT result.created THEN RAISE EXCEPTION 'authorized staff escalation should be created'; END IF;

  PERFORM public.staynas_transition_concierge_escalation(
    result.escalation_id,
    '11111111-1111-4111-8111-111111111111',
    'assigned',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    NULL
  );
  PERFORM public.staynas_transition_concierge_escalation(
    result.escalation_id,
    '11111111-1111-4111-8111-111111111111',
    'assigned',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    NULL
  );
  PERFORM public.staynas_transition_concierge_escalation(
    result.escalation_id,
    '11111111-1111-4111-8111-111111111111',
    'in_progress',
    NULL,
    NULL
  );
  PERFORM public.staynas_transition_concierge_escalation(
    result.escalation_id,
    '11111111-1111-4111-8111-111111111111',
    'resolved',
    NULL,
    'Guest issue resolved.'
  );

  IF (SELECT count(*) FROM public.ai_escalations) <> 2
     OR EXISTS (SELECT 1 FROM public.ai_escalations WHERE property_id <> '11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'property A staff must only read property A escalations';
  END IF;

  BEGIN
    PERFORM * FROM public.staynas_create_concierge_escalation(
      '22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222223',
      NULL, 'other', 'human_requested', 'Unauthorized property attempt.', 0.5, 3,
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

-- A second authenticated property must see only its own escalation records.
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE authenticated;
DO $property_b_staff_tests$
BEGIN
  IF (SELECT count(*) FROM public.ai_escalations) <> 1
     OR EXISTS (SELECT 1 FROM public.ai_escalations WHERE property_id <> '22222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'property B staff must only read property B escalations';
  END IF;
END
$property_b_staff_tests$;
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
  EXCEPTION WHEN not_null_violation OR check_violation THEN
    NULL;
  END;

  INSERT INTO public.ai_concierge_leads(property_id,session_id,name,idempotency_key,consent_at,consent_version)
  VALUES ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111112','Valid guest',repeat('1',64),now(),'concierge-lead-v1');

  BEGIN
    INSERT INTO public.ai_concierge_leads(property_id,session_id,name,idempotency_key,consent_at,consent_version)
    VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','Cross-property',repeat('2',64),now(),'concierge-lead-v1');
    RAISE EXCEPTION 'cross-property lead session reference was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

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
  IF (SELECT count(*) FROM public.ai_escalations) <> 3 THEN
    RAISE EXCEPTION 'expected three unique escalation records across two properties';
  END IF;
  IF (SELECT count(*) FROM public.ops_tasks) <> 3 THEN
    RAISE EXCEPTION 'each new escalation must create exactly one operations task';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE kind='concierge_escalation') <> 3 THEN
    RAISE EXCEPTION 'staff notification must be property-assigned and deduplicated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_escalations WHERE ops_task_id IS NOT NULL AND property_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'escalation must retain its operations task link';
  END IF;
  IF (SELECT count(*) FROM public.ai_escalation_guest_notifications WHERE delivery_status='sent') <> 3 THEN
    RAISE EXCEPTION 'guest must receive assigned, in-progress and resolved updates through web channel';
  END IF;
  IF (SELECT count(*) FROM public.ai_concierge_messages WHERE model='staynas-concierge-handoff') <> 3 THEN
    RAISE EXCEPTION 'guest web notifications must be durable conversation messages';
  END IF;
END
$handoff_tests$;

SELECT 'SN-RT-01 database contracts passed' AS result;
