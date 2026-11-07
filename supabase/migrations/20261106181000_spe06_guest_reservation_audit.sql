-- SPE-06: record every reservation creation, including guest-originated bookings,
-- in the durable audit log with the accepted quote as correlation identifier.
BEGIN;
CREATE OR REPLACE FUNCTION public.staynas_create_reservation_from_quote(
  _quote_id uuid,
  _property_id uuid,
  _idempotency_key text,
  _guest_name text,
  _guest_email text,
  _guest_phone text DEFAULT NULL,
  _country text DEFAULT NULL,
  _special_requests text DEFAULT NULL,
  _payment_method text DEFAULT 'online',
  _source text DEFAULT 'website',
  _hold_id uuid DEFAULT NULL,
  _session_id text DEFAULT NULL,
  _target_status text DEFAULT 'pending',
  _actor_id uuid DEFAULT NULL,
  _visit_purpose text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_quote public.staynas_reservation_quotes%ROWTYPE;
  v_idempotency public.staynas_reservation_idempotency%ROWTYPE;
  v_request_hash text;
  v_current_quote jsonb;
  v_created record;
  v_persisted_snapshot jsonb;
  v_response jsonb;
  v_request jsonb;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Reservation creation is restricted to the server';
  END IF;
  IF _quote_id IS NULL OR _property_id IS NULL
     OR nullif(btrim(_idempotency_key),'') IS NULL
     OR length(_idempotency_key)>128
     OR nullif(btrim(_guest_name),'') IS NULL
     OR length(btrim(_guest_name))<2
     OR nullif(btrim(_guest_email),'') IS NULL
     OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     OR _payment_method NOT IN ('online','pay_at_property')
     OR _source NOT IN ('website','direct','walk_in','phone','email','whatsapp','agent','ota','corporate')
     OR _target_status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid canonical reservation request';
  END IF;
  IF _hold_id IS NOT NULL AND nullif(btrim(_session_id),'') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A booking hold requires its originating session';
  END IF;
  IF _actor_id IS NULL AND _target_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Guest bookings cannot self-confirm';
  END IF;
  IF _actor_id IS NOT NULL AND (
    NOT public.staynas_user_has_property_access(_actor_id,_property_id)
    OR NOT public.has_any_role(_actor_id,array['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Staff reservation authority denied for this property';
  END IF;

  v_request_hash := md5(jsonb_build_object(
    'quote_id',_quote_id,'guest_name',btrim(_guest_name),
    'guest_email',lower(btrim(_guest_email)),'guest_phone',nullif(btrim(_guest_phone),''),
    'country',nullif(btrim(_country),''),'special_requests',nullif(btrim(_special_requests),''),
    'payment_method',_payment_method,'source',_source,'hold_id',_hold_id,
    'session_id',_session_id,'target_status',_target_status,'actor_id',_actor_id,
    'visit_purpose',nullif(btrim(_visit_purpose),''),'notes',nullif(btrim(_notes),'')
  )::text);

  INSERT INTO public.staynas_reservation_idempotency(property_id,idempotency_key,request_hash)
  VALUES(_property_id,_idempotency_key,v_request_hash)
  ON CONFLICT(property_id,idempotency_key) DO NOTHING;

  SELECT * INTO v_idempotency
  FROM public.staynas_reservation_idempotency
  WHERE property_id=_property_id AND idempotency_key=_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Reservation idempotency record could not be secured';
  END IF;
  IF v_idempotency.request_hash<>v_request_hash THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Idempotency key was reused with a different reservation payload';
  END IF;
  IF v_idempotency.response IS NOT NULL THEN
    RETURN v_idempotency.response || jsonb_build_object('duplicate',true);
  END IF;

  SELECT * INTO v_quote
  FROM public.staynas_reservation_quotes
  WHERE id=_quote_id AND property_id=_property_id
  FOR UPDATE;

  IF NOT FOUND THEN
    DELETE FROM public.staynas_reservation_idempotency
    WHERE property_id=_property_id AND idempotency_key=_idempotency_key;
    RETURN jsonb_build_object('ok',false,'error_code','QUOTE_NOT_FOUND','message','The accepted quote could not be found');
  END IF;
  IF v_quote.expires_at<=now() THEN
    DELETE FROM public.staynas_reservation_idempotency
    WHERE property_id=_property_id AND idempotency_key=_idempotency_key;
    RETURN jsonb_build_object('ok',false,'error_code','QUOTE_EXPIRED','message','The quote expired. Request and accept a fresh quote');
  END IF;
  IF v_quote.consumed_at IS NOT NULL OR v_quote.booking_id IS NOT NULL THEN
    DELETE FROM public.staynas_reservation_idempotency
    WHERE property_id=_property_id AND idempotency_key=_idempotency_key;
    RETURN jsonb_build_object('ok',false,'error_code','QUOTE_ALREADY_USED','message','This quote has already been used');
  END IF;
  IF v_quote.request->>'guest_email_hash' IS NOT NULL
     AND v_quote.request->>'guest_email_hash'<>md5(lower(btrim(_guest_email))) THEN
    DELETE FROM public.staynas_reservation_idempotency
    WHERE property_id=_property_id AND idempotency_key=_idempotency_key;
    RETURN jsonb_build_object('ok',false,'error_code','QUOTE_GUEST_MISMATCH','message','The quote belongs to a different guest identity');
  END IF;

  v_request := v_quote.request;
  v_current_quote := public.get_staynas_booking_quote_with_rate_plan_and_promo(
    _property_id,v_request->>'room_slug',(v_request->>'check_in')::date,(v_request->>'check_out')::date,
    (v_request->>'adults')::integer,(v_request->>'children_below_6')::integer,
    (v_request->>'children_7_plus')::integer,coalesce(v_request->'extras','[]'::jsonb),
    nullif(v_request->>'rate_plan_id','')::uuid,v_request->>'promo_code',lower(btrim(_guest_email))
  );

  IF coalesce(v_current_quote->>'ok','true')='false'
     OR v_current_quote->>'total' IS NULL
     OR md5(v_current_quote::text)<>v_quote.quote_hash THEN
    DELETE FROM public.staynas_reservation_idempotency
    WHERE property_id=_property_id AND idempotency_key=_idempotency_key;
    RETURN jsonb_build_object(
      'ok',false,'error_code','QUOTE_STALE',
      'message','Pricing or booking configuration changed. Review and accept the revised quote',
      'current_quote',v_current_quote
    );
  END IF;

  PERFORM set_config('staynas.rate_plan_id',coalesce(v_request->>'rate_plan_id',''),true);
  PERFORM set_config('staynas.promo_code',coalesce(v_request->>'promo_code',''),true);

  BEGIN
    SELECT * INTO v_created
    FROM public.create_booking_for_property_with_rate_plan_and_promo(
      _property_id,
      v_request->>'room_slug',
      (v_request->>'check_in')::date,
      (v_request->>'check_out')::date,
      (v_request->>'adults')::integer,
      (v_request->>'children_below_6')::integer+(v_request->>'children_7_plus')::integer,
      btrim(_guest_name),
      lower(btrim(_guest_email)),
      nullif(btrim(_guest_phone),''),
      nullif(btrim(_country),''),
      nullif(btrim(_special_requests),''),
      coalesce(v_request->'extras','[]'::jsonb),
      (v_request->>'children_below_6')::integer,
      (v_request->>'children_7_plus')::integer,
      _hold_id,
      _session_id,
      _payment_method,
      nullif(v_request->>'rate_plan_id','')::uuid,
      v_request->>'promo_code'
    );

    SELECT b.pricing_snapshot INTO v_persisted_snapshot
    FROM public.bookings b WHERE b.id=v_created.booking_id;

    IF v_persisted_snapshot IS NULL OR md5(v_persisted_snapshot::text)<>v_quote.quote_hash THEN
      RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='SPE06_QUOTE_STALE_AFTER_LOCK';
    END IF;

    UPDATE public.bookings
    SET reservation_quote_id=_quote_id,
        source=_source,
        visit_purpose=coalesce(nullif(btrim(_visit_purpose),''),visit_purpose),
        notes=coalesce(nullif(btrim(_notes),''),notes)
    WHERE id=v_created.booking_id AND property_id=_property_id;

    IF _target_status='confirmed' THEN
      PERFORM public.staynas_transition_booking_core(
        v_created.booking_id,'confirmed',null,_actor_id,'staff',_property_id
      );
    END IF;
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    DELETE FROM public.staynas_reservation_idempotency
    WHERE property_id=_property_id AND idempotency_key=_idempotency_key;
    RETURN jsonb_build_object(
      'ok',false,'error_code','QUOTE_STALE',
      'message','Pricing changed during booking confirmation. Review and accept a revised quote'
    );
  END;


  INSERT INTO public.activity_logs(
    actor_id,action,entity_type,entity_id,entity_label,module,metadata,severity,correlation_id
  ) VALUES (
    _actor_id,'reservation.created','booking',v_created.booking_id,v_created.reference,
    'reservations',
    jsonb_build_object(
      'actor_type',CASE WHEN _actor_id IS NULL THEN 'guest' ELSE 'staff' END,
      'property_id',_property_id,'source',_source,'status',_target_status,
      'quote_id',_quote_id,'total',v_created.total,'currency',v_created.currency
    ),
    'audit',_quote_id
  );

  UPDATE public.staynas_reservation_quotes
  SET consumed_at=now(),booking_id=v_created.booking_id
  WHERE id=_quote_id AND property_id=_property_id;

  v_response := jsonb_build_object(
    'ok',true,'duplicate',false,
    'booking_id',v_created.booking_id,
    'reference',v_created.reference,
    'total',v_created.total,
    'currency',v_created.currency,
    'status',_target_status,
    'quote_id',_quote_id
  );

  UPDATE public.staynas_reservation_idempotency
  SET booking_id=v_created.booking_id,response=v_response
  WHERE property_id=_property_id AND idempotency_key=_idempotency_key;

  RETURN v_response;
END;
$function$;
COMMIT;
