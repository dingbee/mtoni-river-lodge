-- DC-06.04 — property-scoped, read-only distribution analytics projection.
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE='42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _from >= _to OR _to - _from > interval '366 days' THEN
    RAISE EXCEPTION 'Invalid analytics reporting window.' USING ERRCODE='22023';
  END IF;

  v_property_id := public.staynas_active_property_id(v_uid);
  IF v_property_id IS NULL
     OR NOT public.staynas_user_has_property_access(v_uid,v_property_id)
     OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','admin','finance']::public.app_role[])
  THEN
    RAISE EXCEPTION 'Distribution analytics access denied for active property.' USING ERRCODE='42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'propertyId', v_property_id,
    'window', pg_catalog.jsonb_build_object('from',_from,'to',_to),
    'operations', (
      SELECT pg_catalog.jsonb_build_object(
        'total', count(*),
        'queued', count(*) FILTER (WHERE l.status='queued'),
        'running', count(*) FILTER (WHERE l.status='running'),
        'retryableFailure', count(*) FILTER (WHERE l.status='retryable_failure'),
        'succeeded', count(*) FILTER (WHERE l.status='succeeded'),
        'permanentFailure', count(*) FILTER (WHERE l.status='permanent_failure'),
        'cancelled', count(*) FILTER (WHERE l.status='cancelled'),
        'successRate', CASE WHEN count(*)=0 THEN 0
          ELSE round((count(*) FILTER (WHERE l.status='succeeded'))::numeric / count(*),4) END,
        'averageAttempts', coalesce(round(avg(l.attempt_count)::numeric,2),0)
      )
      FROM public.staynas_distribution_operation_ledger l
      WHERE l.property_id=v_property_id AND l.created_at >= _from AND l.created_at < _to
    ),
    'attempts', (
      SELECT pg_catalog.jsonb_build_object(
        'total',count(*),
        'succeeded',count(*) FILTER (WHERE a.status='succeeded'),
        'retryableFailure',count(*) FILTER (WHERE a.status='retryable_failure'),
        'permanentFailure',count(*) FILTER (WHERE a.status='permanent_failure'),
        'leaseExpired',count(*) FILTER (WHERE a.status='lease_expired')
      )
      FROM public.staynas_distribution_operation_attempts a
      WHERE a.property_id=v_property_id AND a.finished_at >= _from AND a.finished_at < _to
    ),
    'outbox', (
      SELECT pg_catalog.jsonb_build_object(
        'total',count(*),
        'pending',count(*) FILTER (WHERE o.status='pending'),
        'publishing',count(*) FILTER (WHERE o.status='publishing'),
        'published',count(*) FILTER (WHERE o.status='published'),
        'retryableFailure',count(*) FILTER (WHERE o.status='retryable_failure'),
        'permanentFailure',count(*) FILTER (WHERE o.status='permanent_failure')
      )
      FROM public.staynas_distribution_outbox o
      WHERE o.property_id=v_property_id AND o.created_at >= _from AND o.created_at < _to
    ),
    'webhooks', (
      SELECT pg_catalog.jsonb_build_object(
        'total',count(*),
        'received',count(*) FILTER (WHERE i.processing_status='received'),
        'processing',count(*) FILTER (WHERE i.processing_status='processing'),
        'processed',count(*) FILTER (WHERE i.processing_status='processed'),
        'retryableFailure',count(*) FILTER (WHERE i.processing_status='retryable_failure'),
        'permanentFailure',count(*) FILTER (WHERE i.processing_status='permanent_failure'),
        'ignored',count(*) FILTER (WHERE i.processing_status='ignored')
      )
      FROM public.staynas_distribution_webhook_inbox i
      WHERE i.property_id=v_property_id AND i.received_at >= _from AND i.received_at < _to
    ),
    'reservations', (
      SELECT pg_catalog.jsonb_build_object('imported',count(*))
      FROM public.staynas_distribution_reservation_links r
      WHERE r.property_id=v_property_id AND r.created_at >= _from AND r.created_at < _to
    ),
    'financialEvidence', (
      SELECT pg_catalog.jsonb_build_object(
        'total',count(*),
        'unmatched',count(*) FILTER (WHERE f.reconciliation_status='unmatched'),
        'evidenceReceived',count(*) FILTER (WHERE f.reconciliation_status='evidence_received'),
        'reviewRequired',count(*) FILTER (WHERE f.reconciliation_status='review_required'),
        'duplicateReference',count(*) FILTER (WHERE f.reconciliation_status='duplicate_reference')
      )
      FROM public.staynas_distribution_financial_evidence f
      WHERE f.property_id=v_property_id AND f.received_at >= _from AND f.received_at < _to
    ),
    'health', (
      SELECT pg_catalog.jsonb_build_object(
        'checks',count(*),
        'healthy',count(*) FILTER (WHERE h.health_state='healthy'),
        'degraded',count(*) FILTER (WHERE h.health_state='degraded'),
        'unavailable',count(*) FILTER (WHERE h.health_state='unavailable'),
        'unknown',count(*) FILTER (WHERE h.health_state='unknown')
      )
      FROM public.staynas_distribution_health_checks h
      WHERE h.property_id=v_property_id AND h.checked_at >= _from AND h.checked_at < _to
    ),
    'semantics', pg_catalog.jsonb_build_object(
      'source','authoritative_distribution_ledgers',
      'readOnly',true,
      'currencyAggregation',false,
      'financialEvidenceIsPayment',false
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_get_distribution_analytics(timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_get_distribution_analytics(timestamptz,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.staynas_get_distribution_analytics(timestamptz,timestamptz)
  IS 'Read-only distribution analytics for the caller active property. Aggregates durable ledgers only; never writes or posts financial evidence.';

COMMIT;
