-- SPE-06 structural contract tests. No live property records are written.
BEGIN;
SELECT plan(24);

SELECT has_table('public','staynas_reservation_quotes','Durable accepted reservation quotes exist');
SELECT has_table('public','staynas_reservation_idempotency','Reservation idempotency ledger exists');
SELECT has_column('public','bookings','reservation_quote_id','Confirmed bookings retain the accepted quote reference');
SELECT has_column('public','staynas_reservation_quotes','quote_snapshot','Quotes retain immutable pricing evidence');
SELECT has_column('public','staynas_reservation_quotes','expires_at','Quotes have explicit expiry');
SELECT has_column('public','staynas_reservation_idempotency','request_hash','Idempotency keys bind to request payloads');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_reservation_quotes'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.staynas_reservation_idempotency'::regclass),
  'Quote and idempotency ledgers enforce RLS');

SELECT ok(
  NOT has_table_privilege('anon','public.staynas_reservation_quotes','SELECT')
  AND NOT has_table_privilege('authenticated','public.staynas_reservation_quotes','SELECT')
  AND has_table_privilege('service_role','public.staynas_reservation_quotes','SELECT'),
  'Quote ledger is server-only');

SELECT has_function(
  'public','staynas_create_reservation_quote',
  ARRAY['uuid','text','date','date','integer','integer','integer','jsonb','uuid','text','text','integer'],
  'Canonical quote creation persists a server-issued quote token');

SELECT has_function(
  'public','staynas_create_reservation_from_quote',
  ARRAY['uuid','uuid','text','text','text','text','text','text','text','text','uuid','text','text','uuid','text','text'],
  'Canonical reservation creation accepts a quote and idempotency key');

SELECT ok(
  NOT has_function_privilege('anon','public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)','EXECUTE')
  AND has_function_privilege('service_role','public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)','EXECUTE'),
  'Quote creation is restricted to the server service role');

SELECT ok(
  pg_get_functiondef('public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)'::regprocedure)
    LIKE '%get_staynas_booking_quote_with_rate_plan_and_promo%'
  AND pg_get_functiondef('public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)'::regprocedure)
    LIKE '%quote_hash%',
  'Quote persistence consumes the canonical SPE-05 pricing resolver');

SELECT ok(
  pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%FOR UPDATE%'
  AND pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%request_hash%',
  'Idempotency and quote rows are serialized before reservation creation');

SELECT ok(
  pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%create_booking_for_property_with_rate_plan_and_promo%'
  AND pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%pricing_snapshot%',
  'Reservation creation reuses the canonical transactional booking and snapshot path');

SELECT ok(
  pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%QUOTE_STALE%'
  AND pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%QUOTE_EXPIRED%'
  AND pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%QUOTE_ALREADY_USED%',
  'Stale, expired and reused quotes are explicitly rejected');

SELECT ok(
  pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%reservation.created%'
  AND pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%activity_logs%',
  'Staff reservation creation records its audit event in the booking transaction');

SELECT ok(
  pg_get_functiondef('public.staynas_enforce_booking_lifecycle()'::regprocedure)
    LIKE '%Payment is required before confirming this reservation%',
  'Unpaid online reservations cannot be confirmed');

SELECT ok(
  pg_get_functiondef('public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)'::regprocedure)
    LIKE '%available_units=LEAST(r.total_units,ri.available_units+1)%',
  'Cancellation restores inventory exactly once through the lifecycle core');

SELECT ok(
  (SELECT prosecdef FROM pg_proc
   WHERE oid='public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)'::regprocedure),
  'Lifecycle core executes with controlled definer privileges');

SELECT ok(
  NOT has_function_privilege('anon','public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)','EXECUTE')
  AND has_function_privilege('service_role','public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)','EXECUTE'),
  'Lifecycle core is not exposed to browser roles');

SELECT ok(
  pg_get_functiondef('public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)'::regprocedure)
    LIKE '%staynas_user_has_property_access%'
  AND pg_get_functiondef('public.staynas_transition_booking_core(uuid,text,text,uuid,text,uuid)'::regprocedure)
    LIKE '%v_booking.property_id IS DISTINCT FROM _property_id%',
  'Lifecycle core verifies trusted actor and property scope before mutation');

SELECT ok(
  pg_get_functiondef('public.staynas_lock_room_inventory_dates(uuid,uuid,date,date)'::regprocedure)
    LIKE '%FOR UPDATE%'
  AND pg_get_functiondef('public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)'::regprocedure)
    LIKE '%available_units-1%',
  'Nightly inventory allocation is serialized and decremented inside the booking transaction');

SELECT ok(
  pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%actor_type%'
  AND pg_get_functiondef('public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'::regprocedure)
    LIKE '%correlation_id%',
  'Guest and staff reservation creation are audited with quote correlation');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.staynas_reservation_quotes'::regclass
      AND tgname='staynas_prune_expired_reservation_quotes_trg'
      AND NOT tgisinternal
  ),
  'Expired abandoned quote rows are pruned opportunistically');

SELECT * FROM finish();
ROLLBACK;
