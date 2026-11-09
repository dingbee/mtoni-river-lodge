-- Separate property operating currency from transaction-price currency.
-- Existing historical room/booking/extras currency values are preserved.
BEGIN;

ALTER TABLE public.staynas_properties
  ALTER COLUMN currency DROP DEFAULT,
  ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.rooms
  ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.bookings
  ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.extras
  ALTER COLUMN currency DROP DEFAULT;

-- Existing StayNas properties in Tanzania use TZS as their operating/reporting
-- currency. Their existing USD room prices and published USD plans are retained.
UPDATE public.staynas_properties
SET currency = 'TZS'
WHERE slug IN ('mtoni-river-lodge','nolmark-cdma-staynas','staynas-demo-property')
  AND upper(currency) = 'USD';

DO $currency_resolver$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
BEGIN
  v_signature:=to_regprocedure('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'SPE published room pricing resolver is missing';
  END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=v_definition;

  v_old:=$old$  IF upper(COALESCE(v_room.currency,''))<>v_property_currency THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Room currency does not match property currency');
  END IF;
$old$;
  v_updated:=replace(v_updated,v_old,'');

  v_old:=$old$      'pricing',public.calculate_staynas_room_pricing(
$old$;
  v_new:=$new$      'pricing',public.calculate_staynas_room_pricing_legacy(
$new$;
  v_updated:=replace(v_updated,v_old,v_new);

  v_old:=$old$  IF upper(v_plan.currency)<>v_property_currency
     OR upper(v_publication.currency)<>v_property_currency THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Published plan currency does not match property currency');
  END IF;
$old$;
  v_new:=$new$  IF upper(v_plan.currency) !~ '^[A-Z]{3}$'
     OR upper(v_publication.currency) IS DISTINCT FROM upper(v_plan.currency) THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','Published plan and publication currencies do not match');
  END IF;
$new$;
  v_updated:=replace(v_updated,v_old,v_new);

  v_old:=$old$    IF v_rate->>'currency' IS DISTINCT FROM v_property_currency THEN
$old$;
  v_new:=$new$    IF upper(v_rate->>'currency') IS DISTINCT FROM upper(v_plan.currency) THEN
$new$;
  v_updated:=replace(v_updated,v_old,v_new);

  v_updated:=replace(v_updated,'''currency'',v_property_currency','''currency'',upper(v_plan.currency)');

  IF v_updated=v_definition THEN
    RAISE EXCEPTION 'No currency resolver changes were applied';
  END IF;
  IF position('calculate_staynas_room_pricing_legacy' in v_updated)=0
     OR position('upper(v_plan.currency)' in v_updated)=0
     OR position('Room currency does not match property currency' in v_updated)>0 THEN
    RAISE EXCEPTION 'Published pricing resolver currency contract did not update completely';
  END IF;
  EXECUTE v_updated;
END;
$currency_resolver$;

DO $legacy_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
BEGIN
  v_signature:=to_regprocedure('public.calculate_staynas_room_pricing_legacy(uuid,uuid,date,date,integer,integer,integer)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Legacy room pricing calculator is missing';
  END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=v_definition;

  v_old:=$old$  IF upper(COALESCE(v_room.currency,'')) <> v_property_currency THEN
    RAISE EXCEPTION 'Room currency % does not match property currency %', v_room.currency, v_property_currency;
  END IF;
$old$;
  v_updated:=replace(v_updated,v_old,'');

  v_old:=$old$  v_occupants := _adults + v_children;
$old$;
  v_new:=$new$  IF upper(COALESCE(v_room.currency,'')) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Room transaction currency must be explicitly configured';
  END IF;

  v_occupants := _adults + v_children;
$new$;
  v_updated:=replace(v_updated,v_old,v_new);

  v_updated:=replace(v_updated,'''currency'',v_property_currency','''currency'',upper(v_room.currency)');

  IF v_updated=v_definition
     OR position('Room currency % does not match property currency %' in v_updated)>0
     OR position('upper(v_room.currency)' in v_updated)=0
     OR position('Room transaction currency must be explicitly configured' in v_updated)=0 THEN
    RAISE EXCEPTION 'Legacy pricing currency contract did not update completely';
  END IF;
  EXECUTE v_updated;
END;
$legacy_currency$;

DO $room_override_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature:=to_regprocedure('public.apply_staynas_room_date_rate_override(uuid,uuid,date,numeric,text)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Room/date override function is missing';
  END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=replace(
    v_definition,
    'SELECT upper(currency) INTO v_currency FROM public.staynas_properties WHERE id=_property_id;',
    'SELECT upper(currency) INTO v_currency FROM public.rooms WHERE id=_room_id AND property_id=_property_id;'
  );
  IF v_updated=v_definition
     OR position('FROM public.rooms WHERE id=_room_id AND property_id=_property_id' in v_updated)=0 THEN
    RAISE EXCEPTION 'Room/date override currency source did not migrate to the room transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$room_override_currency$;

DO $rate_override_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
BEGIN
  v_signature:=to_regprocedure('public.validate_staynas_rate_override()');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Rate override validation trigger is missing';
  END IF;
  -- Normalize indentation before matching. pg_get_functiondef preserves the
  -- original source indentation, which differs between migration fixtures and
  -- deployed functions.
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=regexp_replace(v_definition,E'(?m)^[ \t]+','','g');
  v_updated:=replace(v_updated,'v_currency text;','v_currency text;'||E'\n  v_currency_count integer;');

  v_old:=$old$SELECT upper(currency) INTO v_currency
FROM public.staynas_properties WHERE id=NEW.property_id;
IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
RAISE EXCEPTION 'Rate override property must have an explicit currency';
END IF;
IF upper(NEW.currency) <> v_currency THEN
RAISE EXCEPTION 'Rate override currency must match property currency %',v_currency;
END IF;
NEW.currency := v_currency;$old$;
  v_new:=$new$IF NEW.rate_plan_id IS NOT NULL THEN
SELECT upper(currency) INTO v_currency
FROM public.staynas_rate_plans
WHERE id=NEW.rate_plan_id AND property_id=NEW.property_id;
ELSIF NEW.room_id IS NOT NULL THEN
SELECT upper(currency) INTO v_currency
FROM public.rooms
WHERE id=NEW.room_id AND property_id=NEW.property_id;
ELSIF NEW.room_type_id IS NOT NULL THEN
SELECT min(upper(currency)),count(DISTINCT upper(currency))
INTO v_currency,v_currency_count
FROM public.rooms
WHERE property_id=NEW.property_id AND catalogue_type_id=NEW.room_type_id AND status='active';
IF COALESCE(v_currency_count,0)<>1 THEN
RAISE EXCEPTION 'A room-type override requires one consistent room transaction currency';
END IF;
ELSE
RAISE EXCEPTION 'Rate override requires an explicit room or rate-plan pricing source';
END IF;
IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
RAISE EXCEPTION 'Rate override pricing source must have an explicit transaction currency';
END IF;
IF upper(NEW.currency) <> v_currency THEN
RAISE EXCEPTION 'Rate override currency must match the selected pricing source currency %',v_currency;
END IF;
NEW.currency := v_currency;$new$;
  v_updated:=replace(v_updated,v_old,v_new);
  IF position('FROM public.staynas_rate_plans' in v_updated)=0
     OR position('FROM public.rooms' in v_updated)=0
     OR position('Rate override currency must match property currency' in v_updated)>0 THEN
    RAISE EXCEPTION 'Rate override validation did not migrate to pricing-source transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$rate_override_currency$;

DO $daily_rate_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature:=to_regprocedure('public.validate_staynas_rate_plan_daily_rates()');
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Daily rate-plan validator is missing'; END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=replace(
    v_definition,
    $old$  SELECT upper(currency), timezone
    INTO v_currency, v_seasons_timezone
  FROM public.staynas_properties
  WHERE id = NEW.property_id;$old$,
    $new$  v_currency := upper(NEW.currency);
  SELECT timezone INTO v_seasons_timezone
  FROM public.staynas_properties
  WHERE id = NEW.property_id;$new$
  );
  v_updated:=replace(v_updated,'Daily pricing requires an explicit property currency','Daily pricing requires an explicit rate-plan transaction currency');
  IF v_updated=v_definition OR position('upper(NEW.currency)' in v_updated)=0
     OR position('Daily pricing requires an explicit rate-plan transaction currency' in v_updated)=0 THEN
    RAISE EXCEPTION 'Daily rate-plan validation did not migrate to transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$daily_rate_currency$;

DO $seasonal_rate_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature:=to_regprocedure('public.validate_staynas_rate_plan_seasonal_rates()');
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Seasonal rate-plan validator is missing'; END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=replace(
    v_definition,
    $old$  SELECT upper(currency), timezone
    INTO v_currency, v_timezone
  FROM public.staynas_properties
  WHERE id = NEW.property_id;$old$,
    $new$  v_currency := upper(NEW.currency);
  SELECT timezone INTO v_timezone
  FROM public.staynas_properties
  WHERE id = NEW.property_id;$new$
  );
  v_updated:=replace(v_updated,'Seasonal pricing requires an explicit property currency','Seasonal pricing requires an explicit rate-plan transaction currency');
  IF v_updated=v_definition OR position('upper(NEW.currency)' in v_updated)=0
     OR position('Seasonal pricing requires an explicit rate-plan transaction currency' in v_updated)=0 THEN
    RAISE EXCEPTION 'Seasonal rate-plan validation did not migrate to transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$seasonal_rate_currency$;

DO $base_occupancy_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature:=to_regprocedure('public.validate_staynas_rate_plan_base_and_occupancy_data()');
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Rate-plan base and occupancy validator is missing'; END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=replace(
    v_definition,
    $old$  SELECT upper(p.currency)
    INTO v_currency
  FROM public.staynas_properties p
  WHERE p.id=NEW.property_id AND p.status='active';$old$,
    $new$  SELECT upper(NEW.currency)
    INTO v_currency
  FROM public.staynas_properties p
  WHERE p.id=NEW.property_id AND p.status='active';$new$
  );
  v_updated:=replace(v_updated,'Rate-plan property must have an explicit valid currency','Rate plan must have an explicit valid transaction currency');
  v_updated:=replace(v_updated,'Base rate and rate-plan currency must match the property currency','Base rate and rate-plan currency must match the selected rate-plan currency');
  v_updated:=replace(v_updated,'Occupancy rate currency must match the property currency','Occupancy rate currency must match the selected rate-plan currency');
  IF v_updated=v_definition OR position('SELECT upper(NEW.currency)' in v_updated)=0
     OR position('match the selected rate-plan currency' in v_updated)=0 THEN
    RAISE EXCEPTION 'Rate-plan base and occupancy validation did not migrate to transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$base_occupancy_currency$;

ALTER TABLE public.staynas_property_tax_rules
  ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.staynas_property_fee_rules
  ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.staynas_property_promotions
  ALTER COLUMN currency SET NOT NULL;

DO $adjustment_currency_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_property_tax_rules_currency_iso_check') THEN
    ALTER TABLE public.staynas_property_tax_rules
      ADD CONSTRAINT staynas_property_tax_rules_currency_iso_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_property_fee_rules_currency_iso_check') THEN
    ALTER TABLE public.staynas_property_fee_rules
      ADD CONSTRAINT staynas_property_fee_rules_currency_iso_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staynas_property_promotions_currency_iso_check') THEN
    ALTER TABLE public.staynas_property_promotions
      ADD CONSTRAINT staynas_property_promotions_currency_iso_check CHECK (currency ~ '^[A-Z]{3}$');
  END IF;
END;
$adjustment_currency_checks$;

DO $rate_plan_context_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
BEGIN
  v_signature:=to_regprocedure('public.validate_staynas_rate_plan_context()');
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Rate-plan context validator is missing'; END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_old:=$old$  SELECT upper(currency) INTO property_currency
  FROM public.staynas_properties
  WHERE id=NEW.property_id;
  IF property_currency IS NULL OR property_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Rate plan property must have an explicit valid currency';
  END IF;
  IF upper(NEW.currency) <> property_currency THEN
    RAISE EXCEPTION 'Rate plan currency % must match property currency %',NEW.currency,property_currency;
  END IF;
  NEW.currency := property_currency;
$old$;
  v_new:=$new$  SELECT upper(currency) INTO property_currency
  FROM public.staynas_properties
  WHERE id=NEW.property_id;
  IF property_currency IS NULL OR property_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Property operating currency must be explicitly configured';
  END IF;
  IF NEW.currency IS NULL OR upper(NEW.currency) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Rate plan must have an explicit transaction currency';
  END IF;
  NEW.currency := upper(NEW.currency);
$new$;
  v_updated:=replace(v_definition,v_old,v_new);
  v_old:=$old$    IF NOT FOUND THEN RAISE EXCEPTION 'Parent rate plan must belong to the same property'; END IF;
$old$;
  v_new:=$new$    IF NOT FOUND THEN RAISE EXCEPTION 'Parent rate plan must belong to the same property'; END IF;
    IF upper(parent_row.currency) IS DISTINCT FROM upper(NEW.currency) THEN
      RAISE EXCEPTION 'Child rate plan transaction currency must match its parent plan';
    END IF;
$new$;
  v_updated:=replace(v_updated,v_old,v_new);
  IF v_updated=v_definition
     OR position('Rate plan currency % must match property currency %' in v_updated)>0
     OR position('Child rate plan transaction currency must match its parent plan' in v_updated)=0 THEN
    RAISE EXCEPTION 'Rate-plan context validator did not migrate to explicit transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$rate_plan_context_currency$;

DO $spe05_transaction_currency$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_old text;
  v_new text;
BEGIN
  v_signature:=to_regprocedure('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)');
  IF v_signature IS NULL THEN RAISE EXCEPTION 'SPE-05 adjustment calculator is missing'; END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=v_definition;

  v_old:=$old$  SELECT upper(p.currency), p.timezone INTO v_currency,v_timezone
  FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active';
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' OR v_currency <> upper(COALESCE(_currency,'')) THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH','message','Quote currency must match the configured property currency');
  END IF;
$old$;
  v_new:=$new$  v_currency := upper(COALESCE(_currency,''));
  SELECT p.timezone INTO v_timezone
  FROM public.staynas_properties p WHERE p.id=_property_id AND p.status='active';
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH','message','Quote requires an explicit ISO-4217 transaction currency');
  END IF;
$new$;
  v_updated:=replace(v_updated,v_old,v_new);
  v_updated:=replace(v_updated,'Component currency differs from property currency','Component currency differs from quote transaction currency');
  v_updated:=replace(v_updated,'Property currency remains the sole quote currency','The resolved transaction currency remains the sole quote currency');
  v_updated:=replace(v_updated,'AND (p.currency IS NULL OR upper(p.currency)=v_currency)','AND upper(p.currency)=v_currency');
  v_updated:=replace(v_updated,'WHERE f.property_id=_property_id AND f.active=true','WHERE f.property_id=_property_id AND f.active=true AND upper(f.currency)=v_currency');
  v_old:=$old$    IF v_fee.currency IS NOT NULL AND upper(v_fee.currency)<>v_currency THEN
      RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH','message','Fee currency differs from property currency','fee_id',v_fee.id);
    END IF;
$old$;
  v_updated:=replace(v_updated,v_old,'');
  v_old:=$old$  IF EXISTS(
    SELECT 1 FROM public.staynas_property_tax_rules t
    WHERE t.property_id=_property_id AND t.active=true
      AND (t.valid_from IS NULL OR t.valid_from<=_check_in)
      AND (t.valid_to IS NULL OR t.valid_to>=_check_out-1)
      AND t.currency IS NOT NULL AND upper(t.currency)<>v_currency
  ) THEN
    RETURN jsonb_build_object('ok',false,'error_code','CURRENCY_MISMATCH',
      'message','An active tax rule uses a currency different from the property currency');
  END IF;
$old$;
  v_updated:=replace(v_updated,v_old,'');
  v_updated:=replace(v_updated,'AND (t.currency IS NULL OR upper(t.currency)=v_currency)','AND upper(t.currency)=v_currency');
  v_updated:=replace(v_updated,'OR (v_promo_row.currency IS NOT NULL AND upper(v_promo_row.currency)<>v_currency)','OR upper(v_promo_row.currency)<>v_currency');
  v_updated:=replace(v_updated,'Fee currency differs from property currency','Fee currency differs from quote transaction currency');
  v_updated:=replace(v_updated,'An active tax rule uses a currency different from the property currency','An active tax rule uses a currency different from the quote transaction currency');
  IF v_updated=v_definition
     OR position('upper(COALESCE(_currency' in v_updated)=0
     OR position('configured property currency' in v_updated)>0
     OR position('Component currency differs from property currency' in v_updated)>0
     OR position('upper(f.currency)=v_currency' in v_updated)=0
     OR position('upper(t.currency)=v_currency' in v_updated)=0 THEN
    RAISE EXCEPTION 'SPE-05 adjustment engine did not migrate to transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$spe05_transaction_currency$;

DO $booking_quote_currency_message$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature:=to_regprocedure('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)');
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Canonical booking quote calculator is missing'; END IF;
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=replace(v_definition,
    'Extra currency % does not match property currency %',
    'Extra currency % does not match booking transaction currency %');
  IF v_updated=v_definition THEN
    RAISE EXCEPTION 'Booking quote currency diagnostic did not update';
  END IF;
  EXECUTE v_updated;
END;
$booking_quote_currency_message$;

COMMIT;
