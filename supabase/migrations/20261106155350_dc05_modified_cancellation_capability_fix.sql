-- DC-05.04 corrective capability gate for status changes carried by modification events.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  _inbox_id uuid,
  _lease_token uuid,
  _worker_id text,
  _payload_fingerprint text,
  _external_reservation_id text,
  _event_type text,
  _provider_event_id text,
  _provider_status text,
  _provider_modified_at timestamptz,
  _arrival_date date,
  _departure_date date,
  _adults integer,
  _children integer,
  _guest_name text DEFAULT NULL,
  _guest_email text DEFAULT NULL,
  _guest_phone text DEFAULT NULL,
  _country text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_link public.staynas_distribution_reservation_links%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_connection public.staynas_distribution_connections%ROWTYPE;
  v_source_event jsonb;
  v_capability text;
  v_target text;
  v_decision jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role' THEN
    RAISE EXCEPTION 'Reservation lifecycle reconciliation is service-only.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_inbox FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id AND i.processing_status='processing'
    AND i.lease_token=_lease_token AND i.lease_owner=_worker_id
    AND i.lease_expires_at>pg_catalog.now()
  FOR UPDATE;
  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'Reservation lifecycle lease is not current.' USING ERRCODE='42501';
  END IF;

  IF _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR NOT EXISTS(SELECT 1 FROM public.staynas_distribution_reservation_payloads p
       WHERE p.inbox_id=v_inbox.id AND p.payload_fingerprint=_payload_fingerprint)
     OR _provider_event_id IS DISTINCT FROM v_inbox.provider_event_id
     OR _event_type IS DISTINCT FROM v_inbox.event_type
     OR _external_reservation_id IS DISTINCT FROM v_inbox.normalized_event->>'externalReservationId'
     OR _arrival_date IS DISTINCT FROM (v_inbox.normalized_event->>'arrivalDate')::date
     OR _departure_date IS DISTINCT FROM (v_inbox.normalized_event->>'departureDate')::date
     OR _adults IS DISTINCT FROM (v_inbox.normalized_event->>'adults')::integer
     OR _children IS DISTINCT FROM coalesce((v_inbox.normalized_event->>'children')::integer,0)
     OR _provider_status IS DISTINCT FROM v_inbox.normalized_event->>'providerStatus'
     OR _provider_modified_at IS DISTINCT FROM nullif(v_inbox.normalized_event->>'providerModifiedAt','')::timestamptz THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','reservation_payload_mismatch');
  END IF;

  IF _event_type IN ('reservation.payment_updated','reservation.refund_notified') THEN
    RETURN jsonb_build_object('outcome','no_lifecycle_change','reason','payment_event');
  END IF;
  IF _event_type='reservation.reinstated' THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','unsupported_reinstatement');
  END IF;
  IF _event_type NOT IN ('reservation.modified','reservation.cancelled','reservation.no_show') THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','unsupported_lifecycle_event');
  END IF;
  IF _provider_modified_at IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','provider_event_order_unavailable');
  END IF;

  v_capability:=CASE
    WHEN _event_type='reservation.cancelled'
      OR (_event_type='reservation.modified' AND lower(btrim(_provider_status)) IN ('cancelled','canceled'))
    THEN 'reservation.cancel'
    ELSE 'reservation.update'
  END;
  SELECT c.* INTO v_connection
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key AND g.environment=c.environment
  WHERE c.id=v_inbox.connection_id AND c.organisation_id=v_inbox.organisation_id
    AND c.property_id=v_inbox.property_id AND c.account_grant_id=v_inbox.account_grant_id
    AND c.external_account_id=v_inbox.external_account_id AND c.provider_key=v_inbox.provider_key
    AND c.environment=v_inbox.environment AND c.lifecycle='connected'
    AND g.grant_status='active' AND v_capability=ANY(g.granted_capabilities);
  IF v_connection.id IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','connection_grant_inactive');
  END IF;

  SELECT * INTO v_link
  FROM public.staynas_distribution_reservation_links l
  WHERE l.provider_key=v_inbox.provider_key AND l.external_account_id=v_inbox.external_account_id
    AND l.external_reservation_id=_external_reservation_id
    AND l.organisation_id=v_inbox.organisation_id AND l.property_id=v_inbox.property_id
    AND l.connection_id=v_inbox.connection_id AND l.account_grant_id=v_inbox.account_grant_id
  FOR UPDATE;
  IF v_link.id IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','canonical_reservation_link_missing');
  END IF;

  SELECT i.normalized_event INTO v_source_event
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=v_link.source_inbox_id;
  IF v_source_event IS NULL
     OR v_inbox.normalized_event->>'externalListingId' IS DISTINCT FROM v_source_event->>'externalListingId'
     OR v_inbox.normalized_event->>'externalRoomId' IS DISTINCT FROM v_source_event->>'externalRoomId'
     OR v_inbox.normalized_event->>'externalRatePlanId' IS DISTINCT FROM v_source_event->>'externalRatePlanId' THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','room_or_rate_plan_change_requires_reallocation');
  END IF;

  IF v_link.provider_modified_at IS NOT NULL AND _provider_modified_at<=v_link.provider_modified_at THEN
    RETURN jsonb_build_object('outcome','no_lifecycle_change','reason','stale_provider_event');
  END IF;

  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id=v_link.booking_id AND b.property_id=v_link.property_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','canonical_booking_missing');
  END IF;

  -- Stay/occupancy/rate-plan changes require the canonical inventory reallocation
  -- and repricing workflow. Until that contract is available, never patch dates
  -- or prices in place; send those events to auditable manual reconciliation.
  IF _arrival_date IS DISTINCT FROM v_booking.check_in
     OR _departure_date IS DISTINCT FROM v_booking.check_out
     OR _adults IS DISTINCT FROM v_booking.adults
     OR _children IS DISTINCT FROM v_booking.children THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','stay_change_requires_reallocation');
  END IF;

  IF _event_type='reservation.cancelled' THEN
    v_target:='cancelled';
  ELSIF _event_type='reservation.no_show' THEN
    v_target:='no_show';
  ELSE
    v_target:=CASE lower(btrim(_provider_status))
      WHEN 'pending' THEN 'pending'
      WHEN 'requested' THEN 'pending'
      WHEN 'confirmed' THEN 'confirmed'
      WHEN 'booked' THEN 'confirmed'
      WHEN 'accepted' THEN 'confirmed'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'canceled' THEN 'cancelled'
      WHEN 'no_show' THEN 'no_show'
      WHEN 'no-show' THEN 'no_show'
      ELSE NULL END;
  END IF;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','unknown_provider_state');
  END IF;

  IF v_booking.status::text<>v_target THEN
    BEGIN
      v_decision:=public.staynas_transition_booking_core(
        v_booking.id,v_target,'Provider lifecycle event '||_provider_event_id,NULL,'distribution',v_booking.property_id
      );
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '42501' THEN
      RETURN jsonb_build_object('outcome','manual_reconciliation','reconciliation_code','invalid_transition');
    END;
  ELSE
    v_decision:=jsonb_build_object('ok',true,'duplicate',true,'status',v_target);
  END IF;

  IF nullif(btrim(_guest_name),'') IS NOT NULL OR nullif(btrim(_guest_email),'') IS NOT NULL
     OR nullif(btrim(_guest_phone),'') IS NOT NULL OR nullif(btrim(_country),'') IS NOT NULL THEN
    UPDATE public.bookings
    SET guest_name=coalesce(nullif(btrim(_guest_name),''),guest_name),
        guest_email=coalesce(nullif(btrim(_guest_email),''),guest_email),
        guest_phone=coalesce(nullif(btrim(_guest_phone),''),guest_phone),
        country=coalesce(nullif(btrim(_country),''),country)
    WHERE id=v_booking.id AND property_id=v_booking.property_id;
  END IF;

  UPDATE public.staynas_distribution_reservation_links
  SET provider_status=_provider_status,
      provider_modified_at=_provider_modified_at,
      last_provider_event_id=_provider_event_id,
      last_lifecycle_event_type=_event_type,
      last_lifecycle_applied_at=pg_catalog.now()
  WHERE id=v_link.id;

  RETURN jsonb_build_object('outcome','applied','booking_id',v_link.booking_id,
    'status',v_target,'duplicate',coalesce((v_decision->>'duplicate')::boolean,false));
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) TO service_role;

COMMIT;
