-- DC-05.03 — canonical provider reservation materialization.
-- Requires DC-03R, DC-04, SPE-02/SPE-03 and SPE-04.07 migrations.
-- Feature/UAT artifact only. Never apply to production without separate approval.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.staynas_distribution_webhook_inbox') IS NULL
     OR to_regclass('public.staynas_distribution_connections') IS NULL
     OR to_regclass('public.staynas_distribution_listing_mappings') IS NULL
     OR to_regclass('public.staynas_distribution_room_mappings') IS NULL
     OR to_regclass('public.staynas_distribution_rate_plan_mappings') IS NULL
     OR to_regclass('public.bookings') IS NULL
     OR to_regclass('public.booking_nights') IS NULL
     OR to_regprocedure('public.staynas_lock_room_inventory_dates(uuid,uuid,date,date)') IS NULL
     OR to_regprocedure('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)') IS NULL
     OR to_regprocedure('public.get_staynas_room_availability_priced_with_rate_plan(date,date,uuid,integer,integer,integer,uuid)') IS NULL
     OR to_regprocedure('public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'DC-05.03 requires DC-03R, DC-04, SPE-03 and SPE-04.07 canonical contracts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rooms' AND column_name='catalogue_type_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='pricing_snapshot'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='booking_nights' AND column_name='pricing_snapshot'
  ) THEN
    RAISE EXCEPTION 'DC-05.03 requires canonical room-type and immutable pricing snapshot columns';
  END IF;
END
$dependencies$;

-- Bind each durable reservation event to the exact trusted connection used at ingress.
ALTER TABLE public.staynas_distribution_webhook_inbox
  ADD COLUMN IF NOT EXISTS connection_id uuid;

DO $connection_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='staynas_distribution_webhook_inbox_connection_scope_fk'
      AND conrelid='public.staynas_distribution_webhook_inbox'::regclass
  ) THEN
    ALTER TABLE public.staynas_distribution_webhook_inbox
      ADD CONSTRAINT staynas_distribution_webhook_inbox_connection_scope_fk
      FOREIGN KEY (connection_id,organisation_id,property_id)
      REFERENCES public.staynas_distribution_connections(id,organisation_id,property_id)
      ON DELETE RESTRICT;
  END IF;
END
$connection_fk$;

-- PII never enters the ordinary webhook inbox. The complete provider payload is
-- encrypted by the server with AES-256-GCM before this row is written.
CREATE TABLE IF NOT EXISTS public.staynas_distribution_reservation_payloads (
  inbox_id uuid PRIMARY KEY
    REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 1 AND 65536),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 1 AND 64),
  auth_tag text NOT NULL CHECK (length(auth_tag) BETWEEN 1 AND 64),
  key_version text NOT NULL CHECK (key_version ~ '^[A-Za-z0-9_-]{1,32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staynas_distribution_reservation_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_reservation_payloads FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.staynas_distribution_reservation_payloads TO service_role;
REVOKE UPDATE,TRUNCATE ON public.staynas_distribution_reservation_payloads FROM service_role;

CREATE OR REPLACE FUNCTION public.staynas_receive_distribution_webhook_scoped(
  _organisation_id uuid,
  _property_id uuid,
  _connection_id uuid,
  _account_grant_id uuid,
  _external_account_id uuid,
  _provider_key text,
  _environment text,
  _capability text,
  _provider_event_id text,
  _event_type text,
  _payload_fingerprint text,
  _normalized_event jsonb,
  _correlation_id text
)
RETURNS TABLE(inbox_id uuid,created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_id uuid;
  v_existing_fingerprint text;
  v_existing_connection uuid;
BEGIN
  IF _event_type NOT LIKE 'reservation.%'
     OR _connection_id IS NULL
     OR _payload_fingerprint IS NULL OR _payload_fingerprint !~ '^[0-9a-f]{64}$'
     OR _normalized_event IS NULL OR pg_catalog.jsonb_typeof(_normalized_event)<>'object'
     OR _correlation_id IS NULL OR length(pg_catalog.btrim(_correlation_id)) NOT BETWEEN 1 AND 128
     OR _capability NOT IN ('reservation.import','reservation.update','reservation.cancel') THEN
    RAISE EXCEPTION 'Invalid scoped reservation webhook envelope.' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.staynas_distribution_connections c
    JOIN public.staynas_distribution_account_grants g
      ON g.id=c.account_grant_id
     AND g.organisation_id=c.organisation_id
     AND g.property_id=c.property_id
     AND g.external_account_id=c.external_account_id
     AND g.provider_key=c.provider_key
     AND g.environment=c.environment
    WHERE c.id=_connection_id
      AND c.organisation_id=_organisation_id
      AND c.property_id=_property_id
      AND c.account_grant_id=_account_grant_id
      AND c.external_account_id=_external_account_id
      AND c.provider_key=_provider_key
      AND c.environment=_environment
      AND c.lifecycle='connected'
      AND g.grant_status='active'
      AND _capability=ANY(g.granted_capabilities)
  ) THEN
    RAISE EXCEPTION 'Reservation connection grant is not active or does not permit this capability.'
      USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_inbox(
    organisation_id,property_id,connection_id,account_grant_id,external_account_id,
    provider_key,environment,provider_event_id,event_type,payload_fingerprint,
    normalized_event,correlation_id
  ) VALUES (
    _organisation_id,_property_id,_connection_id,_account_grant_id,_external_account_id,
    _provider_key,_environment,_provider_event_id,_event_type,_payload_fingerprint,
    _normalized_event,_correlation_id
  )
  ON CONFLICT(provider_key,external_account_id,provider_event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id,true;
    RETURN;
  END IF;

  SELECT i.id,i.payload_fingerprint,i.connection_id
    INTO v_id,v_existing_fingerprint,v_existing_connection
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.provider_key=_provider_key
    AND i.external_account_id=_external_account_id
    AND i.provider_event_id=_provider_event_id
  FOR UPDATE;

  IF v_id IS NULL
     OR v_existing_fingerprint IS DISTINCT FROM _payload_fingerprint
     OR v_existing_connection IS DISTINCT FROM _connection_id THEN
    RAISE EXCEPTION 'Provider event identity was reused with a different payload or connection.'
      USING ERRCODE='22023';
  END IF;

  RETURN QUERY SELECT v_id,false;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_receive_distribution_webhook_scoped(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_receive_distribution_webhook_scoped(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_store_distribution_reservation_payload(
  _inbox_id uuid,
  _payload_fingerprint text,
  _ciphertext text,
  _nonce text,
  _auth_tag text,
  _key_version text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_existing text;
BEGIN
  SELECT * INTO v_inbox
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id
  FOR UPDATE;

  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'Reservation inbox event was not found.' USING ERRCODE='P0002';
  END IF;

  IF v_inbox.event_type NOT LIKE 'reservation.%' OR v_inbox.connection_id IS NULL
     OR _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR _payload_fingerprint !~ '^[0-9a-f]{64}$'
     OR _ciphertext IS NULL OR length(_ciphertext) NOT BETWEEN 1 AND 65536
     OR _nonce IS NULL OR length(_nonce) NOT BETWEEN 1 AND 64
     OR _auth_tag IS NULL OR length(_auth_tag) NOT BETWEEN 1 AND 64
     OR _key_version IS NULL OR _key_version !~ '^[A-Za-z0-9_-]{1,32}$' THEN
    RAISE EXCEPTION 'Encrypted reservation payload does not match its durable inbox event.'
      USING ERRCODE='22023';
  END IF;

  -- A duplicate delivery after successful processing must not recreate retained PII.
  IF v_inbox.processing_status IN ('processed','ignored')
     OR EXISTS (
       SELECT 1 FROM public.staynas_distribution_reservation_links l
       WHERE l.provider_key=v_inbox.provider_key
         AND l.external_account_id=v_inbox.external_account_id
         AND l.external_reservation_id=v_inbox.normalized_event->>'externalReservationId'
     ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.staynas_distribution_reservation_payloads(
    inbox_id,payload_fingerprint,ciphertext,nonce,auth_tag,key_version
  ) VALUES (
    _inbox_id,_payload_fingerprint,_ciphertext,_nonce,_auth_tag,_key_version
  ) ON CONFLICT(inbox_id) DO NOTHING;

  SELECT p.payload_fingerprint INTO v_existing
  FROM public.staynas_distribution_reservation_payloads p
  WHERE p.inbox_id=_inbox_id;

  IF v_existing IS DISTINCT FROM _payload_fingerprint THEN
    RAISE EXCEPTION 'Reservation payload fingerprint conflicts with the stored event.'
      USING ERRCODE='22023';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_store_distribution_reservation_payload(uuid,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_store_distribution_reservation_payload(uuid,text,text,text,text,text)
  TO service_role;

-- Only the reservation materializer may claim create/confirm events, and only
-- after the encrypted full payload is durably available.
CREATE OR REPLACE FUNCTION public.staynas_claim_distribution_reservation_materialization(
  _worker_id text,
  _lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.staynas_distribution_webhook_inbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_row public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_token uuid;
BEGIN
  IF _worker_id IS NULL OR length(pg_catalog.btrim(_worker_id)) NOT BETWEEN 1 AND 128
     OR _lease_seconds IS NULL OR _lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Invalid reservation materialization worker lease.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.staynas_distribution_webhook_attempts(
    inbox_id,attempt_number,worker_id,status,safe_summary,correlation_id,started_at,finished_at
  )
  SELECT i.id,i.attempt_count,coalesce(i.lease_owner,'unknown'),'lease_expired',
    'Reservation materialization worker lease expired before completion.',
    i.correlation_id,coalesce(i.lease_started_at,i.received_at),pg_catalog.now()
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.event_type IN ('reservation.created','reservation.confirmed')
    AND i.connection_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.staynas_distribution_reservation_payloads p WHERE p.inbox_id=i.id)
    AND i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now()
    AND i.attempt_count>0
  ON CONFLICT(inbox_id,attempt_number) DO NOTHING;

  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='permanent_failure',processed_at=pg_catalog.now(),
      lease_started_at=NULL,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,
      safe_error_summary='Reservation materialization lease expired after retry budget was exhausted.'
  WHERE i.event_type IN ('reservation.created','reservation.confirmed')
    AND i.connection_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.staynas_distribution_reservation_payloads p WHERE p.inbox_id=i.id)
    AND i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now()
    AND i.attempt_count>=i.max_attempts;

  SELECT i.* INTO v_row
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.event_type IN ('reservation.created','reservation.confirmed')
    AND i.connection_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.staynas_distribution_reservation_payloads p WHERE p.inbox_id=i.id)
    AND i.attempt_count<i.max_attempts
    AND (
      (i.processing_status IN ('received','retryable_failure') AND i.next_attempt_at<=pg_catalog.now())
      OR (i.processing_status='processing' AND i.lease_expires_at<pg_catalog.now())
    )
  ORDER BY i.next_attempt_at,i.received_at,i.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF v_row.id IS NULL THEN RETURN; END IF;

  v_token:=pg_catalog.gen_random_uuid();
  UPDATE public.staynas_distribution_webhook_inbox i
  SET processing_status='processing',attempt_count=i.attempt_count+1,
      lease_started_at=pg_catalog.now(),lease_token=v_token,lease_owner=_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>_lease_seconds),
      safe_error_summary=NULL
  WHERE i.id=v_row.id
  RETURNING i.* INTO v_row;

  RETURN NEXT v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_claim_distribution_reservation_materialization(text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_claim_distribution_reservation_materialization(text,integer)
  TO service_role;

-- Reservation-to-booking linkage is the idempotency authority for the provider
-- reservation identity, independent of individual webhook event IDs.
CREATE TABLE IF NOT EXISTS public.staynas_distribution_reservation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  account_grant_id uuid NOT NULL,
  external_account_id uuid NOT NULL,
  provider_key text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox','live')),
  external_reservation_id text NOT NULL CHECK (length(trim(external_reservation_id)) BETWEEN 1 AND 256),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  source_inbox_id uuid NOT NULL REFERENCES public.staynas_distribution_webhook_inbox(id) ON DELETE RESTRICT,
  source_provider_event_id text NOT NULL CHECK (length(trim(source_provider_event_id)) BETWEEN 1 AND 256),
  provider_status text NOT NULL CHECK (length(trim(provider_status)) BETWEEN 1 AND 64),
  provider_modified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_key,external_account_id,external_reservation_id),
  UNIQUE(booking_id),
  FOREIGN KEY(connection_id,organisation_id,property_id)
    REFERENCES public.staynas_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  FOREIGN KEY(account_grant_id,organisation_id,property_id,external_account_id,provider_key,environment)
    REFERENCES public.staynas_distribution_account_grants
      (id,organisation_id,property_id,external_account_id,provider_key,environment) ON DELETE RESTRICT
);
ALTER TABLE public.staynas_distribution_reservation_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_reservation_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.staynas_distribution_reservation_links TO service_role;
REVOKE UPDATE,DELETE,TRUNCATE ON public.staynas_distribution_reservation_links FROM service_role;

CREATE OR REPLACE FUNCTION public.validate_staynas_distribution_reservation_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_property_id uuid;
BEGIN
  SELECT b.property_id INTO v_property_id
  FROM public.bookings b WHERE b.id=NEW.booking_id;
  IF v_property_id IS NULL OR v_property_id IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'Provider reservation link booking/property scope mismatch.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_distribution_reservation_link_scope
  ON public.staynas_distribution_reservation_links;
CREATE TRIGGER staynas_distribution_reservation_link_scope
  BEFORE INSERT ON public.staynas_distribution_reservation_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_staynas_distribution_reservation_link();

-- Repair the DC-03R/SPE-04 composition: retain DC-03R's ordered date locks and
-- hold semantics while making the SPE-04 shared quote the only monetary authority.
CREATE OR REPLACE FUNCTION public.create_booking(
  _room_slug text,_check_in date,_check_out date,_adults integer,_children integer,
  _guest_name text,_guest_email text,_guest_phone text,_country text,_special_requests text,
  _extras jsonb,_children_below_6 integer,_children_7_plus integer,
  _hold_id uuid,_session_id text,_property_id uuid,_payment_method text DEFAULT 'online'
)
RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text,
  taxes numeric,tax_addition numeric,tax_breakdown jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_hold public.booking_holds%ROWTYPE;
  v_extra public.extras%ROWTYPE;
  v_quote jsonb;
  v_night jsonb;
  v_extra_line jsonb;
  v_day date;
  v_units integer;
  v_other_holds integer;
  v_blocked boolean;
  v_booking_id uuid;
  v_reference text;
  v_below6 integer:=COALESCE(_children_below_6,0);
  v_plus7 integer:=COALESCE(_children_7_plus,GREATEST(0,COALESCE(_children,0)));
  v_children_total integer;
  v_nights integer;
  v_subtotal numeric;
  v_extras_total numeric;
  v_taxes numeric;
  v_tax_addition numeric;
  v_tax_breakdown jsonb;
  v_total numeric;
  v_deposit numeric;
  v_balance numeric;
  v_payment_method text:=COALESCE(_payment_method,'online');
  v_booking_source text:=COALESCE(NULLIF(current_setting('staynas.booking_source',true),''),'website');
BEGIN
  IF _property_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active'
  ) THEN RAISE EXCEPTION 'Property not found or inactive' USING ERRCODE='42501'; END IF;
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role'
     AND (auth.uid() IS NULL OR NOT public.staynas_user_has_property_access(auth.uid(),_property_id)) THEN
    RAISE EXCEPTION 'Not authorized for requested property' USING ERRCODE='42501';
  END IF;
  IF _check_out<=_check_in OR _adults IS NULL OR _adults<1 THEN
    RAISE EXCEPTION 'Invalid booking stay or adult occupancy' USING ERRCODE='22023';
  END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2
     OR _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid guest name and email are required' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(COALESCE(_extras,'[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'Extras must be an array' USING ERRCODE='22023';
  END IF;
  IF v_payment_method NOT IN ('online','pay_at_property','channel') THEN
    RAISE EXCEPTION 'Unsupported booking payment method' USING ERRCODE='22023';
  END IF;
  IF v_booking_source NOT IN ('website','channel')
     OR (v_booking_source='channel' AND v_payment_method<>'channel')
     OR (v_booking_source='website' AND v_payment_method='channel') THEN
    RAISE EXCEPTION 'Booking source and payment method are inconsistent' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_room FROM public.rooms r
  WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property' USING ERRCODE='42501'; END IF;

  v_children_total:=v_below6+v_plus7;
  IF _children IS NOT NULL AND _children<>v_children_total THEN
    RAISE EXCEPTION 'Child counts do not match supplied occupancy' USING ERRCODE='22023';
  END IF;
  IF _adults>v_room.capacity_adults
     OR v_children_total>v_room.capacity_children
     OR _adults+v_children_total>v_room.max_occupancy THEN
    RAISE EXCEPTION 'Room occupancy exceeded' USING ERRCODE='22023';
  END IF;
  v_nights:=_check_out-_check_in;

  -- DC-03R lock order is mandatory: room/date rows in ascending date order,
  -- then the hold row. Quote and allocation remain in this same transaction.
  PERFORM public.staynas_lock_room_inventory_dates(v_room.id,_property_id,_check_in,_check_out);

  IF _hold_id IS NOT NULL THEN
    SELECT h.* INTO v_hold FROM public.booking_holds h
    WHERE h.id=_hold_id AND h.property_id=_property_id FOR UPDATE;
    IF NOT FOUND OR v_hold.status<>'active' OR v_hold.expires_at<=now()
       OR v_hold.room_id<>v_room.id OR v_hold.check_in<>_check_in
       OR v_hold.check_out<>_check_out
       OR _session_id IS NULL OR length(trim(_session_id))<24
       OR v_hold.session_id<>_session_id THEN
      RAISE EXCEPTION 'Booking hold is invalid for this property, room, stay or session'
        USING ERRCODE='42501';
    END IF;
  END IF;

  PERFORM 1 FROM public.pricing_rules pr
  WHERE pr.property_id=_property_id AND pr.active=true
    AND (pr.scope='all' OR pr.room_id=v_room.id)
    AND (pr.starts_on IS NULL OR pr.starts_on<_check_out)
    AND (pr.ends_on IS NULL OR pr.ends_on>=_check_in)
  FOR SHARE;

  PERFORM 1 FROM public.staynas_property_tax_rules tr
  WHERE tr.property_id=_property_id AND tr.active=true
    AND (tr.valid_from IS NULL OR tr.valid_from<=_check_in)
    AND (tr.valid_to IS NULL OR tr.valid_to>=_check_in)
  FOR SHARE;

  PERFORM 1 FROM public.extras e
  WHERE e.property_id=_property_id AND e.active=true
    AND e.slug IN (
      SELECT item.value->>'slug'
      FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) AS item(value)
    )
  FOR SHARE;

  v_quote:=public.calculate_staynas_booking_quote(
    _property_id,v_room.id,_check_in,_check_out,_adults,v_below6,v_plus7,_extras
  );
  IF v_quote->>'ok'='false' THEN
    RAISE EXCEPTION 'StayNas pricing rejected [%]: %',
      COALESCE(v_quote->>'error_code','INVALID_RATE_CONFIGURATION'),
      COALESCE(v_quote->>'message','Pricing configuration is invalid');
  END IF;
  IF v_quote IS NULL OR jsonb_typeof(v_quote->'nightly')<>'array'
     OR upper(COALESCE(v_quote->>'currency',''))<>upper(v_room.currency) THEN
    RAISE EXCEPTION 'StayNas pricing returned an incomplete or mismatched quote'
      USING ERRCODE='22023';
  END IF;

  v_subtotal:=(v_quote->>'accommodation_subtotal')::numeric;
  v_extras_total:=(v_quote->>'extras_total')::numeric;
  v_taxes:=(v_quote->>'taxes')::numeric;
  v_tax_addition:=(v_quote->>'tax_addition')::numeric;
  v_tax_breakdown:=COALESCE(v_quote->'tax_breakdown','[]'::jsonb);
  v_total:=(v_quote->>'total')::numeric;
  v_deposit:=CASE WHEN v_payment_method IN ('pay_at_property','channel')
    THEN 0 ELSE round(v_total/2,2) END;
  v_balance:=v_total-v_deposit;
  v_reference:=upper(substr(md5(random()::text||clock_timestamp()::text),1,10))
    ||'-'||to_char(now(),'YYMMDD');

  INSERT INTO public.bookings(
    reference,room_id,property_id,check_in,check_out,nights,adults,children,
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,
    special_requests,currency,source,payment_method,payment_provider,
    subtotal,extras_total,taxes,tax_addition,tax_breakdown,total,
    deposit_amount,balance_amount,balance_due,pricing_snapshot
  ) VALUES (
    v_reference,v_room.id,_property_id,_check_in,_check_out,v_nights,_adults,v_children_total,
    v_below6,v_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,
    _special_requests,upper(v_room.currency),v_booking_source,
    CASE WHEN v_payment_method='channel' THEN NULL
         WHEN v_payment_method='pay_at_property' THEN 'pay_at_property' ELSE NULL END,
    CASE WHEN v_payment_method='channel' THEN 'manual'
         WHEN v_payment_method='pay_at_property' THEN 'manual' ELSE 'pesapal' END,
    v_subtotal,v_extras_total,v_taxes,v_tax_addition,v_tax_breakdown,v_total,
    v_deposit,v_balance,v_balance,v_quote
  ) RETURNING id INTO v_booking_id;

  FOR v_night IN SELECT value FROM jsonb_array_elements(v_quote->'nightly')
  LOOP
    v_day:=(v_night->>'date')::date;
    SELECT i.available_units,i.is_blocked,
      (SELECT count(*)::integer FROM public.booking_holds h
       WHERE h.room_id=v_room.id AND h.property_id=_property_id
         AND h.status='active' AND h.expires_at>now()
         AND h.check_in<=v_day AND h.check_out>v_day
         AND h.id IS DISTINCT FROM _hold_id)
    INTO v_units,v_blocked,v_other_holds
    FROM public.room_inventory i
    WHERE i.room_id=v_room.id AND i.date=v_day FOR UPDATE;

    IF v_blocked THEN RAISE EXCEPTION 'Room blocked on %',v_day; END IF;
    IF v_units-COALESCE(v_other_holds,0)<=0 THEN
      RAISE EXCEPTION 'No unallocated inventory on %',v_day;
    END IF;
    UPDATE public.room_inventory
    SET available_units=available_units-1,updated_at=now()
    WHERE room_id=v_room.id AND date=v_day AND available_units>0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed while allocating %',v_day; END IF;

    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate,pricing_snapshot)
    VALUES(v_booking_id,v_room.id,v_day,(v_night->>'nightly_rate')::numeric,v_night);
  END LOOP;

  FOR v_extra_line IN SELECT value FROM jsonb_array_elements(COALESCE(v_quote->'extras','[]'::jsonb))
  LOOP
    SELECT * INTO v_extra FROM public.extras e
    WHERE e.slug=v_extra_line->>'slug' AND e.active=true AND e.property_id=_property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Extra became unavailable during booking'; END IF;
    INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total)
    VALUES(v_booking_id,v_extra.id,(v_extra_line->>'quantity')::integer,
      (v_extra_line->>'unit_price')::numeric,(v_extra_line->>'line_total')::numeric);
  END LOOP;

  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds SET status='converted',converted_booking_id=v_booking_id,updated_at=now()
    WHERE id=_hold_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking hold could not be converted'; END IF;
  END IF;

  PERFORM public.log_calendar_event(
    'reservation.created',v_room.id,v_booking_id,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'reference',v_reference,
      'total',v_total,'currency',v_room.currency,'source',v_booking_source)
  );
  RETURN QUERY SELECT v_booking_id,v_reference,v_total,upper(v_room.currency),
    v_taxes,v_tax_addition,v_tax_breakdown;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_booking_for_property(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,
  _adults integer,_children integer,_guest_name text,_guest_email text,
  _guest_phone text,_country text,_special_requests text,_extras jsonb DEFAULT '[]'::jsonb,
  _children_below_6 integer DEFAULT NULL,_children_7_plus integer DEFAULT NULL,
  _hold_id uuid DEFAULT NULL,_session_id text DEFAULT NULL,_payment_method text DEFAULT 'online'
)
RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text,
  taxes numeric,tax_addition numeric,tax_breakdown jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=public
AS $function$
  SELECT * FROM public.create_booking(
    _room_slug,_check_in,_check_out,_adults,_children,_guest_name,_guest_email,
    _guest_phone,_country,_special_requests,_extras,_children_below_6,_children_7_plus,
    _hold_id,_session_id,_property_id,_payment_method
  );
$function$;

CREATE OR REPLACE FUNCTION public.create_booking_for_property(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,
  _adults integer,_children integer,_guest_name text,_guest_email text,
  _guest_phone text,_country text,_special_requests text,_extras jsonb DEFAULT '[]'::jsonb,
  _children_below_6 integer DEFAULT NULL,_children_7_plus integer DEFAULT NULL,
  _hold_id uuid DEFAULT NULL,_session_id text DEFAULT NULL
)
RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text)
LANGUAGE sql SECURITY DEFINER SET search_path=public
AS $function$
  SELECT x.booking_id,x.reference,x.total,x.currency
  FROM public.create_booking(
    _room_slug,_check_in,_check_out,_adults,_children,_guest_name,_guest_email,
    _guest_phone,_country,_special_requests,_extras,_children_below_6,_children_7_plus,
    _hold_id,_session_id,_property_id,'online'
  ) x;
$function$;

REVOKE ALL ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_materialize_distribution_reservation(
  _inbox_id uuid,
  _lease_token uuid,
  _worker_id text,
  _payload_fingerprint text,
  _external_reservation_id text,
  _arrival_date date,
  _departure_date date,
  _adults integer,
  _children integer,
  _children_below_6 integer,
  _children_7_plus integer,
  _guest_name text,
  _guest_email text,
  _guest_phone text DEFAULT NULL,
  _country text DEFAULT NULL,
  _special_requests text DEFAULT NULL
)
RETURNS TABLE(outcome text,booking_id uuid,created boolean,reconciliation_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_existing public.staynas_distribution_reservation_links%ROWTYPE;
  v_connection public.staynas_distribution_connections%ROWTYPE;
  v_room_type_id uuid;
  v_listing_type_id uuid;
  v_room_mapping_type_id uuid;
  v_rate_plan_id uuid;
  v_external_listing_id text;
  v_external_room_id text;
  v_external_rate_plan_id text;
  v_provider_status text;
  v_candidate record;
  v_created record;
  v_message text;
  v_link_id uuid;
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role' THEN
    RAISE EXCEPTION 'Reservation materialization is service-only.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_inbox
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id AND i.processing_status='processing'
    AND i.lease_token=_lease_token AND i.lease_owner=_worker_id
    AND i.lease_expires_at>pg_catalog.now()
  FOR UPDATE;

  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'Reservation materialization lease is not current.' USING ERRCODE='42501';
  END IF;
  IF v_inbox.event_type NOT IN ('reservation.created','reservation.confirmed') THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'event_type_not_supported';
    RETURN;
  END IF;
  IF _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR NOT EXISTS (
       SELECT 1 FROM public.staynas_distribution_reservation_payloads p
       WHERE p.inbox_id=v_inbox.id AND p.payload_fingerprint=_payload_fingerprint
     ) THEN
    RAISE EXCEPTION 'Encrypted reservation payload evidence is missing or mismatched.'
      USING ERRCODE='42501';
  END IF;

  IF _external_reservation_id IS NULL OR length(trim(_external_reservation_id)) NOT BETWEEN 1 AND 256
     OR _external_reservation_id IS DISTINCT FROM v_inbox.normalized_event->>'externalReservationId'
     OR _arrival_date IS DISTINCT FROM (v_inbox.normalized_event->>'arrivalDate')::date
     OR _departure_date IS DISTINCT FROM (v_inbox.normalized_event->>'departureDate')::date
     OR _adults IS DISTINCT FROM (v_inbox.normalized_event->>'adults')::integer
     OR _children IS DISTINCT FROM COALESCE((v_inbox.normalized_event->>'children')::integer,0)
     OR _departure_date<=_arrival_date OR _adults<1 OR _children<0
     OR _children_below_6<0 OR _children_7_plus<0
     OR _children_below_6+_children_7_plus<>_children THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'reservation_payload_mismatch';
    RETURN;
  END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2
     OR _guest_email IS NULL
     OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'guest_identity_incomplete';
    RETURN;
  END IF;

  SELECT * INTO v_connection
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id
   AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id
   AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key
   AND g.environment=c.environment
  WHERE c.id=v_inbox.connection_id
    AND c.organisation_id=v_inbox.organisation_id
    AND c.property_id=v_inbox.property_id
    AND c.account_grant_id=v_inbox.account_grant_id
    AND c.external_account_id=v_inbox.external_account_id
    AND c.provider_key=v_inbox.provider_key
    AND c.environment=v_inbox.environment
    AND c.lifecycle='connected'
    AND g.grant_status='active'
    AND 'reservation.import'=ANY(g.granted_capabilities);
  IF v_connection.id IS NULL THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'connection_grant_inactive';
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.staynas_distribution_reservation_links l
  WHERE l.provider_key=v_inbox.provider_key
    AND l.external_account_id=v_inbox.external_account_id
    AND l.external_reservation_id=_external_reservation_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.organisation_id<>v_inbox.organisation_id
       OR v_existing.property_id<>v_inbox.property_id
       OR v_existing.connection_id<>v_inbox.connection_id THEN
      RAISE EXCEPTION 'Provider reservation is already linked in a different tenant/property scope.'
        USING ERRCODE='42501';
    END IF;
    DELETE FROM public.staynas_distribution_reservation_payloads WHERE inbox_id=v_inbox.id;
    RETURN QUERY SELECT 'already_materialized',v_existing.booking_id,false,NULL::text;
    RETURN;
  END IF;

  v_external_listing_id:=v_inbox.normalized_event->>'externalListingId';
  v_external_room_id:=v_inbox.normalized_event->>'externalRoomId';
  v_external_rate_plan_id:=v_inbox.normalized_event->>'externalRatePlanId';
  v_provider_status:=v_inbox.normalized_event->>'providerStatus';

  IF lower(COALESCE(v_provider_status,'')) NOT IN
     ('pending','requested','confirmed','booked','accepted') THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'unknown_provider_state';
    RETURN;
  END IF;

  SELECT m.internal_room_type_id INTO v_listing_type_id
  FROM public.staynas_distribution_listing_mappings m
  WHERE m.organisation_id=v_inbox.organisation_id
    AND m.property_id=v_inbox.property_id
    AND m.connection_id=v_inbox.connection_id
    AND m.external_listing_id=v_external_listing_id
    AND m.mapping_status='active';

  IF v_external_room_id IS NOT NULL THEN
    SELECT m.internal_room_type_id INTO v_room_mapping_type_id
    FROM public.staynas_distribution_room_mappings m
    WHERE m.organisation_id=v_inbox.organisation_id
      AND m.property_id=v_inbox.property_id
      AND m.connection_id=v_inbox.connection_id
      AND m.external_room_id=v_external_room_id
      AND m.mapping_status='active';
  END IF;

  IF v_listing_type_id IS NULL AND v_room_mapping_type_id IS NULL THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'room_mapping_missing';
    RETURN;
  END IF;
  IF v_listing_type_id IS NOT NULL AND v_room_mapping_type_id IS NOT NULL
     AND v_listing_type_id<>v_room_mapping_type_id THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'room_mapping_conflict';
    RETURN;
  END IF;
  v_room_type_id:=COALESCE(v_room_mapping_type_id,v_listing_type_id);

  IF v_external_rate_plan_id IS NOT NULL THEN
    SELECT m.internal_rate_plan_id INTO v_rate_plan_id
    FROM public.staynas_distribution_rate_plan_mappings m
    WHERE m.organisation_id=v_inbox.organisation_id
      AND m.property_id=v_inbox.property_id
      AND m.connection_id=v_inbox.connection_id
      AND m.external_rate_plan_id=v_external_rate_plan_id
      AND m.mapping_status='active';
    IF v_rate_plan_id IS NULL THEN
      RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'rate_plan_mapping_missing';
      RETURN;
    END IF;
  END IF;

  FOR v_candidate IN
    SELECT a.room_id,a.slug,a.pricing_quote
    FROM public.get_staynas_room_availability_priced_with_rate_plan(
      _arrival_date,_departure_date,v_inbox.property_id,_adults,
      _children_below_6,_children_7_plus,v_rate_plan_id
    ) a
    JOIN public.rooms r ON r.id=a.room_id
    WHERE r.property_id=v_inbox.property_id
      AND r.catalogue_type_id=v_room_type_id
      AND a.is_available=true AND a.fits_occupancy=true
    ORDER BY r.slug,r.id
  LOOP
    IF v_candidate.pricing_quote->>'ok'='false' THEN
      RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,
        CASE v_candidate.pricing_quote->>'error_code'
          WHEN 'RATE_PLAN_REQUIRED' THEN 'rate_plan_required'
          WHEN 'NO_ELIGIBLE_RATE_PLAN' THEN 'no_eligible_rate_plan'
          ELSE 'pricing_rejected'
        END;
      RETURN;
    END IF;

    BEGIN
      PERFORM pg_catalog.set_config('staynas.booking_source','channel',true);
      SELECT * INTO v_created
      FROM public.create_booking_for_property_with_rate_plan(
        v_inbox.property_id,v_candidate.slug,_arrival_date,_departure_date,
        _adults,_children,_guest_name,_guest_email,_guest_phone,_country,
        _special_requests,'[]'::jsonb,_children_below_6,_children_7_plus,
        NULL,NULL,'channel',v_rate_plan_id
      );

      IF v_created.booking_id IS NULL THEN
        RAISE EXCEPTION 'Canonical allocator returned no booking identifier.';
      END IF;

      INSERT INTO public.staynas_distribution_reservation_links(
        organisation_id,property_id,connection_id,account_grant_id,
        external_account_id,provider_key,environment,external_reservation_id,
        booking_id,source_inbox_id,source_provider_event_id,provider_status,provider_modified_at
      ) VALUES (
        v_inbox.organisation_id,v_inbox.property_id,v_inbox.connection_id,
        v_inbox.account_grant_id,v_inbox.external_account_id,v_inbox.provider_key,
        v_inbox.environment,_external_reservation_id,v_created.booking_id,
        v_inbox.id,v_inbox.provider_event_id,v_provider_status,
        NULLIF(v_inbox.normalized_event->>'providerModifiedAt','')::timestamptz
      );

      DELETE FROM public.staynas_distribution_reservation_payloads WHERE inbox_id=v_inbox.id;
      RETURN QUERY SELECT 'materialized',v_created.booking_id,true,NULL::text;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_existing
        FROM public.staynas_distribution_reservation_links l
        WHERE l.provider_key=v_inbox.provider_key
          AND l.external_account_id=v_inbox.external_account_id
          AND l.external_reservation_id=_external_reservation_id;
        IF v_existing.id IS NOT NULL
           AND v_existing.organisation_id=v_inbox.organisation_id
           AND v_existing.property_id=v_inbox.property_id
           AND v_existing.connection_id=v_inbox.connection_id THEN
          DELETE FROM public.staynas_distribution_reservation_payloads WHERE inbox_id=v_inbox.id;
          RETURN QUERY SELECT 'already_materialized',v_existing.booking_id,false,NULL::text;
          RETURN;
        END IF;
        RAISE;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
        IF v_message LIKE 'No availability%'
           OR v_message LIKE 'No unallocated inventory%'
           OR v_message LIKE 'Room blocked%'
           OR v_message LIKE 'Inventory changed%' THEN
          CONTINUE;
        END IF;
        RAISE;
    END;
  END LOOP;

  RETURN QUERY SELECT 'retryable_failure',NULL::uuid,false,'inventory_unavailable';
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text)
  TO service_role;

COMMENT ON TABLE public.staynas_distribution_reservation_payloads IS
  'AES-256-GCM encrypted provider reservation payloads; the ordinary webhook inbox stores PII-minimized envelopes only.';
COMMENT ON TABLE public.staynas_distribution_reservation_links IS
  'Idempotent provider reservation to canonical StayNas booking linkage; no provider payment event mutates local payment records.';
COMMENT ON FUNCTION public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text) IS
  'Materializes one provider reservation through the SPE-04 selected-plan quote and DC-03R atomic allocator in one transaction.';

COMMIT;
