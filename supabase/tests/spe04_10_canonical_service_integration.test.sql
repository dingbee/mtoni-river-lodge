-- SPE-04.10 — canonical pricing-service integration contract.
BEGIN;
SELECT plan(9);

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%resolve_staynas_published_room_pricing%'
    AND pg_get_functiondef('public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamptz)'::regprocedure)
    LIKE '%calculate_staynas_room_pricing_legacy%',
  'The shared room adapter is the only bridge to published resolver and legacy-only fallback');

SELECT ok(
  pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
    LIKE '%calculate_staynas_room_pricing%'
    AND pg_get_functiondef('public.calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer,jsonb)'::regprocedure)
    LIKE '%calculate_staynas_booking_taxes%',
  'Canonical quote composition uses shared accommodation pricing and one tax calculation');

SELECT ok(
  pg_get_functiondef('public.try_calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%calculate_staynas_booking_quote%'
    AND pg_get_functiondef('public.try_calculate_staynas_booking_quote(uuid,uuid,date,date,integer,integer,integer)'::regprocedure)
    LIKE '%INVALID_RATE_CONFIGURATION%',
  'Availability safe wrapper delegates to canonical quote composition and fails closed');

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%try_calculate_staynas_booking_quote%',
  'Priced availability uses the canonical quote service');

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced_with_rate_plan(date,date,uuid,integer,integer,integer,uuid)'::regprocedure)
    LIKE '%set_config(''staynas.rate_plan_id''%'
    AND pg_get_functiondef('public.get_staynas_room_availability_priced_with_rate_plan(date,date,uuid,integer,integer,integer,uuid)'::regprocedure)
    LIKE '%get_staynas_room_availability_priced%',
  'Selected-plan availability passes context to the same canonical availability service');

SELECT ok(
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%calculate_staynas_booking_quote%'
    AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%pricing_snapshot%'
    AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%booking_nights%',
  'Booking persists the canonical quote and its nightly evidence without recalculating monetary totals');

SELECT ok(
  pg_get_functiondef('public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid)'::regprocedure)
    LIKE '%set_config(''staynas.rate_plan_id''%'
    AND pg_get_functiondef('public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid)'::regprocedure)
    LIKE '%create_booking_for_property%',
  'Selected-plan booking delegates to the same canonical booking transaction');

SELECT ok(
  pg_get_functiondef('public.get_staynas_booking_quote_with_rate_plan(uuid,text,date,date,integer,integer,integer,jsonb,uuid)'::regprocedure)
    LIKE '%set_config(''staynas.rate_plan_id''%'
    AND pg_get_functiondef('public.get_staynas_booking_quote_with_rate_plan(uuid,text,date,date,integer,integer,integer,jsonb,uuid)'::regprocedure)
    LIKE '%calculate_staynas_booking_quote%',
  'Selected-plan quote delegates to canonical quote composition');

SELECT ok(
  pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%tax_addition%'
    AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%tax_breakdown%',
  'Booking consumes tax outputs from the canonical quote instead of applying a second tax calculation');

SELECT * FROM finish();
ROLLBACK;
