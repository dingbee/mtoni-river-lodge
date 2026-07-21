-- Migrate legacy 'admin' role assignments to 'owner'.
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'owner'::public.app_role FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;
DELETE FROM public.user_roles WHERE role = 'admin';