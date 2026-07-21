
-- Family: keep 1 unit (the occupied family-room-01), delete the rest
DELETE FROM public.room_states
 WHERE room_id = '593ee88e-3047-45f7-b7e2-90f153b5a171'
   AND unit_label IN ('family-room-02','family-room-03','family-room-04');

-- Riverfront Deluxe: keep 2 units (01, 02), delete the rest
DELETE FROM public.room_states
 WHERE room_id = '368df0a7-e892-42a1-aade-32da3cad6698'
   AND unit_label IN (
     'riverfront-deluxe-03','riverfront-deluxe-04','riverfront-deluxe-05',
     'riverfront-deluxe-06','riverfront-deluxe-07','riverfront-deluxe-08'
   );

-- Standard River: add units 13-21 to reach 21 total
INSERT INTO public.room_states (room_id, unit_label, state)
SELECT '3b476463-ea58-4d5b-abb4-ad460e844a8b',
       'standard-river-' || lpad(g::text, 2, '0'),
       'vacant_clean'
  FROM generate_series(13, 21) g
 WHERE NOT EXISTS (
   SELECT 1 FROM public.room_states
    WHERE room_id = '3b476463-ea58-4d5b-abb4-ad460e844a8b'
      AND unit_label = 'standard-river-' || lpad(g::text, 2, '0')
 );
