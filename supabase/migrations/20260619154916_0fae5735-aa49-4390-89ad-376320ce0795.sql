DROP POLICY IF EXISTS "Public read inventory" ON public.room_inventory;
REVOKE SELECT ON public.room_inventory FROM anon;