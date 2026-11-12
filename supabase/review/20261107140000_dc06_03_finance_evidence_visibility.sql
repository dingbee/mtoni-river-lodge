-- DC-06.03 â€” Finance visibility for provider financial evidence.
-- Read-only RLS access for finance-authorized staff in their active property.
-- Provider evidence remains separate from the canonical payment ledger.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_financial_evidence') IS NULL
     OR to_regclass('public.bookings') IS NULL
     OR to_regprocedure('public.staynas_active_property_id(uuid)') IS NULL
     OR to_regprocedure('public.staynas_user_has_property_access(uuid,uuid)') IS NULL
     OR to_regprocedure('public.has_any_role(uuid,public.app_role[])') IS NULL
 THEN
    RAISE EXCEPTION 'DC-06.03 requires DC-05.06 financial evidence and tenant/property authorization foundations.';
  END IF;
END
$dependencies$;

ALTER TABLE public.staynas_distribution_financial_evidence ENABLE ROW LEVEL SECURITY;

-- Replace the broader DC-05.07 property-staff read policy. Financial evidence
-- is visible only to finance-entitled staff and only for their active property.
DROP POLICY IF EXISTS staynas_distribution_financial_evidence_property_read
  ON public.staynas_distribution_financial_evidence;
DROP POLICY IF EXISTS staynas_dist_finance_active_property_read
  ON public.staynas_distribution_financial_evidence;

CREATE POLICY staynas_dist_finance_active_property_read
  ON public.staynas_distribution_financial_evidence
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['finance','owner','manager','admin']¶»§q«^