-- Keep the existing property-scoped RLS policies in force.
-- Staff creation patches only these operational fields after the SECURITY DEFINER RPC.
GRANT UPDATE (source, status, payment_status, confirmed_at, payment_method, notes)
ON TABLE public.bookings TO authenticated;
