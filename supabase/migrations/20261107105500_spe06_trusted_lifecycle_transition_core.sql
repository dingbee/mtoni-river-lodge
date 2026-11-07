-- SPE-06: provide the trusted lifecycle transition primitive required by
-- quote-backed staff confirmation and cancellation.
-- This forward-only helper is callable only by service_role; application RPCs
-- invoke it from their SECURITY DEFINER transaction after resolving actor scope.
BEGIN;

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
  v_booking public.bookings%ROWTYPE;
  v_room_state public.room_states%ROWTYPE;
  v_room_count integer := 0;
  v_previous_status text;
BEGIN
  IF _authority NOT IN ('staff','distribution') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Unsupported booking lifecycle authority';
  END IF;
  IF _booking_id IS NULL OR _target_status IS NULL
     OR _target_status NOT IN ('confirmed','checked_in','completed','cancelled','no_show') THEN
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
     OR (_authority='staff' AND (
       _actor IS NULL
       OR NOT public.staynas_user_has_property_access(_actor,v_booking.property_id)
       OR (_property_id IS NOT NULL AND v_booking.property_id IS DISTINCT FROM _property_id)
     ))
     OR (_authority='distribution' AND (
       _actor IS NOT NULL OR _property_id IS NULL
       OR v_booking.property_id IS DISTINCT FROM _property_id
     )) THEN
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
     (now() AT TIME ZONE coalesce(
       (SELECT sp.timezone FROM public.staynas_properties sp WHERE sp.id=v_booking.property_id),
       'Africa/Dar_es_Salaam'
     ))::date<=v_booking.check_in THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='No-show can be recorded only after the scheduled check-in date';
  END IF;

  IF _authority='staff' AND _target_status='checked_in' THEN
    SELECT count(*) INTO v_room_count
    FROM public.room_states rs WHERE rs.room_id=v_booking.room_id;

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
    -- Serialize against concurrent allocation and restore exactly one unit
    -- for each night only on the first successful pending/confirmed transition.
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
    UPDATE public.room_states
    SET state='occupied',booking_id=v_booking.id,updated_by=coalesce(_actor,updated_by)
    WHERE id=v_room_state.id;
  ELSIF _authority='staff' AND _target_status='completed' THEN
    SELECT rs.* INTO v_room_state
    FROM public.room_states rs
    WHERE rs.booking_id=v_booking.id
    ORDER BY rs.unit_label LIMIT 1 FOR UPDATE;

    IF v_room_state.id IS NOT NULL THEN
      UPDATE public.room_states
      SET state='vacant_dirty',booking_id=NULL,updated_by=coalesce(_actor,updated_by)
      WHERE id=v_room_state.id;

      INSERT INTO public.ops_tasks(
        property_id,booking_id,room_state_id,task_type,category,title,priority,status,due_at
      ) VALUES (
        v_booking.property_id,v_booking.id,v_room_state.id,'housekeeping','housekeeping',
        'Clean '||v_room_state.unit_label||' after '||v_booking.guest_name,
        2,'pending',now()+interval '3 hours'
      );
    END IF;
  ELSIF _target_status IN ('cancelled','no_show') THEN
    UPDATE public.room_states
    SET state=CASE WHEN state='reserved' THEN 'vacant_clean' ELSE state END,
        booking_id=NULL,updated_by=coalesce(_actor,updated_by)
    WHERE booking_id=v_booking.id AND state='reserved';
  END IF;

  IF _actor IS NOT NULL THEN
    INSERT INTO public.activity_logs(
      actor_id,action,entity_type,entity_id,entity_label,module,metadata,severity
    ) VALUES (
      _actor,'reservation.status_changed','booking',v_booking.id,v_booking.reference,'reservations',
      jsonb_build_object(
        'from',v_previous_status,'to',_target_status,
        'notes',nullif(btrim(_notes),''),'property_id',v_booking.property_id
      ),
      'audit'
    );
  END IF;

  RETURN jsonb_build_object('ok',true,'duplicate',false,'booking_id',v_booking.id,'status',_target_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)
  TO service_role;

COMMIT;
