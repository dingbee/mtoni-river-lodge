-- Founder-controlled tenant domain verification workflow.
-- DNS verification gates hostname activation, not platform development.
ALTER TABLE public.staynas_property_domains
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'dns_txt',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verification_error text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.staynas_property_domains
  DROP CONSTRAINT IF EXISTS staynas_property_domains_verification_status_check;
ALTER TABLE public.staynas_property_domains
  ADD CONSTRAINT staynas_property_domains_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'failed', 'revoked'));

-- Existing verified_at is the activation authority. Backfill status only from existing verified evidence.
UPDATE public.staynas_property_domains
SET verification_status = CASE WHEN verified_at IS NOT NULL THEN 'verified' ELSE 'pending' END
WHERE verification_status IS DISTINCT FROM CASE WHEN verified_at IS NOT NULL THEN 'verified' ELSE 'pending' END;

CREATE TABLE IF NOT EXISTS public.staynas_domain_verification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.staynas_property_domains(id) ON DELETE SET NULL,
  hostname text NOT NULL,
  action text NOT NULL CHECK (action IN ('registered', 'verification_started', 'verification_succeeded', 'verification_failed', 'revoked', 'primary_changed')),
  actor_user_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staynas_domain_verification_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_domain_verification_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON public.staynas_domain_verification_audit TO service_role;

CREATE INDEX IF NOT EXISTS staynas_property_domains_hostname_idx
  ON public.staynas_property_domains (lower(hostname));
CREATE UNIQUE INDEX IF NOT EXISTS staynas_property_domains_hostname_unique
  ON public.staynas_property_domains (lower(hostname));

COMMENT ON COLUMN public.staynas_property_domains.verification_token IS
  'Random challenge token generated server-side; never treated as proof until DNS TXT challenge is checked.';
COMMENT ON COLUMN public.staynas_property_domains.verified_at IS
  'Set only by the server-side verification workflow after a successful DNS ownership challenge.';
