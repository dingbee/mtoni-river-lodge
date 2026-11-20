-- Part 4 of 4 for manual application in the Supabase SQL editor (phone-clipboard sized).
-- Identical statements to supabase/migrations/20261120120000_staynas_currency_integrity.sql.
-- Run parts 1-4 in order; each part is atomic and safe to re-run.
BEGIN;
-- 6. Bookings persist the priced quote currency.
CREATE OR REPLACE FUNCTION public.create_booking_for_property(_property_id uuid, _room_slug text, _check_in date, _check_out date, _adults integer, _children integer, _guest_name text, _guest_email text, _guest_phone text, _country text, _special_requests text, _extras jsonb DEFAULT '[]'::jsonb, _children_below_6 integer DEFAULT NULL::integer, _children_7_plus integer DEFAULT NULL::integer, _hold_id uuid DEFAULT NULL::uuid, _session_id text DEFAULT NULL::text, _payment_method text DEFAULT 'online'::text)
 RETURNS TABLE(booking_id uuid, reference text, total numeric, currency text, taxes numeric, tax_addition numeric, tax_breakdown jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_below6 integer := COALESCE(_children_below_6,0);
  v_plus7 integer := COALESCE(_children_7_plus,GREATEST(0,COALESCE(_children,0)));
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
  v_payment_method text := COALESCE(_payment_method,'online');
  v_fee_total numeric := 0;
  v_discount_total numeric := 0;
  v_promotion jsonb;
  v_promotions jsonb := '[]'::jsonb;
  v_promo_line jsonb;
  v_redemption jsonb;
  v_guest_key text;
  v_currency text;
  v_property_currency text;
BEGIN
  IF _property_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active'
  ) THEN RAISE EXCEPTION 'Property not found or inactive'; END IF;
  IF _check_out<=_check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _adults IS NULL OR _adults<1 THEN RAISE EXCEPTION 'At least one adult required'; END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2 THEN RAISE EXCEPTION 'Guest name required'; END IF;
  IF _guest_email IS NULL OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN RAISE EXCEPTION 'Valid email required'; END IF;
  IF v_payment_method NOT IN ('online','pay_at_property') THEN RAISE EXCEPTION 'Unsupported booking payment method'; END IF;

  SELECT * INTO v_room FROM public.rooms r
  WHERE r.slug=_room_slug AND r.status='active' AND r.property_id=_property_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found for property'; END IF;

  v_children_total := v_below6 + v_plus7;
  IF _children IS NOT NULL AND _children <> v_children_total THEN
    RAISE EXCEPTION 'Child counts do not match the supplied occupancy';
  END IF;
  v_nights := _check_out - _check_in;
  IF _hold_id IS NOT NULL THEN
    SELECT h.* INTO v_hold FROM public.booking_holds h
    JOIN public.rooms r ON r.id=h.room_id
    WHERE h.id=_hold_id AND r.property_id=_property_id
    FOR UPDATE OF h;
    IF NOT FOUND OR v_hold.status<>'active' OR v_hold.expires_at<=now() THEN
      RAISE EXCEPTION 'Booking hold invalid for property';
    END IF;
    IF v_hold.room_id<>v_room.id OR v_hold.check_in<>_check_in OR v_hold.check_out<>_check_out THEN
      RAISE EXCEPTION 'Hold does not match booking';
    END IF;
    IF _session_id IS NULL OR v_hold.session_id<>_session_id THEN RAISE EXCEPTION 'Hold session mismatch'; END IF;
  END IF;

  -- Lock the rows that determine the quote before resolving it. The final
  -- quote, nightly snapshot and inventory decrement therefore share one
  -- transactionally consistent pricing/inventory view.
  v_day := _check_in;
  WHILE v_day < _check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(v_room.id,v_day,v_room.total_units)
    ON CONFLICT(room_id,date) DO NOTHING;
    PERFORM 1 FROM public.room_inventory i
    WHERE i.room_id=v_room.id AND i.date=v_day FOR UPDATE;
    v_day := v_day + 1;
  END LOOP;

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
      SELECT item.value->>'slug' FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) AS item(value)
    )
  FOR SHARE;

  v_guest_key := md5(lower(trim(_guest_email)));
  PERFORM set_config('staynas.guest_key',v_guest_key,true);
  v_quote := public.calculate_staynas_booking_quote(
    _property_id,v_room.id,_check_in,_check_out,_adults,v_below6,v_plus7,_extras
  );
  IF v_quote->>'ok'='false' THEN
    RAISE EXCEPTION 'StayNas pricing rejected [%]: %',v_quote->>'error_code',v_quote->>'message';
  END IF;
  -- The reservation is denominated in the canonical quote currency, which the quote
  -- service has already validated against the property currency. rooms.currency is
  -- legacy configuration and is never used to label persisted money.
  SELECT upper(p.currency) INTO v_property_currency FROM public.staynas_properties p WHERE p.id=_property_id;
  v_currency := upper(NULLIF(v_quote->>'currency',''));
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' OR v_currency IS DISTINCT FROM v_property_currency THEN
    RAISE EXCEPTION 'StayNas pricing rejected [CURRENCY_MISMATCH]: quote currency % does not match property currency %',
      COALESCE(v_currency,'(none)'),COALESCE(v_property_currency,'(none)');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_quote->'nightly','[]'::jsonb)) n
             WHERE n.value ? 'currency' AND upper(n.value->>'currency') IS DISTINCT FROM v_currency) THEN
    RAISE EXCEPTION 'StayNas pricing rejected [CURRENCY_MISMATCH]: nightly rate currency differs from quote currency %',v_currency;
  END IF;
  v_subtotal := (v_quote->>'accommodation_subtotal')::numeric;
  v_extras_total := (v_quote->>'extras_total')::numeric;
  v_taxes := (v_quote->>'taxes')::numeric;
  v_tax_addition := (v_quote->>'tax_addition')::numeric;
  v_tax_breakdown := COALESCE(v_quote->'tax_breakdown','[]'::jsonb);
  v_fee_total := COALESCE((v_quote->>'fee_total')::numeric,0);
  v_discount_total := COALESCE((v_quote->>'discount_total')::numeric,0);
  v_promotion := v_quote->'promotion';
  v_promotions := COALESCE(v_quote->'promotions','[]'::jsonb);
  v_total := (v_quote->>'total')::numeric;
  v_deposit := CASE WHEN v_payment_method='pay_at_property' THEN 0 ELSE round(v_total/2,2) END;
  v_balance := v_total-v_deposit;
  v_reference := upper(substr(md5(random()::text||clock_timestamp()::text),1,10)) || '-' || to_char(now(),'YYMMDD');

  INSERT INTO public.bookings(
    reference,room_id,property_id,check_in,check_out,nights,adults,children,
    children_below_6,children_7_plus,guest_name,guest_email,guest_phone,country,
    special_requests,currency,source,payment_method,payment_provider,
    subtotal,extras_total,fee_total,discount_total,taxes,tax_addition,tax_breakdown,total,deposit_amount,balance_amount,balance_due,
    pricing_snapshot
  )
  VALUES(
    v_reference,v_room.id,_property_id,_check_in,_check_out,v_nights,_adults,v_children_total,
    v_below6,v_plus7,trim(_guest_name),lower(trim(_guest_email)),_guest_phone,_country,
    _special_requests,v_currency,'website',
    CASE WHEN v_payment_method='pay_at_property' THEN 'pay_at_property' ELSE NULL END,
    CASE WHEN v_payment_method='pay_at_property' THEN 'manual' ELSE 'pesapal' END,
    v_subtotal,v_extras_total,v_fee_total,v_discount_total,v_taxes,v_tax_addition,v_tax_breakdown,v_total,v_deposit,v_balance,v_balance,
    v_quote
  )
  RETURNING id INTO v_booking_id;

  FOR v_night IN SELECT value FROM jsonb_array_elements(v_quote->'nightly')
  LOOP
    v_day := (v_night->>'date')::date;
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(v_room.id,v_day,v_room.total_units)
    ON CONFLICT(room_id,date) DO NOTHING;
    SELECT i.available_units,i.is_blocked,
      (SELECT count(*)::integer FROM public.booking_holds h
       WHERE h.room_id=v_room.id AND h.status='active' AND h.expires_at>now()
         AND h.check_in<=v_day AND h.check_out>v_day
         AND (_hold_id IS NULL OR h.id<>_hold_id))
    INTO v_units,v_blocked,v_other_holds
    FROM public.room_inventory i WHERE i.room_id=v_room.id AND i.date=v_day FOR UPDATE;
    IF v_blocked THEN RAISE EXCEPTION 'Room blocked on %',v_day; END IF;
    IF v_units-COALESCE(v_other_holds,0)<=0 THEN
      RAISE EXCEPTION 'No availability on %',v_day;
    END IF;
    UPDATE public.room_inventory SET available_units=GREATEST(available_units-1,0)
    WHERE room_id=v_room.id AND date=v_day;
    -- Nightly snapshots retain the nightly accommodation evidence only.
    -- Booking-level fees, discounts, promotions and taxes live in the immutable
    -- bookings.pricing_snapshot and are not duplicated on every night.
    INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate,pricing_snapshot)
    VALUES(v_booking_id,v_room.id,v_day,(v_night->>'nightly_rate')::numeric,v_night);
  END LOOP;

  FOR v_extra_line IN SELECT value FROM jsonb_array_elements(v_quote->'extras')
  LOOP
    SELECT * INTO v_extra FROM public.extras e
    WHERE e.slug=v_extra_line->>'slug' AND e.active=true AND e.property_id=_property_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Extra became unavailable during booking'; END IF;
    INSERT INTO public.booking_extras(booking_id,extra_id,quantity,unit_price,line_total)
    VALUES(v_booking_id,v_extra.id,(v_extra_line->>'quantity')::integer,
      (v_extra_line->>'unit_price')::numeric,(v_extra_line->>'line_total')::numeric);
  END LOOP;

  FOR v_promo_line IN SELECT value FROM jsonb_array_elements(v_promotions)
  LOOP
    v_redemption := public.redeem_staynas_promotion(
      _property_id,(v_promo_line->>'id')::uuid,v_booking_id,v_guest_key,
      (v_promo_line->>'discount_amount')::numeric,v_currency
    );
    IF COALESCE((v_redemption->>'ok')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Promotion redemption rejected [%]',COALESCE(v_redemption->>'error_code','REDEMPTION_FAILED');
    END IF;
  END LOOP;

  IF _hold_id IS NOT NULL THEN
    UPDATE public.booking_holds SET status='converted',converted_booking_id=v_booking_id,updated_at=now()
    WHERE id=_hold_id;
  END IF;
  PERFORM public.log_calendar_event(
    'reservation.created',v_room.id,v_booking_id,_hold_id,_check_in,_check_out,
    jsonb_build_object('property_id',_property_id,'reference',v_reference,'total',v_total,'currency',v_currency)
  );
  RETURN QUERY SELECT v_booking_id,v_reference,v_total,v_currency,v_taxes,v_tax_addition,v_tax_breakdown;
END;
$function$;

-- 7. Legacy create_booking overloads price from rooms.base_price/rooms.currency outside the
-- canonical quote service. They are not used by the application; remove browser access.
DO $legacy$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb)',
    'public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer)',
    'public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END IF;
  END LOOP;
END
$legacy$;

-- 8. Read-only currency reconciliation report. Classifies configuration and history that
-- disagrees with the authoritative property currency. It never guesses an original
-- currency and never modifies a record; remediation is an explicit operator decision.
CREATE OR REPLACE FUNCTION public.staynas_currency_integrity_findings(_property_id uuid)
RETURNS TABLE(
  entity text, entity_id uuid, reference text, recorded_currency text,
  expected_currency text, amount numeric, finding text, severity text, remediation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $report$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),
                          NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role', auth.role());
  v_currency text;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' AND (
       v_uid IS NULL
    OR NOT public.staynas_user_has_property_access(v_uid,_property_id)
    OR NOT public.has_any_role(v_uid,ARRAY['owner','manager','admin','finance']::public.app_role[])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Currency reconciliation requires property owner, manager or finance access';
  END IF;
  SELECT upper(p.currency) INTO v_currency FROM public.staynas_properties p WHERE p.id=_property_id;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Property not found';
  END IF;

  RETURN QUERY
  SELECT 'rate_plan', rp.id, rp.code, upper(rp.currency), v_currency, NULL::numeric,
         'Rate plan is priced in a currency other than the property currency',
         CASE WHEN rp.publication_status='published' AND rp.active THEN 'blocking' ELSE 'warning' END,
         'Suspend the plan, re-enter every rate in the property currency, then republish'
  FROM public.staynas_rate_plans rp
  WHERE rp.property_id=_property_id AND rp.archived_at IS NULL
    AND rp.publication_status<>'archived' AND upper(rp.currency)<>v_currency
  UNION ALL
  SELECT 'rate_override', o.id, o.scope, upper(o.currency), v_currency, o.nightly_rate,
         'Approved rate override is denominated in another currency', 'blocking',
         'Revoke the override and approve a replacement in the property currency'
  FROM public.staynas_rate_overrides o
  WHERE o.property_id=_property_id AND o.status='approved' AND upper(o.currency)<>v_currency
  UNION ALL
  SELECT 'room_legacy_rate', r.id, r.slug, upper(r.currency), v_currency, r.base_price,
         'Legacy room base price is denominated in another currency and is not displayed or sold',
         'warning', 'Re-enter the indicative room rate in the property currency'
  FROM public.rooms r
  WHERE r.property_id=_property_id AND r.status='active' AND upper(r.currency)<>v_currency
  UNION ALL
  SELECT 'extra', e.id, e.slug, upper(e.currency), v_currency, e.price,
         'Active extra is priced in another currency and is rejected by quotes', 'blocking',
         'Re-price the extra in the property currency'
  FROM public.extras e
  WHERE e.property_id=_property_id AND e.active AND e.currency IS NOT NULL AND upper(e.currency)<>v_currency
  UNION ALL
  SELECT 'fee_rule', f.id, f.code, upper(f.currency), v_currency, f.amount,
         'Active fee rule is denominated in another currency', 'blocking',
         'Re-enter the fee in the property currency'
  FROM public.staynas_property_fee_rules f
  WHERE f.property_id=_property_id AND f.active AND f.currency IS NOT NULL AND upper(f.currency)<>v_currency
  UNION ALL
  SELECT 'tax_rule', t.id, t.tax_code, upper(t.currency), v_currency, t.rate,
         'Active tax rule is denominated in another currency', 'blocking',
         'Re-enter the fixed tax amount in the property currency'
  FROM public.staynas_property_tax_rules t
  WHERE t.property_id=_property_id AND t.active AND t.currency IS NOT NULL AND upper(t.currency)<>v_currency
  UNION ALL
  SELECT 'promotion', pr.id, pr.code, upper(pr.currency), v_currency, pr.discount_value,
         'Promotion is restricted to another currency and will not apply', 'warning',
         'Recreate the promotion for the property currency'
  FROM public.staynas_property_promotions pr
  WHERE pr.property_id=_property_id AND pr.status NOT IN ('archived','expired','cancelled')
    AND pr.currency IS NOT NULL AND upper(pr.currency)<>v_currency
  UNION ALL
  SELECT 'public_booking_channel', c.id, c.channel_code, upper(c.transaction_currency), v_currency, NULL::numeric,
         'Published booking channel transaction currency differs from the property currency', 'blocking',
         'Align the channel transaction currency with the property currency'
  FROM public.staynas_public_booking_channels c
  WHERE c.property_id=_property_id AND c.status='published' AND upper(c.transaction_currency)<>v_currency
  UNION ALL
  -- Historical records: classified only. A reservation's own currency is never changed.
  SELECT 'booking', b.id, b.reference, upper(b.currency), upper(b.pricing_snapshot->>'currency'), b.total,
         'Booking currency label differs from the currency of its immutable pricing snapshot',
         'reconcile', 'Finance review: confirm the agreed transaction currency before any correction'
  FROM public.bookings b
  WHERE b.property_id=_property_id
    AND NULLIF(b.pricing_snapshot->>'currency','') IS NOT NULL
    AND upper(b.pricing_snapshot->>'currency')<>upper(b.currency)
  UNION ALL
  SELECT 'folio_posting', fp.id, fp.posting_reference, upper(fp.currency), upper(b.currency), fp.amount,
         'Folio posting currency differs from its reservation currency', 'reconcile',
         'Finance review: reverse and repost in the reservation currency'
  FROM public.pms_folio_postings fp JOIN public.bookings b ON b.id=fp.booking_id
  WHERE b.property_id=_property_id AND upper(fp.currency)<>upper(b.currency)
  UNION ALL
  SELECT 'folio_adjustment', fa.id, fa.adjustment_reference, upper(fa.currency), upper(b.currency), fa.amount,
         'Folio adjustment currency differs from its reservation currency', 'reconcile',
         'Finance review'
  FROM public.pms_folio_adjustments fa JOIN public.bookings b ON b.id=fa.booking_id
  WHERE b.property_id=_property_id AND upper(fa.currency)<>upper(b.currency)
  UNION ALL
  SELECT 'payment_event', pe.id, pe.merchant_reference, upper(pe.currency), upper(b.currency), pe.amount,
         CASE WHEN pe.currency IS NULL THEN 'Payment event amount has no recorded currency'
              ELSE 'Payment event currency differs from its reservation currency' END,
         'reconcile', 'Finance review against the provider statement; do not infer a currency'
  FROM public.payment_events pe JOIN public.bookings b ON b.id=pe.booking_id
  WHERE b.property_id=_property_id AND pe.amount IS NOT NULL
    AND (pe.currency IS NULL OR upper(pe.currency)<>upper(b.currency));
END;
$report$;

REVOKE ALL ON FUNCTION public.staynas_currency_integrity_findings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_currency_integrity_findings(uuid) TO authenticated, service_role;

COMMIT;
select 'currency integrity part 4 of 4 applied' as status;
