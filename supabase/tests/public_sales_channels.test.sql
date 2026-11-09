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
