CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;

CREATE TABLE public.staynas_organisations (id uuid PRIMARY KEY);
CREATE TABLE public.staynas_properties (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.staynas_property_members (
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (property_id, user_id)
);
CREATE TABLE public.commercial_accounts (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  status text NOT NULL DEFAULT 'active',
  UNIQUE (organisation_id)
);
CREATE TABLE public.commercial_subscriptions (
  id uu¶»§q«^