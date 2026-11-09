-- Separate property operating currency from transaction-price currency.
-- Existing historical room/booking/extras currency values are preserved.
BEGIN;

ALTER TABLE public.staynas_properties
  ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.rooms
  ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.bookings
  ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.extras
  ALTER COLUMN currency DROP DEFAULT;

-- These two existing StayNas properties are Tanzanian operating properties.
-- Preserve their existing USD room/rate-plan transaction prices and history.
UPDATE public.staynas_properties
SET currency = 'TZS'
WHERE slug IN ('mtoni-river-lodge','nolmark-cdma-staynas')
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
     OR position('upper(v_room.currency)' in v_updated)=0 THEN
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
  v_definition:=pg_get_functiondef(v_signature);
  v_updated:=replace(v_definition,'  v_currency text;','  v_currency text;'||E'\n  v_currency_count integer;');

  v_old:=$old$  SELECT upper(currency) INTO v_currency
  FROM public.staynas_properties WHERE id=NEW.property_id;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}
 THEN
    RAISE EXCEPTION 'Rate override property must have an explicit currency';
  END IF;
  IF upper(NEW.currency) <> v_currency THEN
    RAISE EXCEPTION 'Rate override currency must match property currency %',v_currency;
  END IF;
  NEW.currency := v_currency;
$old$;
  v_new:=$new$  IF NEW.rate_plan_id IS NOT NULL THEN
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
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}
 THEN
    RAISE EXCEPTION 'Rate override pricing source must have an explicit transaction currency';
  END IF;
  IF upper(NEW.currency) <> v_currency THEN
    RAISE EXCEPTION 'Rate override currency must match the selected pricing source currency %',v_currency;
  END IF;
  NEW.currency := v_currency;
$new$;
  v_updated:=replace(v_updated,v_old,v_new);
  IF v_updated=v_definition
     OR position('FROM public.staynas_rate_plans' in v_updated)=0
     OR position('FROM public.rooms' in v_updated)=0
     OR position('Rate override currency must match property currency' in v_updated)>0 THEN
    RAISE EXCEPTION 'Rate override validation did not migrate to pricing-source transaction currency';
  END IF;
  EXECUTE v_updated;
END;
$rate_override_currency$;

COMMIT;
