#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD=postgres
DB=postgresql://postgres:postgres@127.0.0.1:5432/postgres

psql "$DB" -v ON_ERROR_STOP=1 <<'SQL'
SET request.jwt.claim.role='service_role';
INSERT INTO public.staynas_properties(id,status) VALUES
 ('10000000-0000-4000-8000-000000000001','active'),
 ('10000000-0000-4000-8000-000000000002','active');
INSERT INTO public.rooms(id,property_id,slug,name,total_units,base_price,currency,max_occupancy)
VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','one-unit','One unit',1,100,'USD',4),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','same-session','Same session',5,100,'USD',4),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','multi-night','Multi night',1,100,'USD',4),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','race-hold','Race hold',1,100,'USD',4),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','race-mixed','Race mixed',1,100,'USD',4);
INSERT INTO public.room_inventory(room_id,date,available_units,is_blocked)
VALUES('20000000-0000-4000-8000-000000000003','2032-01-11',1,true);
SQL

psql "$DB" -v ON_ERROR_STOP=1 <<'SQL'
SET request.jwt.claim.role='service_role';
DO $$
DECLARE v_hold uuid; v_booking uuid; v_same uuid; v_i integer;
        v_failed boolean; v_message text;
BEGIN
 SELECT hold_id INTO v_hold FROM public.create_booking_hold(
  'one-unit','2032-01-01','2032-01-02',repeat('a',32),
  '10000000-0000-4000-8000-000000000001',NULL,900);
 v_failed:=false;
 BEGIN
  PERFORM 1 FROM public.create_booking(
   'one-unit','2032-01-01','2032-01-02',1,0,'Guest B','b@example.com',
   NULL,NULL,NULL,'[]'::jsonb,0,0,NULL,NULL,'10000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
  v_failed:=v_message LIKE 'No unallocated inventory%';
  IF NOT v_failed THEN RAISE; END IF;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'No-hold booking consumed a held final unit'; END IF;

 SELECT booking_id INTO v_booking FROM public.create_booking(
  'one-unit','2032-01-01','2032-01-02',1,0,'Guest A','a@example.com',
  NULL,NULL,NULL,'[]'::jsonb,0,0,v_hold,repeat('a',32),
  '10000000-0000-4000-8000-000000000001');
 IF (SELECT status FROM public.booking_holds WHERE id=v_hold)<>'converted' THEN
  RAISE EXCEPTION 'Hold was not converted';
 END IF;
 IF (SELECT available_units FROM public.room_inventory
     WHERE room_id='20000000-0000-4000-8000-000000000001' AND date='2032-01-01')<>0 THEN
  RAISE EXCEPTION 'Inventory was not decremented exactly once';
 END IF;
 IF (SELECT count(*) FROM public.booking_nights WHERE booking_id=v_booking)<>1 THEN
  RAISE EXCEPTION 'Booking night was not written';
 END IF;

 FOR v_i IN 1..5 LOOP
  SELECT hold_id INTO v_same FROM public.create_booking_hold(
   'same-session','2032-02-01','2032-02-02',repeat('b',32),
   '10000000-0000-4000-8000-000000000001',NULL,900);
 END LOOP;
 v_failed:=false;
 BEGIN
  PERFORM 1 FROM public.create_booking_hold(
   'same-session','2032-02-01','2032-02-02',repeat('b',32),
   '10000000-0000-4000-8000-000000000001',NULL,900);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
  v_failed:=v_message LIKE 'No availability%';
  IF NOT v_failed THEN RAISE; END IF;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'Same-session holds were incorrectly excluded'; END IF;

 v_failed:=false;
 BEGIN
  PERFORM 1 FROM public.create_booking(
   'multi-night','2032-01-10','2032-01-12',1,0,'Guest C','c@example.com',
   NULL,NULL,NULL,'[]'::jsonb,0,0,NULL,NULL,'10000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
  v_failed:=v_message LIKE 'Room blocked on%';
  IF NOT v_failed THEN RAISE; END IF;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'Blocked second night was accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.room_inventory
   WHERE room_id='20000000-0000-4000-8000-000000000003' AND date='2032-01-10') THEN
  RAISE EXCEPTION 'Multi-night failure left a partial inventory row';
 END IF;
 IF EXISTS(SELECT 1 FROM public.bookings WHERE guest_email='c@example.com') THEN
  RAISE EXCEPTION 'Multi-night failure left a partial booking';
 END IF;
 IF EXISTS(SELECT 1 FROM public.get_booking_hold_for_session(
   v_same,repeat('b',32),'10000000-0000-4000-8000-000000000002')) THEN
  RAISE EXCEPTION 'Cross-property hold lookup leaked';
 END IF;
 IF public.release_booking_hold(v_same,repeat('b',32),'10000000-0000-4000-8000-000000000002') THEN
  RAISE EXCEPTION 'Cross-property hold release succeeded';
 END IF;
END;
$$;
SQL

# Concurrent final-unit hold race: exactly one request must win.
set +e
psql "$DB" -v ON_ERROR_STOP=1 -c "SET request.jwt.claim.role='service_role'; SELECT * FROM public.create_booking_hold('race-hold','2032-03-01','2032-03-02',repeat('c',32),'10000000-0000-4000-8000-000000000001',NULL,900);" >/tmp/dc03r-hold-a.log 2>&1 &
p1=$!
psql "$DB" -v ON_ERROR_STOP=1 -c "SET request.jwt.claim.role='service_role'; SELECT * FROM public.create_booking_hold('race-hold','2032-03-01','2032-03-02',repeat('d',32),'10000000-0000-4000-8000-000000000001',NULL,900);" >/tmp/dc03r-hold-b.log 2>&1 &
p2=$!
wait "$p1"; s1=$?
wait "$p2"; s2=$?
set -e
if { [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; } || { [ "$s1" -ne 0 ] && [ "$s2" -ne 0 ]; }; then
 cat /tmp/dc03r-hold-a.log /tmp/dc03r-hold-b.log
 echo "Expected exactly one concurrent final-unit hold to succeed" >&2
 exit 1
fi

# A hold and a booking racing for one unit must not both allocate it.
set +e
psql "$DB" -v ON_ERROR_STOP=1 -c "SET request.jwt.claim.role='service_role'; SELECT * FROM public.create_booking_hold('race-mixed','2032-04-01','2032-04-02',repeat('e',32),'10000000-0000-4000-8000-000000000001',NULL,900);" >/tmp/dc03r-mixed-hold.log 2>&1 &
p1=$!
psql "$DB" -v ON_ERROR_STOP=1 -c "SET request.jwt.claim.role='service_role'; SELECT * FROM public.create_booking('race-mixed','2032-04-01','2032-04-02',1,0,'Race Guest','race@example.com',NULL,NULL,NULL,'[]'::jsonb,0,0,NULL,NULL,'10000000-0000-4000-8000-000000000001');" >/tmp/dc03r-mixed-booking.log 2>&1 &
p2=$!
wait "$p1"; s1=$?
wait "$p2"; s2=$?
set -e
if { [ "$s1" -eq 0 ] && [ "$s2" -eq 0 ]; } || { [ "$s1" -ne 0 ] && [ "$s2" -ne 0 ]; }; then
 cat /tmp/dc03r-mixed-hold.log /tmp/dc03r-mixed-booking.log
 echo "Expected at most one concurrent hold/booking allocation to succeed" >&2
 exit 1
fi
echo "DC-03R PostgreSQL smoke tests passed."
