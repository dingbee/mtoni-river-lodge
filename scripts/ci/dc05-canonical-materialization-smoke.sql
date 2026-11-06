-- DC-05.03 PostgreSQL 17 migration and privilege smoke.
DO $test$
DECLARE
  v_def text;
  v_create text;
  v_link_constraint boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_reservation_payloads'::regclass) THEN
    RAISE EXCEPTION 'Encrypted reservation payload RLS is not enabled';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_distribution_reservation_links'::regclass) THEN
    RAISE EXCEPTION 'Reservation linkage RLS is not enabled';
  END IF;
  IF has_table_privilege('anon','public.staynas_distribution_reservation_payloads','SELECT')
     OR has_table_privilege('authenticated','public.staynas_distribution_reservation_payloads','SELECT')
     OR has_table_privilege('anon','public.staynas_distribution_reservation_links','SELECT')
     OR has_table_privilege('authenticated','public.staynas_distribution_reservation_links','SELECT') THEN
    RAISE EXCEPTION 'Anonymous/authenticated roles can read provider reservation data';
  END IF;
  IF has_table_privilege('service_role','public.staynas_distribution_reservation_payloads','UPDATE')
     OR has_table_privilege('service_role','public.staynas_distribution_reservation_payloads','DELETE') THEN
    RAISE EXCEPTION 'Encrypted reservation payloads are mutable by service role';
  END IF;

  IF has_function_privilege('anon',
      'public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text)',
      'EXECUTE')
     OR has_function_privilege('authenticated',
      'public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text)',
      'EXECUTE')
     OR NOT has_function_privilege('service_role',
      'public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'Canonical materializer execution grants are not service-role-only';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_distribution_reservation_links'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid) LIKE '%provider_key, external_account_id, external_reservation_id%'
  ) INTO v_link_constraint;
  IF NOT v_link_constraint THEN
    RAISE EXCEPTION 'Provider reservation identity uniqueness constraint is missing';
  END IF;

  v_def:=pg_get_functiondef(
    'public.staynas_materialize_distribution_reservation(uuid,uuid,text,text,text,date,date,integer,integer,integer,integer,text,text,text,text,text)'::regprocedure
  );
  IF position('get_staynas_room_availability_priced_with_rate_plan' IN v_def)=0
     OR position('create_booking_for_property_with_rate_plan' IN v_def)=0
     OR position('staynas_distribution_reservation_links' IN v_def)=0 THEN
    RAISE EXCEPTION 'Materializer is not bound to SPE-04 pricing and provider reservation identity';
  END IF;
  IF position('v_candidate.pricing_quote IS NULL' IN v_def)=0
     OR position('v_candidate.pricing_quote->>''ok'' IS DISTINCT FROM ''true''' IN v_def)=0
     OR position('IF NOT COALESCE(v_candidate.is_available,false)' IN v_def)=0
     OR position('v_candidate.pricing_quote IS NULL' IN v_def)
        > position('IF NOT COALESCE(v_candidate.is_available,false)' IN v_def) THEN
    RAISE EXCEPTION 'Materializer must reject unresolved/invalid rate-plan pricing before inventory retry';
  END IF;

  v_create:=pg_get_functiondef(
    'public.create_booking(text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,uuid,text)'::regprocedure
  );
  IF position('staynas_lock_room_inventory_dates' IN v_create)=0
     OR position('calculate_staynas_booking_quote' IN v_create)=0
     OR position('pricing_snapshot' IN v_create)=0
     OR position('booking_nights' IN v_create)=0 THEN
    RAISE EXCEPTION 'Canonical booking path does not preserve DC-03R allocation and pricing snapshots';
  END IF;
  IF position('staynas_lock_room_inventory_dates' IN v_create)
       > position('calculate_staynas_booking_quote' IN v_create) THEN
    RAISE EXCEPTION 'Canonical allocator does not acquire DC-03R date locks before quote/booking persistence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staynas_distribution_webhook_inbox'
      AND column_name='connection_id'
  ) THEN
    RAISE EXCEPTION 'Webhook inbox is not bound to the trusted connection';
  END IF;
END
$test$;

SELECT 'DC-05.03 PostgreSQL 17 migration/privilege smoke PASS' AS result;
