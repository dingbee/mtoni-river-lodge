BEGIN;
SELECT plan(10);

SELECT has_function(
  'public',
  'get_room_availability',
  ARRAY['date','date','uuid'],
  'Property-scoped public room availability RPC exists'
);

SELECT has_function(
  'public',
  'get_staynas_room_availability_priced',
  ARRAY['date','date','uuid','integer','integer','integer'],
  'Canonical priced guest availability RPC exists'
);

SELECT ok(
  pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%public.room_states%'
    AND pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%rs.property_id = r.property_id%',
  'Public room-status availability reads operational states within the same property'
);

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%public.room_states%'
    AND pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%rs.property_id = r.property_id%',
  'Priced guest booking availability reads operational states within the same property'
);

SELECT ok(
  pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%vacant_dirty%'
    AND pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%inspection%'
    AND pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%maintenance%'
    AND pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%out_of_service%',
  'Public room status excludes every non-sellable housekeeping/maintenance state'
);

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%vacant_dirty%'
    AND pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%inspection%'
    AND pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%maintenance%'
    AND pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%out_of_service%',
  'Priced guest availability excludes every non-sellable housekeeping/maintenance state'
);

SELECT ok(
  pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%rs.booking_id IS NULL%',
  'Public status avoids subtracting units already allocated to bookings'
);

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%rs.booking_id IS NULL%',
  'Priced availability avoids double-counting booked or reserved physical units'
);

SELECT ok(
  pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%inv.available_units%'
    AND pg_get_functiondef('public.get_room_availability(date,date,uuid)'::regprocedure)
    LIKE '%booking_holds%',
  'Public status retains date-specific inventory blocks and active holds'
);

SELECT ok(
  pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%room_inventory%'
    AND pg_get_functiondef('public.get_staynas_room_availability_priced(date,date,uuid,integer,integer,integer)'::regprocedure)
    LIKE '%booking_holds%',
  'Priced availability retains date-specific inventory and active holds'
);

SELECT * FROM finish();
ROLLBACK;
