-- SPE-06: durable quote acceptance, quote-to-book validation and idempotent reservation creation.
-- Additive only. No existing booking, payment, invoice, room or inventory rows are rewritten.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_reservation_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  request jsonb NOT NULL,
  quote_snapshot jsonb NOT NULL,
  quote_hash text NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{32}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  booking_id uuid UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_reservation_quotes_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS staynas_reservation_quotes_property_expiry_idx
  ON public.staynas_reservation_quotes(property_id, expires_at DESC);

ALTER TABLE public.staynas_reservation_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_reservation_quotes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_reservation_quotes TO service_role;

CREATE TABLE IF NOT EXISTS public.staynas_reservation_idempotency (
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{32}$'),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(property_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS staynas_reservation_idempotency_booking_idx
  ON public.staynas_reservation_idempotency(booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE public.staynas_reservation_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_reservation_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_reservation_idempotency TO service_role;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reservation_quote_id uuid
  REFERENCES public.staynas_reservation_quotes(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_reservation_quote_uidx
  ON public.bookings(reservation_quote_id)
  WHERE reservation_quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.staynas_create_reservation_quote(
  _property_id uuid,
  _room_slug text,
  _check_in date,
  _check_out date,
  _adults integer,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0,
  _extras jsonb DEFAULT '[]'::jsonb,
  _rate_plan_id uuid DEFAULT NULL,
  _promo_code text DEFAULT NULL,
  _guest_email text DEFAULT NULL,
  _ttl_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room_id uuid;
  v_quote jsonb;
  v_request jsonb;
  v_quote_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Reservation quote creation is restricted to the server';
  END IF;
  IF _property_id IS NULL OR _room_slug IS NULL OR _check_in IS NULL OR _check_out <= _check_in
     OR _adults < 1 OR _children_below_6 < 0 OR _children_7_plus < 0
     OR _adults + _children_below_6 + _children_7_plus > 20
     OR jsonb_typeof(coalesce(_extras,'[]'::jsonb)) <> 'array'
     OR _ttl_seconds NOT BETWEEN 60 AND 1800 THEN
    RETURN jsonb_build_object('ok',false,'error_code','INVALID_QUOTE_REQUEST','message','The reservation quote request is invalid');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p
    WHERE p.id=_property_id AND p.status='active'
  ) THEN
    RETURN jsonb_build_object('ok',false,'error_code','PROPERTY_UNAVAILABLE','message','The selected property is unavailable');
  END IF;

  SELECT r.id INTO v_room_id
  FROM public.rooms r
  WHERE r.property_id=_property_id AND r.slug=_room_slug AND r.status='active';
  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error_code','ROOM_NOT_FOUND','message','Room not found for this property');
  END IF;

  v_quote := public.get_staynas_booking_quote_with_rate_plan_and_promo(
    _property_id,_room_slug,_check_in,_check_out,_adults,
    _children_below_6,_children_7_plus,coalesce(_extras,'[]'::jsonb),
    _rate_plan_id,nullif(btrim(_promo_code),''),nullif(lower(btrim(_guest_email)),'')
  );

  IF coalesce(v_quote->>'ok','true')='false' OR v_quote->>'total' IS NULL THEN
    RETURN coalesce(v_quote,jsonb_build_object('ok',false,'error_code','QUOTE_UNAVAILABLE'));
  END IF;

  v_request := jsonb_build_object(
    'room_slug',_room_slug,
    'check_in',_check_in,
    'check_out',_check_out,
    'adults',_adults,
    'children_below_6',_children_below_6,
    'children_7_plus',_children_7_plus,
    'extras',coalesce(_extras,'[]'::jsonb),
    'rate_plan_id',_rate_plan_id,
    'promo_code',nullif(btrim(_promo_code),''),
    'guest_email_hash',CASE WHEN nullif(btrim(_guest_email),'') IS NULL THEN NULL ELSE md5(lower(btrim(_guest_email))) END
  );
  v_expires_at := now() + make_interval(secs=>_ttl_seconds);

  INSERT INTO public.staynas_reservation_quotes(
    property_id,room_id,request,quote_snapshot,quote_hash,expires_at
  ) VALUES (
    _property_id,v_room_id,v_request,v_quote,md5(v_quote::text),v_expires_at
  ) RETURNING id INTO v_quote_id;

  RETURN v_quote || jsonb_build_object(
    'quote_id',v_quote_id,
    'quote_hash',md5(v_quote::text),
    'quote_expires_at',v_expires_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)
  TO service_role;

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

REVOKE ALL ON FUNCTION public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)
  TO service_role;

-- Enforce payment policy at the database lifecycle boundary. An unpaid online
-- reservation cannot be confirmed; pay-at-property and zero-deposit stays remain valid.
CREATE OR REPLACE FUNCTION public.staynas_enforce_booking_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF new.status IS NOT DISTINCT FROM old.status THEN
    RETURN new;
  END IF;

  IF new.status::text = 'confirmed' THEN
    IF old.status::text <> 'pending'
      OR (v_actor IS NOT NULL AND NOT public.has_any_role(v_actor, array['owner','manager','admin','reservations','reception']::public.app_role[])) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only authorized reservations staff may confirm a pending booking';
    END IF;
    IF old.payment_status::text='unpaid'
       AND coalesce(old.payment_method,'online')<>'pay_at_property'
       AND coalesce(old.deposit_amount,0)>0 THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Payment is required before confirming this reservation';
    END IF;
    new.confirmed_at := coalesce(new.confirmed_at,now());
  ELSIF new.status::text = 'checked_in' THEN
    IF old.status::text <> 'confirmed'
      OR (v_actor IS NOT NULL AND NOT public.has_any_role(v_actor, array['owner','manager','admin','reception']::public.app_role[])) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only front-desk staff may check in a confirmed booking';
    END IF;
    new.checked_in_at := coalesce(new.checked_in_at,now());
  ELSIF new.status::text = 'completed' THEN
    IF old.status::text <> 'checked_in'
      OR (v_actor IS NOT NULL AND NOT public.has_any_role(v_actor, array['owner','manager','admin','reception']::public.app_role[])) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='A booking must be checked in by authorized front-desk staff before completion';
    END IF;
    IF EXISTS (SELECT 1 FROM public.room_states rs WHERE rs.room_id=old.room_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.room_states rs
         WHERE rs.booking_id=old.id AND rs.room_id=old.room_id AND rs.state='occupied'
       ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Checkout requires the assigned physical room to be in occupied state';
    END IF;
  ELSIF new.status::text = 'cancelled' THEN
    IF old.status::text NOT IN ('pending','confirmed')
      OR (v_actor IS NOT NULL AND NOT public.has_any_role(v_actor, array['owner','manager','admin','reservations']::public.app_role[])) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Cancellation is permitted only for pending or confirmed bookings by reservations managers';
    END IF;
    new.cancelled_at := coalesce(new.cancelled_at,now());
  ELSIF new.status::text = 'no_show' THEN
    IF old.status::text <> 'confirmed'
      OR (now() AT TIME ZONE coalesce((SELECT sp.timezone FROM public.staynas_properties sp WHERE sp.id=old.property_id),'Africa/Dar_es_Salaam'))::date <= old.check_in
      OR (v_actor IS NOT NULL AND NOT public.has_any_role(v_actor, array['owner','manager','admin','reservations']::public.app_role[])) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='No-show requires an unarrived confirmed booking after its check-in date and reservations authorization';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unsupported booking lifecycle transition';
  END IF;

  RETURN new;
END;
$function$;

COMMIT;
