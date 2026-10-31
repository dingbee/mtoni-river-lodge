-- Restore authenticated read privileges required by the property-scoped calendar.
-- RLS policies remain the authority for which property rows can be read.
GRANT SELECT ON TABLE public.bookings TO authenticated;
GRANT SELECT ON TABLE public.room_inventory TO authenticated;
GRANT SELECT ON TABLE public.room_states TO authenticated;
