-- Disposable PostgreSQL fixture for DC-04 migration contract tests only.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY,
  decrypted_secret text NOT NULL
);
CREATE VIEW vault.decrypted_secrets AS
  SELECT id, decrypted_secret FROM vault.secrets;
REVOKE ALL ON SCHEMA vault FROM PUBLIC, anon, authenticated;
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA vault TO service_role;
GRANT SELECT ON vault.decrypted_secrets TO service_role;

CREATE TABLE public.staynas_organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
);
CREATE TABLE public.staynas_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  slug text NOT NULL,
  UNIQUE (organisation_id, slug)
);
