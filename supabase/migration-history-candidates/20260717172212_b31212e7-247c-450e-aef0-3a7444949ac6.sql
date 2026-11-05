-- Sprint 9K: PMS Calendar Operations layer
-- Atomic room-reassignment RPC. Validates target availability and occupancy,
-- swaps inventory across the stay range, updates the booking + booking_nights,
-- and writes a calendar_events audit row.

CREATE OR REPLACE FUNCTION public.reassign_booking_room(
  _booking_id uuid,
  _new_room_id uuid,
  _actor uuid DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _b public.bookings%ROWTYPE;
  _new_room public.rooms%ROWTYPE;
  _d date;
  _units int;
  _blocked boolean;
  _occupants int;
BEGIN
  IF _booking_id IS NULL OR _new_room_id IS NULL THEN
    RAISE EXCEPTION 'booking_id and new_room_id are required';
  END IF;

  SELECT * INTO _b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF _b.status IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'Cannot reassign a % booking', _b.status;
  END IF;
  IF _b.room_id = _new_room_id THEN
    RAISE EXCEPTION 'Booking is already assigned to this room';
  END IF;

  SELECT * INTO _new_room FROM public.rooms
    WHERE id = _new_room_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Target room not found or inactive'; END IF;

  _occupants := COALESCE(_b.adults,0) + COALESCE(_b.children,0);
  IF _occupants > _new_room.max_occupancy THEN
    RAISE EXCEPTION 'Target room % allows up to % guests', _new_room.name, _new_room.max_occupancy;
  END IF;

  -- Validate every night has capacity in the target room, and lock the rows.
  _d := _b.check_in;
  WHILE _d < _b.check_out LOOP
    INSERT INTO public.room_inventory (room_id, date, available_units)
      VALUES (_new_room_id, _d, _new_room.total_units)
      ON CONFLICT (room_id, date) DO NOTHING;

    SELECT available_units, is_blocked INTO _units, _blocked
      FROM public.room_inventory
      WHERE room_id = _new_room_id AND date = _d
      FOR UPDATE;

    IF _blocked OR _units <= 0 THEN
      RAISE EXCEPTION 'Target room % has no availability on %', _new_room.name, _d;
    END IF;
    _d := _d + INTERVAL '1 day';
  END LOOP;

  -- Consume target inventory, restore original.
  UPDATE public.room_inventory
     SET available_units = available_units - 1
   WHERE room_id = _new_room_id
     AND date >= _b.check_in AND date < _b.check_out;

  UPDATE public.room_inventory
     SET available_units = available_units + 1
   WHERE room_id = _b.room_id
     AND date >= _b.check_in AND date < _b.check_out;

  -- Reassign booking + per-night rows.
  UPDATE public.bookings
     SET room_id = _new_room_id, updated_at = now()
   WHERE id = _booking_id;

  UPDATE public.booking_nights
     SET room_id = _new_room_id
   WHERE booking_id = _booking_id;

  -- Audit trail (feeds the calendar events feed).
  INSERT INTO public.calendar_events (
    event_type, room_id, booking_id, date_from, date_to, actor_id, payload
  ) VALUES (
    'booking.reassigned',
    _new_room_id,
    _booking_id,
    _b.check_in,
    _b.check_out,
    _actor,
    jsonb_build_object(
      'from_room_id', _b.room_id,
      'to_room_id', _new_room_id,
      'reason', _reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', _booking_id,
    'from_room_id', _b.room_id,
    'to_room_id', _new_room_id
  );
END $$;

REVOKE ALL ON FUNCTION public.reassign_booking_room(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_booking_room(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reassign_booking_room(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_booking_room(uuid, uuid, uuid, text) TO service_role;