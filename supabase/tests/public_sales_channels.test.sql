-- Public direct-booking channel schema and authorization contract.
DO $test$
DECLARE
  v_quote_signature regprocedure;
  v_booking_signature regprocedure;
BEGIN
  IF to_regclass('public.staynas_public_booking_channels') IS NULL THEN
    RAISE EXCEPTION 'Public booking channel registry is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staynas_reservation_quotes' AND column_name='sales_channel_id') THEN
    RAISE EXCEPTION 'Reservation quotes do not persist their sales channel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='sales_channel_id') THEN
    RAISE EXCEPTION 'Bookings do not persist their sales channel';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_public_booking_channels'::regclass) THEN
    RAISE EXCEPTION 'Public channel registry must enforce RLS';
  END IF;
  IF has_table_privilege('anon','public.staynas_public_booking_channels','SELECT')
     OR has_table_privilege('authenticated','public.staynas_public_booking_channels','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_public_booking_channels','SELECT') THEN
    RAISE EXCEPTION 'Public channel registry must be server-role only';
  END IF;

  v_quote_signature:=to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)');
  v_booking_signature:=to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)');
  IF v_quote_signature IS NULL OR v_booking_signature IS NULL THEN
    RAISE EXCEPTION 'Public channel quote/reservation wrapper is missing';
  END IF;
  IF has_function_privilege('anon',v_quote_signature,'EXECUTE')
     OR has_function_privilege('authenticated',v_quote_signature,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_quote_signature,'EXECUTE') THEN
    RAISE EXCEPTION 'Public channel quote wrapper must be server-role only';
  END IF;
  IF has_function_privilege('anon',v_booking_signature,'EXECUTE')
     OR has_function_privilege('authenticated',v_booking_signature,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_booking_signature,'EXECUTE') THEN
    RAISE EXCEPTION 'Public channel reservation wrapper must be server-role only';
  END IF;

  IF pg_get_functiondef(v_quote_signature) NOT LIKE '%verification_status=''verified''%'
     OR pg_get_functiondef(v_quote_signature) NOT LIKE '%transaction_currency%'
     OR pg_get_functiondef(v_quote_signature) NOT LIKE '%channel_code<>''direct_web''%' THEN
    RAISE EXCEPTION 'Public quote wrapper does not enforce verified domain, currency and channel';
  END IF;
  IF pg_get_functiondef(v_booking_signature) NOT LIKE '%QUOTE_CHANNEL_MISMATCH%'
     OR pg_get_functiondef(v_booking_signature) NOT LIKE '%sales_channel_id%'
     OR pg_get_functiondef(v_booking_signature) NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'Public reservation wrapper does not bind the accepted quote to its channel';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='staynas_guest_payment_one_active_provider_uidx'
  ) THEN
    RAISE EXCEPTION 'A property may not activate multiple Pesapal accounts simultaneously';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='staynas_property_tax_rules' AND column_name='currency')<>'NO'
     OR (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='staynas_property_fee_rules' AND column_name='currency')<>'NO'
     OR (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='staynas_property_promotions' AND column_name='currency')<>'NO' THEN
    RAISE EXCEPTION 'Tax, fee and promotion rules must declare a transaction currency';
  END IF;
  IF pg_get_functiondef('public.validate_staynas_rate_plan_context()'::regprocedure)
       LIKE '%Rate plan currency % must match property currency%'
     OR pg_get_functiondef('public.validate_staynas_rate_plan_context()'::regprocedure)
       NOT LIKE '%Child rate plan transaction currency must match its parent plan%' THEN
    RAISE EXCEPTION 'Rate-plan context must allow transaction currency independent of property operating currency';
  END IF;
  IF pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
       NOT LIKE '%v_currency := upper(COALESCE(_currency%' 
     OR pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
       LIKE '%Quote currency must match the configured property currency%'
     OR pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
       NOT LIKE '%upper(f.currency)=v_currency%'
     OR pg_get_functiondef('public.calculate_staynas_spe05_adjustments(uuid,date,date,text,jsonb,uuid,uuid,text,text,date)'::regprocedure)
       NOT LIKE '%upper(t.currency)=v_currency%' THEN
    RAISE EXCEPTION 'SPE-05 adjustment engine must scope taxes, fees and promotions to transaction currency';
  END IF;
  IF pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
       NOT LIKE '%booking transaction currency%'
     OR pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
       LIKE '%does not match property currency%' THEN
    RAISE EXCEPTION 'Booking quote diagnostics must describe transaction currency';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_provider_account_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payment_events' AND column_name='provider_account_id'
  ) THEN
    RAISE EXCEPTION 'Guest payment events and bookings must persist the exact property provider account';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_provider_credential_secret_ref'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_provider_environment'
  ) THEN
    RAISE EXCEPTION 'Booking payment credentials reference and environment must be snapshotted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bookings'::regclass AND conname='bookings_payment_provider_account_property_fk'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.payment_events'::regclass AND conname='payment_events_provider_account_fk'
  ) THEN
    RAISE EXCEPTION 'Guest payment provider account references must be tenant-bound';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_public_booking_channels ch
    JOIN public.staynas_properties p ON p.id=ch.property_id
    JOIN public.staynas_property_domains d ON d.id=ch.domain_id
    WHERE p.slug='mtoni-river-lodge' AND ch.channel_code='direct_web'
      AND ch.route_path='/book' AND ch.transaction_currency='USD'
      AND ch.status='draft' AND d.verification_status='pending'
  ) THEN
    RAISE EXCEPTION 'Mtoni direct channel must remain draft until domain verification and property activation';
  END IF;
  IF (SELECT count(*) FROM public.staynas_properties
      WHERE slug IN ('mtoni-river-lodge','nolmark-cdma-staynas') AND currency='TZS')<>2 THEN
    RAISE EXCEPTION 'Existing Tanzanian properties must use TZS operating currency';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rooms WHERE currency<>'USD')
     OR EXISTS (SELECT 1 FROM public.bookings WHERE currency<>'USD')
     OR EXISTS (SELECT 1 FROM public.extras WHERE currency<>'USD') THEN
    RAISE EXCEPTION 'Existing transaction currency snapshots must remain unchanged';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='staynas_properties' AND column_name='currency')<>'NO' THEN
    RAISE EXCEPTION 'Property operating currency must be required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('rooms','bookings','extras')
      AND column_name='currency' AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Property transaction currency columns must not default to USD or another implicit currency';
  END IF;
  IF pg_get_functiondef('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)'::regprocedure)
       NOT LIKE '%calculate_staynas_room_pricing_legacy%'
     OR pg_get_functiondef('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)'::regprocedure)
       LIKE '%Room currency does not match property currency%'
     OR pg_get_functiondef('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)'::regprocedure)
       NOT LIKE '%upper(v_plan.currency)%' THEN
    RAISE EXCEPTION 'Published pricing must use the selected rate-plan transaction currency and legacy prices must remain non-recursive';
  END IF;
  IF pg_get_functiondef('public.validate_staynas_rate_plan_daily_rates()'::regprocedure)
       NOT LIKE '%upper(NEW.currency)%'
     OR pg_get_functiondef('public.validate_staynas_rate_plan_daily_rates()'::regprocedure)
       LIKE '%Daily pricing requires an explicit property currency%'
     OR pg_get_functiondef('public.validate_staynas_rate_plan_seasonal_rates()'::regprocedure)
       NOT LIKE '%upper(NEW.currency)%'
     OR pg_get_functiondef('public.validate_staynas_rate_plan_seasonal_rates()'::regprocedure)
       LIKE '%Seasonal pricing requires an explicit property currency%'
     OR pg_get_functiondef('public.validate_staynas_rate_plan_base_and_occupancy_data()'::regprocedure)
       NOT LIKE '%v_currency := upper(COALESCE(NEW.currency%'
     OR pg_get_functiondef('public.validate_staynas_rate_plan_base_and_occupancy_data()'::regprocedure)
       LIKE '%Base rate and rate-plan currency must match the property currency%' THEN
    RAISE EXCEPTION 'SPE daily, seasonal, base and occupancy rate validation must use rate-plan transaction currency';
  END IF;
  IF pg_get_functiondef('public.validate_staynas_rate_override()'::regprocedure)
       NOT LIKE '%FROM public.staynas_rate_plans%'
     OR pg_get_functiondef('public.validate_staynas_rate_override()'::regprocedure)
       NOT LIKE '%FROM public.rooms%'
     OR pg_get_functiondef('public.validate_staynas_rate_override()'::regprocedure)
       LIKE '%Rate override currency must match property currency%' THEN
    RAISE EXCEPTION 'Rate override trigger must validate against its selected transaction pricing source';
  END IF;
  IF pg_get_functiondef('public.apply_staynas_room_date_rate_override(uuid,uuid,date,numeric,text)'::regprocedure)
       NOT LIKE '%FROM public.rooms WHERE id=_room_id AND property_id=_property_id%'
     OR pg_get_functiondef('public.apply_staynas_room_date_rate_override(uuid,uuid,date,numeric,text)'::regprocedure)
       LIKE '%FROM public.staynas_properties WHERE id=_property_id%' THEN
    RAISE EXCEPTION 'Room/date overrides must retain the room transaction currency, not the property operating currency';
  END IF;
  IF pg_get_functiondef('public.calculate_staynas_room_pricing_legacy(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
       NOT LIKE '%upper(v_room.currency)%'
     OR pg_get_functiondef('public.calculate_staynas_room_pricing_legacy(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
       LIKE '%Room currency % does not match property currency %' THEN
    RAISE EXCEPTION 'Legacy room prices must retain their explicit transaction currency';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bookings'::regclass AND conname='bookings_channel_property_fk'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_reservation_quotes'::regclass AND conname='staynas_reservation_quotes_channel_property_fk'
  ) THEN
    RAISE EXCEPTION 'Channel references must enforce property tenancy';
  END IF;
END;
$test$;
