-- Keep seeded room-state fixtures portable across environments.
-- Room IDs are generated at insert time; resolve them by stable room slug.
DO $$
DECLARE
  _family_room_id uuid;
  _deluxe_room_id uuid;
  _standard_room_id uuid;
BEGIN
  SELECT id INTO _family_room_id
    FROM public.rooms
   WHERE slug = 'family-room'
   ORDER BY created_at, id
   LIMIT 1;

  SELECT id INTO _deluxe_room_id
    FROM public.rooms
   WHERE slug = 'riverfront-deluxe'
   ORDER BY created_at, id
   LIMIT 1;

  SELECT id INTO _standard_room_id
    FROM public.rooms
   WHERE slug = 'standard-river'
   ORDER BY created_at, id
   LIMIT 1;

  IF _family_room_id IS NULL OR _deluxe_room_id IS NULL OR _standard_room_id IS NULL THEN
    RAISE EXCEPTION 'Required room fixtures are missing (family-room, riverfront-deluxe, standard-river)';
  END IF;

  -- Family: keep 1 unit (the occupied family-room-01), delete the rest.
  DELETE FROM public.room_states
   WHERE room_id = _family_room_id
     AND unit_label IN ('family-room-02','family-room-03','family-room-04');

  -- Riverfront Deluxe: keep 2 units (01, 02), delete the rest.
  DELETE FROM public.room_states
   WHERE room_id = _deluxe_room_id
     AND unit_label IN (
       'riverfront-deluxe-03','riverfront-deluxe-04','riverfront-deluxe-05',
       'riverfront-deluxe-06','riverfront-deluxe-07','riverfront-deluxe-08'
     );

  -- Standard River: add units 13-21 to reach 21 total.
  INSERT INTO public.room_states (room_id, unit_label, state)
  SELECT _standard_room_id,
         'standard-river-' || lpad(g::text, 2, '0'),
         'vacant_clean'
    FROM generate_series(13, 21) g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.room_states
      WHERE room_id = _standard_room_id
        AND unit_label = 'standard-river-' || lpad(g::text, 2, '0')
   );
END
$$;
