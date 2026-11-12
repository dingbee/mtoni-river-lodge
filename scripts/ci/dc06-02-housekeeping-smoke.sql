-- DC-06.02 Housekeeping/Distribution integration contract smoke test.
-- Runs only against the disposable PostgreSQL CI database.
DO $test$
DECLARE
  v_definition text;
  v_result text;
BEGIN
  IF to_regprocedure('public.housekeeping_list_distribution_handoffs()') IS NULL THEN
    RAISE EXCEPTION 'DC-06.02 handoff RPC is missing';
  END IF;

  SELECT pg_get_functiondef('public.housekeeping_list_distribution_handoffs()'::regprocedure)
    INTO v_definition;
  SELECT pg_get_function_result('public.housekeeping_list_distribution_handoffs()'::regprocedure)
    INTO v_result;

  IF position('staynas_active_property_id' IN lower(v_definition)) = 0
     OR position('staynas_user_has_property_access' IN lower(v_definition)) = 0
     OR position('o.property_id=_property_id' IN lower(replace(v_definition,' ',''))) = 0 THEN
    RAISE EXCEPTION 'DC-06.02 handoff RPC is missing active-property authorization or row scoping';
  END IF;

  IF position('booking_reference' IN v_result) = 0
     OR position('provider_key' IN v_result) = 0
     OR position('integration_status' IN v_result) = 0
     OR position('turnover_task_status' IN v_result) = 0
     OR position('inspection_status' IN v_result) = 0 THEN
    RAISE EXCEPTION 'DC-06.02 handoff RPC does not expose the required operational provenance';
  END IF;

  IF has_function_privilege('anon','public.housekeeping_list_distribution_handoffs()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution is unexpectedly granted for the DC-06.02 handoff RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.housekeeping_list_distribution_handoffs()','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated execution is missing for the DC-06.02 handoff RPC';
  END IF;
END
$test$;
