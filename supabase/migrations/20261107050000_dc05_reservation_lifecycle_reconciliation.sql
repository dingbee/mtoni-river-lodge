-- DC-05.04 — provider reservation modification and cancellation.
-- Controlled feature/UAT artifact. Never apply to production without separate approval.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_reservation_links') IS NULL
     OR to_regclass('public.staynas_distribution_webhook_inbox') IS NULL
     OR to_regclass('public.staynas_distribution_reservation_payloads') IS NULL
     OR to_regclass('public.staynas_distribution_account_grants') IS NULL
     OR to_regprocedure('public.staynas_transition_booking(uuid,text,text)') IS NULL
     OR to_regprocedure('public.staynas_user_has_property_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'DC-05.04 requires DC-05.03 provider links, encrypted payloads and canonical booking lifecycle controls';
  END IF;
END
$dependencies$;

ALTER TABLE public.staynas_distribution_reservation_links
  ADD COLUMN IF NOT EXISTS last_provider_event_id text,
  ADD COLUMN IF NOT EXISTS last_lifecycle_event_type text,
  ADD COLUMN IF NOT EXISTS last_lifecycle_applied_at timestamptz;

-- One shared lifecycle implementation serves staff and the trusted distribution
-- worker. The transition graph and operational side effects are not duplicated.
CREATE OR REPLACE FUNCTION public.staynas_transition_booking_core(
  _booking_id uuid,
  _target_status text,
  _notes text,
  _actor uuid,
  _authority text,
  _property_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_room_state public.room_states%rowtype;
  v_room_count integer := 0;
  v_previous_status text;
BEGIN
  IF _authority NOT IN ('staff','distribution') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Unsupported booking lifecycle authority';
  END IF;
  IF _booking_id IS NULL OR _target_status IS NULL OR _target_status NOT IN ('confirmed','checked_in','completed','cancelled','no_show') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid booking lifecycle request';
  END IF;
  IF _notes IS NOT NULL AND length(_notes)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Lifecycle notes must not exceed 1000 characters';
  END IF;

  SELECT b.* INTO v_booking
  FROM public.bookings b
  WHERE b.id=_booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR (_authority='staff' AND (_actor IS NULL OR NOT public.staynas_user_has_property_access(_actor,v_booking.property_id)))
     OR (_authority='distribution' AND (_actor IS NOT NULL OR _property_id IS NULL OR v_booking.property_id IS DISTINCT FROM _property_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Booking not found or lifecycle authority denied';
  END IF;

  v_previous_status:=v_booking.status::text;
  IF v_previous_status=_target_status THEN
    RETURN jsonb_build_object('ok',true,'duplicate',true,'booking_id',v_booking.id,'status',v_previous_status);
  END IF;

  IF NOT (
    (v_previous_status='pending' AND _target_status IN ('confirmed','cancelled')) OR
    (v_previous_status='confirmed' AND _target_status IN ('checked_in','cancelled','no_show')) OR
    (v_previous_status='checked_in' AND _target_status='completed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE=format('Invalid booking transition: %s -> %s',v_previous_status,_target_status);
  END IF;

  IF _target_status='no_show' AND
     (now() AT TIME ZONE coalesce((SELECT sp.timezone FROM public.staynas_properties sp WHERE sp.id=v_booking.property_id),'Africa/Dar_es_Salaam'))::date<=v_booking.check_in THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='No-show can be recorded only after the scheduled check-in date';
  END IF;

  IF _authority='staff' AND _target_status='checked_in' THEN
    SELECT count(*) INTO v_room_count FROM public.room_states rs WHERE rs.room_id=v_booking.room_id;
    SELECT rs.* INTO v_room_state
    FROM public.room_states rs
    WHERE rs.room_id=v_booking.room_id
      AND rs.state IN ('vacant_clean','reserved','inspection')
      AND (rs.booking_id=v_booking.id OR rs.booking_id IS NULL)
    ORDER BY (rs.booking_id=v_booking.id) DESC,rs.unit_label
    LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF v_room_count>0 AND v_room_state.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='No eligible physical room unit is available for check-in';
    END IF;
  END IF;

  UPDATE public.bookings
  SET status=_target_status::public.booking_status,
      notes=CASE WHEN nullif(btrim(_notes),'') IS NULL THEN notes
        ELSE concat_ws(E'\\n',notes,'['||_target_status||' '||now()::text||'] '||btrim(_notes)) END
  WHERE id=_booking_id
  RETURNING * INTO v_booking;

  IF _target_status='cancelled' THEN
    -- The canonical allocator decremented one unit per booked night. Restore it
    -- exactly once on the first successful cancellation transition.
    PERFORM public.staynas_lock_room_inventory_dates(
      v_booking.room_id,v_booking.property_id,v_booking.check_in,v_booking.check_out
    );
    UPDATE public.room_inventory ri
    SET available_units=LEAST(r.total_units,ri.available_units+1),
        updated_at=pg_catalog.now()
    FROM public.rooms r
    WHERE r.id=v_booking.room_id
      AND r.property_id=v_booking.property_id
      AND ri.room_id=r.id
      AND ri.date>=v_booking.check_in
      AND ri.date<v_booking.check_out;
  END IF;

  IF _authority='staff' AND _target_status='checked_in' AND v_room_state.id IS NOT NULL THEN
    UPDATE public.room_states SET state='occupied',booking_id=v_booking.id,updated_by=_actor
    WHERE id=v_room_state.id;
  ELSIF _authority='staff' AND _target_status='completed' THEN
    SELECT rs.* INTO v_room_state FROM public.room_states rs
    WHERE rs.booking_id=v_booking.id ORDER BY rs.unit_label LIMIT 1 FOR UPDATE;
    IF v_room_state.id IS NOT NULL THEN
      UPDATE public.room_states SET state='vacant_dirty',booking_id=NULL,updated_by=_actor WHERE id=v_room_state.id;
      INSERT INTO public.ops_tasks(property_id,booking_id,room_state_id,task_type,category,title,priority,status,due_at)
      VALUES(v_booking.property_id,v_booking.id,v_room_state.id,'housekeeping','housekeeping',
        'Clean '||v_room_state.unit_label||' after '||v_booking.guest_name,2,'pending',now()+interval '3 hours');
    END IF;
  ELSIF _target_status IN ('cancelled','no_show') THEN
    UPDATE public.room_states
    SET state=CASE WHEN state='reserved' THEN 'vacant_clean' ELSE state END,
        booking_id=NULL,updated_by=_actor
    WHERE booking_id=v_booking.id AND state='reserved';
  END IF;

  IF _actor IS NOT NULL THEN
    INSERT INTO public.activity_logs(actor_id,action,entity_type,entity_id,entity_label,module,metadata,severity)
    VALUES(_actor,'reservation.status_changed','booking',v_booking.id,v_booking.reference,'reservations',
      jsonb_build_object('from',v_previous_status,'to',_target_status,'notes',nullif(btrim(_notes),''),'property_id',v_booking.property_id),
      'audit');
  END IF;

  RETURN jsonb_build_object('ok',true,'duplicate',false,'booking_id',v_booking.id,'status',_target_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.staynas_transition_booking(
  _booking_id uuid,
  _target_status text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
  END IF;
  RETURN public.staynas_transition_booking_core(_booking_id,_target_status,_notes,v_actor,'staff',NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_claim_distribution_reservation_lifecycle(
  _worker_id text,
  _lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.staynas_distribution_webhook_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE v_row public.staynas_distribution_webhook_inbox%ROWTYPE; v_token uuid;
BEGIN
  IF _worker_id IS NULL OR length(pg_catalog.btrim(_worker_id)) NOT BETWEEN 1 AND 128
     OR _lease_seconds IS NULL OR _lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid reservation lifecycle worker lease.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_attempts(
    inbox_id,attempt_number,worker_id,status,safe_summary,correlation_id,started_at,finished_at
  )
  SELECT i.id,i.attempt_count,coalesce(i.lease_owner,'unknown'),'lease_expired',
    'Reservation lifecycle worker lease expired before completion.',i.correlation_id,
    coalesce(i.lease_started_at,i.received_at),pg_catalog.now()
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.event_type IN ('reservation.modified','reservation.cancelled','reservation.no_show','reservation.reinstated')
    AND i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now() AND i.attempt_count>0
  ON CONFLICT(inbox_id,attempt_number) DO NOTHING;

  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='permanent_failure',processed_at=pg_catalog.now(),
      lease_started_at=NULL,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      safe_error_summary='Reservation lifecycle lease expired after retry budget was exhausted.'
  WHERE i.event_type IN ('reservation.modified','reservation.cancelled','reservation.no_show','reservation.reinstated')
    AND i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now()
    AND i.attempt_count>=i.max_attempts;

  SELECT i.* INTO v_row
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.event_type IN ('reservation.modified','reservation.cancelled','reservation.no_show','reservation.reinstated')
    AND EXISTS(SELECT 1 FROM public.staynas_distribution_reservation_payloads p WHERE p.inbox_id=i.id)
    AND i.attempt_count<i.max_attempts
    AND ((i.processing_status IN ('received','retryable_failure') AND i.next_attempt_at<=pg_catalog.now())
      OR (i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now()))
  ORDER BY i.next_attempt_at,i.received_at,i.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_row.id IS NULL THEN RETURN; END IF;
  v_token:=pg_catalog.gen_random_uuid();
  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='processing',attempt_count=i.attempt_count+1,
      lease_started_at=pg_catalog.now(),lease_token=v_token,lease_owner=_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>_lease_seconds),safe_error_summary=NULL
  WHERE i.id=v_row.id RETURNING i.* INTO v_row;
  RETURN NEXT v_row;
END;
$function$;

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

  v_capability:=CASE WHEN _event_type='reservation.cancelled' THEN 'reservation.cancel' ELSE 'reservation.update' END;
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

  IF nullif(btrim(_guest_name),'') IS NOT NULL OR nullif(btrim(_guest_email),'') IS NOT NULL
     OR nullif(btrim(_guest_phone),'') IS NOT NULL OR nullif(btrim(_country),'') IS NOT NULL THEN
    UPDATE public.bookings
    SET guest_name=coalesce(nullif(btrim(_guest_name),''),guest_name),
        guest_email=coalesce(nullif(btrim(_guest_email),''),guest_email),
        guest_phone=coalesce(nullif(btrim(_guest_phone),''),guest_phone),
        country=coalesce(nullif(btrim(_country),''),country)
    WHERE id=v_booking.id AND property_id=v_booking.property_id;
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

REVOKE ALL ON FUNCTION public.staynas_claim_distribution_reservation_lifecycle(text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_claim_distribution_reservation_lifecycle(text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) TO service_role;

COMMENT ON FUNCTION public.staynas_apply_distribution_reservation_lifecycle(
  uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text
) IS 'Applies provider lifecycle changes only through the shared canonical booking transition core; stay/occupancy changes fail closed for manual reallocation.';

COMMIT;
