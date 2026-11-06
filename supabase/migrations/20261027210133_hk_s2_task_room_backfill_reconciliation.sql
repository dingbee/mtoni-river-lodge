-- Recover room links for existing housekeeping tasks where the checkout task title
-- contains the immutable room unit label. Future tasks are linked at creation time.
UPDATE public.ops_tasks t
SET room_state_id = rs.id
FROM public.room_states rs
WHERE t.category = 'housekeeping'
  AND t.room_state_id IS NULL
  AND t.title LIKE 'Clean ' || rs.unit_label || ' after %';
