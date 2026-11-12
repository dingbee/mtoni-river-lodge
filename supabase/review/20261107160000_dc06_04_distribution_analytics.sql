-- DC-06.04 â€” property-scoped, read-only distribution analytics projection.
-- Review artifact only. CI applies this to disposable PostgreSQL; never production implicitly.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_operation_ledger') IS NULL
     OR to_regclass('public.staynas_distribution_operation_attempts') IS NULL
     OR to_regclass('public.staynas_distribution_outbox') IS NULL
     OR to_regclass('public.staynas_distribution_webhook_inbox') IS NULL
     OR to_regclass('public.staynas_distribution_reservation_links') IS NULL
     OR to_regclass('public.staynas_distribution_financial_evidence') IS NULL
     OR to_regclass('public.staynas_distribution_health_checks') IS NULL
     OR to_regprocedure('public.staynas_active_property_id(uuid)') IS NULL
     OR to_regprocedure('public.staynas_user_has_property_access(uuid,uuid)') IS NULL
     OR to_regprocedure('public.has_any_role(uuid,public.app_role[])') IS NULL
  THEN
    RAISE EXCEPTION 'DC-06.04 requires DC-04/DC-05 distribution ledgers and tenant/property authorization foundations.';
  END IF;
END
$dependencies$;

CREATE OR REPLACE FUNCTION public.staynas_get_distribution_analytics(
  _from timestamptz DEFAULT (pg_catalog.now() - interval '30 days'),
  _to timestamptz DEFAULT pg_catalog.now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_property_id uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL TH¶»§q«^