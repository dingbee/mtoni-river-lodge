-- SPE-04.07.02 — selected-plan propagation contract
BEGIN;
SELECT plan(8);
SELECT has_function('public','get_staynas_booking_quote_with_rate_plan',ARRAY['uuid','text','date','date','integer','integer','integer','jsonb','uuid'],'Selected-plan quote wrapper exists');
SELECT has_function('public','get_staynas_room_availability_priced_with_rate_plan',ARRAY['date','date','uuid','integer','integer','integer','uuid'],'Selected-plan availability wrapper exists');
SELECT has_function('public','create_booking_for_property_with_rate_plan',ARRAY['uuid','text','date','date','integer','integer','text','text','text','text','text','jsonb','integer','integer','uuid','text','text','uuid'],'Selected-plan booking wrapper exists');
SELECT ok(pg_get_functiondef('public.calculate_staynas_room_pricing(uuid,uuid,date,date,integer,integer,integer)'::regprocedure) LIKE '%current_setting(''staynas.rate_plan_id''%',
 'Shared resolver adapter consumes transaction-local selected plan context');
SELECT ok(pg_get_functiondef('public.get_staynas_booking_quote_with_rate_plan(uuid,text,date,date,integer,integer,integer,jsonb,uuid)'::regprocedure) LIKE '%set_config(''staynas.rate_plan_id''%',
 'Quote wrapper sets plan context transaction-locally');
SELECT ok(pg_get_functiondef('public.get_staynas_room_availability_priced_with_rate_plan(date,date,uuid,integer,integer,integer,uuid)'::regprocedure) LIKE '%set_config(''staynas.rate_plan_id''%',
 'Availability wrapper sets plan context transaction-locally');
SELECT ok(pg_get_functiondef('public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid)'::regprocedure) LIKE '%set_config(''staynas.rate_plan_id''%',
 'Booking wrapper sets plan context transaction-locally');
SELECT ok(NOT has_function_privilege('anon','public.create_booking_for_property_with_rate_plan(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text,uuid)','EXECUTE'),
 'Public anonymous role cannot execute privileged booking wrapper');
SELECT * FROM finish();
ROLLBACK;
