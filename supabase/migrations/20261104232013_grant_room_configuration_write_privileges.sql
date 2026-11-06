-- Allow authenticated room administrators to create and update room types.
-- Row-level security remains the tenant/property authorization boundary.
GRANT SELECT, INSERT, UPDATE ON TABLE public.rooms TO authenticated;