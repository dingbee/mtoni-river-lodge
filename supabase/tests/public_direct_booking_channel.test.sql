BEGIN;
SELECT plan(11);

SELECT ok(
  to_regclass('public.staynas_public_booking_channels') IS NOT NULL,
  'public direct-booking channel registry exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staynas_reservation_quotes' AND column_name='sales_channel_id')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='sales_channel_id'),
  'quotes and bookings persist their direct sales channel'
);

SELECT ok(
  COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.staynas_public_booking_channels')), false),
  'direct-booking channel registry has row-level security enabled'
);

SELECT ok(
  COALESCE(NOT has_table_privilege('anon',to_regclass('public.staynas_public_booking_channels'),'SELECT'),false)
  AND COALESCE(NOT has_table_privilege('authenticated',to_regclass('public.staynas_public_booking_channels'),'SELECT'),false)
  AND COALESCE(has_table_privilege('service_role',to_regclass('public.staynas_public_booking_channels'),'SELECT'),false),
  'channel registry is accessible only through the server role'
);

SELECT ok(
  to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)') IS NOT NULL
  AND to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)') IS NOT NULL,
  'server-only channel quote and reservation wrappers exist'
);

SELECT ok(
  COALESCE(NOT has_function_privilege('anon',to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)'),'EXECUTE'),false)
  AND COALESCE(NOT has_function_privilege('authenticated',to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)'),'EXECUTE'),false)
  AND COALESCE(has_function_privilege('service_role',to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)'),'EXECUTE'),false)
  AND COALESCE(NOT has_function_privilege('anon',to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'),'EXECUTE'),false)
  AND COALESCE(NOT has_function_privilege('authenticated',to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'),'EXECUTE'),false)
  AND COALESCE(has_function_privilege('service_role',to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'),'EXECUTE'),false),
  'public channel quote and reservation RPCs are service-role only'
);

SELECT ok(
  COALESCE(
    position('verification_status=''verified''' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)')))>0
    AND position('channel_code<>''direct_web''' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)')))>0
    AND position('route_path<>''/book''' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)')))>0,
    false
  ),
  'quote wrapper requires verified domain, published direct-web /book channel and transaction currency'
);

SELECT ok(
  COALESCE(
    position('QUOTE_CHANNEL_MISMATCH' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)')))>0
    AND position('sales_channel_id' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)')))>0
    AND position('FOR UPDATE' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)')))>0
    AND position('PAYMENT_NOT_CONFIGURED' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)')))>0
    AND position('pay_at_property' in pg_get_functiondef(to_regprocedure('public.staynas_create_public_channel_reservation(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)')))>0,
    false
  ),
  'reservation wrapper locks the quote, binds the channel and rejects online payment'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.staynas_public_booking_channels') AND conname='staynas_public_booking_channels_domain_property_fk')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.staynas_reservation_quotes') AND conname='staynas_reservation_quotes_channel_property_fk')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.bookings') AND conname='bookings_channel_property_fk'),
  'domain, quote and booking rows have composite property/channel foreign keys'
);

SELECT ok(
  COALESCE(
    position('upper(v_plan.currency)' in pg_get_functiondef(to_regprocedure('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)')))>0
    AND position('Room currency does not match property currency' in pg_get_functiondef(to_regprocedure('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)')))=0,
    false
  ),
  'published rate-plan transaction currency is independent of property operating currency'
);

SELECT ok(
  COALESCE(
    position('pay_at_property' in pg_get_functiondef(to_regprocedure('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)')))>0
    AND position('manual' in pg_get_functiondef(to_regprocedure('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)')))>0
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='bookings'
        AND column_name='payment_status' AND column_default LIKE '%unpaid%'
    ),
    false
  ),
  'pay-at-property reservations use the manual provider and remain unpaid by default'
);

SELECT * FROM finish();
ROLLBACK;
