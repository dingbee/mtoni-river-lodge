-- CC-06 founder-only commercial alerts. The event identity and evidence are immutable;
-- lifecycle acknowledgement is mutable and remains auditable by the server service.
CREATE TABLE IF NOT EXISTS public.commercial_founder_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE CHECK (length(btrim(dedupe_key)) BETWEEN 8 AND 300),
  organisation_id uuid REFERENCES public.staynas_organisations(id) ON DELETE RESTRICT,
  alert_type text NOT NULL CHECK (alert_type IN (
    'trial_expiring','renewal_approaching','invoice_overdue','payment_failed',
    'reconciliation_exception','entitlement_exception'
  )),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  detail text NOT NULL CHECK (length(btrim(detail)) BETWEEN 3 AND 2000),
  resource_type text NOT NULL,
  resource_ref text NOT NULL,
  href text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CHECK ((status <> 'acknowledged') OR (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)),
  CHECK ((status <> 'resolved') OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS commercial_founder_notifications_open_idx
  ON public.commercial_founder_notifications(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_founder_notifications_tenant_idx
  ON public.commercial_founder_notifications(organisation_id, created_at DESC);

ALTER TABLE public.commercial_founder_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_founder_notifications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_founder_notifications FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_founder_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.guard_commercial_founder_notification_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Founder commercial notification history cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
    OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
    OR NEW.alert_type IS DISTINCT FROM OLD.alert_type
    OR NEW.severity IS DISTINCT FROM OLD.severity
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.detail IS DISTINCT FROM OLD.detail
    OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
    OR NEW.resource_ref IS DISTINCT FROM OLD.resource_ref
    OR NEW.href IS DISTINCT FROM OLD.href
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Founder commercial notification evidence is immutable' USING ERRCODE='55000';
  END IF;
  IF OLD.status='resolved' AND NEW.status <> 'resolved' THEN
    RAISE EXCEPTION 'Resolved founder commercial notifications cannot be reopened' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_commercial_founder_notification_mutation() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS commercial_founder_notification_guard ON public.commercial_founder_notifications;
CREATE TRIGGER commercial_founder_notification_guard
  BEFORE UPDATE OR DELETE ON public.commercial_founder_notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_founder_notification_mutation();

COMMENT ON TABLE public.commercial_founder_notifications IS
  'Founder-only deduplicated commercial alerts. Alert evidence is immutable; acknowledgement/resolution state is controlled by authorized server functions.';
