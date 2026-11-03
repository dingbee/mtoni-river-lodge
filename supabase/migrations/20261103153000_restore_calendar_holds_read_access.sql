-- Restore the read permission required by the unified reservation calendar.
-- RLS continues to restrict authenticated users to holds belonging to properties
-- they are entitled to access. This is a table privilege, not a tenant-policy bypass.
GRANT SELECT ON public.booking_holds TO authenticated;
