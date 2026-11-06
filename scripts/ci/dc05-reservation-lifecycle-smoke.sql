-- DC-05.04 PostgreSQL 17 lifecycle authority and safety smoke.
DO $test$
DECLARE
  v_staff text;
  v_provider text;
  v_core text;
  v_payload_store text;
BEGIN
  IF has_function_privilege('anon',
       'public.staynas_claim_distribution_reservation_lifecycle(text,integer)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.staynas_claim_distribution_reservation_lifecycle(text,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.staynas_claim_distribution_reservation_lifecycle(text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Lifecycle claim RPC must be service-role-only';
  END IF;

  IF has_function_privilege('anon',
       'public.staynas_apply_distribution_reservation_lifecycle(uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated',
       'public.staynas_apply_distribution_reservation_lifecycle(uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.staynas_apply_distribution_reservation_lifecycle(uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Lifecycle application RPC must be service-role-only';
  END IF;

  IF has_function_privilege('anon','public.staynas_transition_booking(uuid,text,text)','EXECUTE')
     OR has_function_privilege('service_role','public.staynas_transition_booking(uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.staynas_transition_booking(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Existing staff lifecycle RPC must remain authenticated-only';
  END IF;

  IF has_function_privilege('anon','public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Shared lifecycle core must not be directly callable by API roles';
  END IF;

  v_staff:=pg_get_functiondef('public.staynas_transition_booking(uuid,text,text)'::regprocedure);
  v_provider:=pg_get_functiondef('public.staynas_apply_distribution_reservation_lifecycle(uuid,uuid,text,text,text,text,text,text,timestamptz,date,date,integer,integer,text,text,text,text)'::regprocedure);
  v_core:=pg_get_functiondef('public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)'::regprocedure);
  v_payload_store:=pg_get_functiondef('public.staynas_store_distribution_reservation_payload(uuid,text,text,text,text,text)'::regprocedure);

  IF position('staynas_transition_booking_core' IN v_staff)=0
     OR position('staynas_transition_booking_core' IN v_provider)=0 THEN
    RAISE EXCEPTION 'Staff and provider lifecycle paths do not share the canonical transition implementation';
  END IF;
  IF position('staynas_distribution_reservation_links' IN v_provider)=0
     OR position('staynas_distribution_account_grants' IN v_provider)=0
     OR position('reservation.cancel' IN v_provider)=0
     OR position('reservation.update' IN v_provider)=0
     OR position('provider_modified_at' IN v_provider)=0
     OR position('stay_change_requires_reallocation' IN v_provider)=0 THEN
    RAISE EXCEPTION 'Provider lifecycle path is missing link, capability, ordering or fail-closed modification checks';
  END IF;
  IF position('v_inbox.event_type IN (''reservation.created'',''reservation.confirmed'')' IN v_payload_store)=0 THEN
    RAISE EXCEPTION 'Encrypted payload retention must permit follow-on lifecycle events after canonical materialization';
  END IF;
  IF position('staynas_lock_room_inventory_dates' IN v_core)=0
     OR position('available_units=LEAST(r.total_units,ri.available_units+1)' IN v_core)=0
     OR position('status=_target_status::public.booking_status' IN v_core)=0 THEN
    RAISE EXCEPTION 'Canonical cancellation must release DC-03R inventory through the shared lifecycle core';
  END IF;
  IF position('staynas_distribution_reservation_links' IN v_provider)=0
     OR position('UPDATE public.bookings' IN v_provider)=0 THEN
    RAISE EXCEPTION 'Provider lifecycle path must be bound to a canonical booking';
  END IF;
END
$test$;

SELECT 'DC-05.04 PostgreSQL 17 lifecycle authority/safety smoke PASS' AS result;
