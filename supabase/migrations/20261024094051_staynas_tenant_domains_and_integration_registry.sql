CREATE TABLE IF NOT EXISTS public.staynas_property_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_property_domains_hostname_normalized CHECK (
    hostname = lower(trim(hostname)) AND hostname !~ '[:/[:space:]]'
  )
);
CREATE INDEX IF NOT EXISTS idx_staynas_property_domains_property
  ON public.staynas_property_domains(property_id);
ALTER TABLE public.staynas_property_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_property_domains FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_property_domains TO service_role;

CREATE TABLE IF NOT EXISTS public.staynas_property_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  provider text NOT NULL,
  purpose text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  credential_reference text,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, provider, purpose)
);
CREATE INDEX IF NOT EXISTS idx_staynas_property_integrations_property
  ON public.staynas_property_integrations(property_id);
ALTER TABLE public.staynas_property_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_property_integrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_property_integrations TO service_role;

CREATE TABLE IF NOT EXISTS public.staynas_property_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_code text,
  calculation_type text NOT NULL CHECK (calculation_type IN ('inclusive_percent','exclusive_percent','fixed_per_night','fixed_per_booking')),
  rate numeric(12,4) NOT NULL CHECK (rate >= 0),
  currency text,
  applies_to text NOT NULL DEFAULT 'accommodation' CHECK (applies_to IN ('accommodation','extras','all')),
  is_compound boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_staynas_property_tax_rules_active
  ON public.staynas_property_tax_rules(property_id, active, valid_from, valid_to);
ALTER TABLE public.staynas_property_tax_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_property_tax_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staynas_property_tax_rules TO service_role;