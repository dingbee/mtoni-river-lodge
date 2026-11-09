-- Public direct-booking channel binding.
-- Creates an explicit host -> verified property domain -> published sales channel contract.
-- Does not activate Mtoni or publish its channel.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_public_booking_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  domain_id uuid NOT NULL REFERENCES public.staynas_property_domains(id) ON DELETE RESTRICT,
  channel_code text NOT NULL CHECK (channel_code IN ('direct_web','campaign_web')),
  display_name text NOT NULL,
  route_path text NOT NULL CHECK (route_path LIKE '/%'),
  transaction_currency text NOT NULL CHECK (transaction_currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,channel_code),
  UNIQUE(domain_id,route_path),
  UNIQUE(id,property_id)
);

DO $domain_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_property_domains_id_property_uidx') THEN
    ALTER TABLE public.staynas_property_domains
      ADD CONSTRAINT staynas_property_domains_id_property_uidx UNIQUE(id,property_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_public_booking_channels_domain_property_fk') THEN
    ALTER TABLE public.staynas_public_booking_channels
      ADD CONSTRAINT staynas_public_booking_channels_domain_property_fk
      FOREIGN KEY (domain_id,property_id)
      REFERENCES public.staynas_property_domains(id,property_id)
      ON DELETE RESTRICT;
  END IF;
END;
$domain_constraints$;

ALTER TABLE public.staynas_public_booking_channels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staynas_public_booking_channels FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.staynas_public_booking_channels TO service_role;

ALTER TABLE public.staynas_reservation_quotes
  ADD COLUMN IF NOT EXISTS sales_channel_id uuid;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS sales_channel_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_reservation_quotes_channel_property_fk') THEN
    ALTER TABLE public.staynas_reservation_quotes
      ADD CONSTRAINT staynas_reservation_quotes_channel_property_fk
      FOREIGN KEY (sales_channel_id,property_id)
      REFERENCES public.staynas_public_booking_channels(id,property_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bookings_channel_property_fk') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_channel_property_fk
      FOREIGN KEY (sales_channel_id,property_id)
      REFERENCES public.staynas_public_booking_channels(id,property_id)
      ON DELETE RESTRICT;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS staynas_public_booking_channels_domain_status_idx
  ON public.staynas_public_booking_channels(domain_id,status,route_path);

-- Prepare the Mtoni direct-web channel as draft only. It cannot resolve publicly
-- until the property domain is verified, the property is active and the founder
-- explicitly publishes the channel after UAT.
INSERT INTO public.staynas_public_booking_channels(
  property_id,domain_id,channel_code,display_name,route_path,transaction_currency,status
)
SELECT p.id,d.id,'direct_web','Mtoni official direct booking','/book','USD','draft'
FROM public.staynas_properties p
JOIN public.staynas_property_domains d ON d.property_id=p.id
WHERE p.slug='mtoni-river-lodge' AND d.hostname='mtoniriverlodge.com'
ON CONFLICT(property_id,channel_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.staynas_create_public_channel_quote(
  _sales_channel_id uuid,
  _room_slug text,
  _check_in date,
  _check_out date,
  _adults integer,
  _children_below_6 integer,
  _children_7_plus integer,
  _extras jsonb,
  _rate_plan_id uuid,
  _promo_code text,
  _guest_email text,
  _ttl_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_channel public.staynas_public_booking_channels%ROWTYPE;
  v_quote jsonb;
  v_quote_id uuid;
  v_currency text;
BEGIN
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Public channel quote creation is server-only';
  END IF;
  SELECT * INTO v_channel
  FROM public.staynas_public_booking_channels
  WHERE id=_sales_channel_id AND status='published'
  FOR SHARE;
  IF NOT FOUND OR v_channel.channel_code<>'direct_web' OR v_channel.route_path<>'/book' THEN
    RETURN jsonb_build_object('ok',false,'error_code','CHANNEL_UNAVAILABLE','message','The direct booking channel is not published');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_property_domains d
    JOIN public.staynas_properties p ON p.id=d.property_id
    WHERE d.id=v_channel.domain_id AND d.property_id=v_channel.property_id
      AND d.verification_status='verified' AND d.verified_at IS NOT NULL
      AND p.status='active'
  ) THEN
    RETURN jsonb_build_object('ok',false,'error_code','PUBLICATION_CONTEXT_INVALID','message','The property or domain is not publicly bookable');
  END IF;

  v_quote:=public.staynas_create_reservation_quote(
    v_channel.property_id,_room_slug,_check_in,_check_out,_adults,
    _children_below_6,_children_7_plus,coalesce(_extras,'[]'::jsonb),
    _rate_plan_id,_promo_code,_guest_email,_ttl_seconds
  );
  IF coalesce(v_quote->>'ok','true')='false' OR v_quote->>'quote_id' IS NULL THEN
    RETURN v_quote;
  END IF;
  v_quote_id:=(v_quote->>'quote_id')::uuid;
  v_currency:=upper(coalesce(v_quote->>'currency',''));
  IF v_currency<>v_channel.transaction_currency THEN
    DELETE FROM public.staynas_reservation_quotes
    WHERE id=v_quote_id AND property_id=v_channel.property_id;
    RETURN jsonb_build_object('ok',false,'error_code','CHANNEL_CURRENCY_MISMATCH','message','The selected direct-booking price is not published in this channel currency');
  END IF;

  UPDATE public.staynas_reservation_quotes
  SET sales_channel_id=_sales_channel_id,
      request=request || jsonb_build_object('sales_channel_id',_sales_channel_id,'sales_channel_code',v_channel.channel_code),
      quote_snapshot=quote_snapshot || jsonb_build_object('sales_channel_id',_sales_channel_id,'sales_channel_code',v_channel.channel_code,'transaction_currency',v_channel.transaction_currency)
  WHERE id=v_quote_id AND property_id=v_channel.property_id;
  RETURN v_quote || jsonb_build_object('sales_channel_id',_sales_channel_id,'sales_channel_code',v_channel.channel_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_create_public_channel_reservation(
  _sales_channel_id uuid,
  _quote_id uuid,
  _idempotency_key text,
  _guest_name text,
  _guest_email text,
  _guest_phone text,
  _country text,
  _special_requests text,
  _payment_method text,
  _source text,
  _hold_id uuid,
  _session_id text,
  _target_status text,
  _actor_id uuid,
  _visit_purpose text,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_channel public.staynas_public_booking_channels%ROWTYPE;
  v_quote public.staynas_reservation_quotes%ROWTYPE;
  v_result jsonb;
  v_booking_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Public channel reservation creation is server-only';
  END IF;
  SELECT * INTO v_channel
  FROM public.staynas_public_booking_channels
  WHERE id=_sales_channel_id AND status='published'
  FOR SHARE;
  IF NOT FOUND OR v_channel.channel_code<>'direct_web' OR v_channel.route_path<>'/book' THEN
    RETURN jsonb_build_object('ok',false,'error_code','CHANNEL_UNAVAILABLE','message','The direct booking channel is not published');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_property_domains d
    JOIN public.staynas_properties p ON p.id=d.property_id
    WHERE d.id=v_channel.domain_id AND d.property_id=v_channel.property_id
      AND d.verification_status='verified' AND d.verified_at IS NOT NULL
      AND p.status='active'
  ) THEN
    RETURN jsonb_build_object('ok',false,'error_code','PUBLICATION_CONTEXT_INVALID','message','The property or domain is not publicly bookable');
  END IF;
  SELECT * INTO v_quote FROM public.staynas_reservation_quotes
  WHERE id=_quote_id AND property_id=v_channel.property_id
  FOR UPDATE;
  IF NOT FOUND OR v_quote.sales_channel_id IS DISTINCT FROM _sales_channel_id THEN
    RETURN jsonb_build_object('ok',false,'error_code','QUOTE_CHANNEL_MISMATCH','message','The quote does not belong to this booking channel');
  END IF;
  IF upper(coalesce(v_quote.quote_snapshot->>'currency',''))<>v_channel.transaction_currency THEN
    RETURN jsonb_build_object('ok',false,'error_code','CHANNEL_CURRENCY_MISMATCH','message','The quote currency does not match the booking channel');
  END IF;

  v_result:=public.staynas_create_reservation_from_quote(
    _quote_id,v_channel.property_id,_idempotency_key,_guest_name,_guest_email,
    _guest_phone,_country,_special_requests,_payment_method,_source,_hold_id,
    _session_id,_target_status,_actor_id,_visit_purpose,_notes
  );
  IF coalesce(v_result->>'ok','false')<>'true' THEN RETURN v_result; END IF;
  v_booking_id:=nullif(v_result->>'booking_id','')::uuid;
  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Canonical reservation returned no booking id';
  END IF;

  UPDATE public.bookings
  SET sales_channel_id=_sales_channel_id,
      pricing_snapshot=coalesce(pricing_snapshot,'{}'::jsonb) || jsonb_build_object(
        'sales_channel_id',_sales_channel_id,
        'sales_channel_code',v_channel.channel_code,
        'transaction_currency',v_channel.transaction_currency
      )
  WHERE id=v_booking_id AND property_id=v_channel.property_id
    AND (sales_channel_id IS NULL OR sales_channel_id=_sales_channel_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Booking channel attribution conflicts with the existing reservation';
  END IF;
  RETURN v_result || jsonb_build_object('sales_channel_id',_sales_channel_id,'sales_channel_code',v_channel.channel_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)
  TO service_role;

COMMIT;
