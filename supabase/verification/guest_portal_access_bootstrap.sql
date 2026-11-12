-- Ephemeral PostgreSQL bootstrap for SN-GPA-01 migration verification.
-- This database is isolated to GitHub Actions and contains synthetic fixtures only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $function$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE
AS $function$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('owner','manager','admin','reception','reservations');
  END IF;
END
$$;

CREATE TABLE public.staynas_organisations (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.staynas_properties (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'UTC'
);

CREATE TABLE public.staynas_property_members (
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  role public.app_role NOT NULL,
  PRIMARY KEY (property_id, user_id)
);

CREATE TABLE public.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE public.guests (
  id uuid PRIMARY KEY,
  full_name text
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  guest_id uuid REFERENCES public.guests(id),
  status text NOT NULL,
  check_out date NOT NULL
);

CREATE TABLE public.ai_concierge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  guest_id uuid REFERENCES public.guests(id),
  guest_name text NOT NULL,
  guest_email text,
  guest_phone text,
  channel text NOT NULL,
  page_context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.staynas_guest_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  guest_id uuid REFERENCES public.guests(id),
  concierge_session_id uuid REFERENCES public.ai_concierge_sessions(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  last_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staynas_guest_portal_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_guest_portal_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_guest_portal_access TO service_role;

CREATE TABLE public.commercial_founder_admin_memberships (
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  principal_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (organisation_id, principal_id)
);

CREATE TABLE public.commercial_founder_tenant_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  founder_organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id)
);

CREATE OR REPLACE FUNCTION public.staynas_user_has_property_access(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.staynas_property_members
    WHERE user_id=_user_id AND property_id=_property_id AND status='active'
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id=_user_id
        AND role IN ('owner','manager','reception','marketing','housekeeping','finance','admin','reservations')
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=ANY(_roles)
    )
  END
$function$;
