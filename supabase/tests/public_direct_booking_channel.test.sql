-- Connection-first public direct booking channel contract.
-- The test is read-only and validates schema/security definitions; UAT fixtures
-- and live booking writes are handled in the isolated UAT database branch.

DO $test$
DECLARE
  v_quote regprocedure;
  v_reservation regprocedure;
  v_domain_fk boolean;
  v_quote_fk boolean;
  v_booking_fk boolean;
BEGIN
  IF to_regclass('public.staynas_public_booking_channels') IS NULL THEN
    RAISE EXCEPTION 'Public direct-booking channel registry is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_reservation_quotes'
      AND column_name='sales_channel_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bookings'
      AND column_name='sales_channel_id'
  ) THEN
    RAISE EXCEPTION 'Quotes and bookings must persist their sales channel';
  END IF;

  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid='public.staynas_public_booking_channels'::regclass
  ) THEN
    RAISE EXCEPTION 'Public booking channel registry must have RLS enabled';
  END IF;

  IF has_table_privilege('anon','public.staynas_public_booking_channels','SELECT')
     OR has_table_privilege('authenticated','public.staynas_public_booking_channels','SELECT')
     OR NOT has_table_privilege('service_role','public.staynas_public_booking_channels','SELECT') THEN
    RAISE EXCEPTION 'Channel registry must be server-role only';
  END IF;

  v_quote := to_regprocedure(
    'public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)'
  );
  v_reservation := to_regprocedure(
    'public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'
  );
  IF v_quote IS NULL OR v_reservation IS NULL THEN
    RAISE EXCEPTION 'Server-only quote and reservation wrappers are required';
  END IF;

  IF has_function_privilege('anon',v_quote,'EXECUTE')
     OR has_function_privilege('authenticated',v_quote,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_quote,'EXECUTE')
     OR has_function_privilege('anon',v_reservation,'EXECUTE')
     OR has_function_privilege('authenticated',v_reservation,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_reservation,'EXECUTE') THEN
    RAISE EXCEPTION 'Public channel quote/reservation wrappers must be service-role only';
  END IF;

  IF pg_get_functiondef(v_quote) NOT LIKE '%verification_status=''verified''%'
     OR pg_get_functiondef(v_quote) NOT LIKE '%channel_code<>''direct_web''%'
     OR pg_get_functiondef(v_quote) NOT LIKE '%transaction_currency%' THEN
    RAISE EXCEPTION 'Quote wrapper must enforce verified domain, direct channel and transaction currency';
  END IF;

  IF pg_get_functiondef(v_reservation) NOT LIKE '%QUOTE_CHANNEL_MISMATCH%'
     OR pg_get_functiondef(v_reservation) NOT LIKE '%sales_channel_id%'
     OR pg_get_functiondef(v_reservation) NOT LIKE '%FOR UPDATE%'
     OR pg_get_functiondef(v_reservation) NOT LIKE '%PAYMENT_NOT_CONFIGURED%'
     OR pg_get_functiondef(v_reservation) NOT LIKE '%pay_at_property%' THEN
    RAISE EXCEPTION 'Reservation wrapper must lock and bind the quote to the exact channel';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_public_booking_channels'::regclass
      AND conname='staynas_public_booking_channels_domain_property_fk'
  ) INTO v_domain_fk;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_reservation_quotes'::regclass
      AND conname='staynas_reservation_quotes_channel_property_fk'
  ) INTO v_quote_fk;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bookings'::regclass
      AND conname='bookings_channel_property_fk'
  ) INTO v_booking_fk;

  IF NOT v_domain_fk OR NOT v_quote_fk OR NOT v_booking_fk THEN
    RAISE EXCEPTION 'Domain, quote and booking channel/property composite foreign keys are required';
  END IF;

  IF pg_get_functiondef(
       'public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)'::regprocedure
     ) NOT LIKE '%upper(v_plan.currency)%'
     OR pg_get_functiondef(
       'public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)'::regprocedure
     ) LIKE '%Room currency does not match property currency%' THEN
    RAISE EXCEPTION 'Published room pricing must use rate-plan transaction currency, not property operating currency';
  END IF;

  IF pg_get_functiondef(
       'public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid,text)'::regprocedure
     ) NOT LIKE '%v_payment_method=''pay_at_property'' THEN ''manual''%'
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='bookings'
         AND column_name='payment_status'
         AND column_default LIKE '%unpaid%'
     ) THEN
    RAISE EXCEPTION 'Pay-at-property reservations must remain manual and unpaid';
  END IF;
END;
$test$;
