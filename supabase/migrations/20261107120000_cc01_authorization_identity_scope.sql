-- CC-01: close cross-user authorization helper probes and remove direct RPC access to trigger/internal functions.
-- Additive hardening only. No role, membership, property, booking, or guest data is modified.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = ANY(_roles)
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role IN ('owner','manager','reception','marketing','housekeeping','finance','admin','reservations','editor')
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.is_guest_pii_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role IN ('owner','manager','admin','reception','reservations')
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role IN ('admin'::public.app_role,'reservations'::public.app_role,'owner'::public.app_role,'manager'::public.app_role)
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.housekeeping_is_supervisor(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _uid IS NULL
      OR (auth.uid() IS DISTINCT FROM _uid AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE public.has_any_role(_uid, ARRAY['owner','manager','admin']::public.app_role[])
  END
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _user_id AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE public.has_any_role(_user_id, ARRAY['owner','admin','manager']::public.app_role[])
  END
$function$;

CREATE OR REPLACE FUNCTION public.staynas_user_has_property_access(_uid uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _uid IS NULL OR _property_id IS NULL
      OR (auth.uid() IS DISTINCT FROM _uid AND COALESCE(auth.role(), '') <> 'service_role')
    THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.staynas_property_members pm
      WHERE pm.user_id = _uid
        AND pm.property_id = _property_id
        AND pm.status = 'active'
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.staynas_active_property_id(_uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _uid IS NULL
      OR (auth.uid() IS DISTINCT FROM _uid AND COALESCE(auth.role(), '') <> 'service_role')
    THEN NULL::uuid
    ELSE COALESCE(
      (
        SELECT c.property_id
        FROM public.staynas_user_property_context c
        WHERE c.user_id = _uid
          AND public.staynas_user_has_property_access(_uid, c.property_id)
        LIMIT 1
      ),
      (
        SELECT pm.property_id
        FROM public.staynas_property_members pm
        JOIN public.staynas_properties p ON p.id = pm.property_id
        WHERE pm.user_id = _uid
          AND pm.status = 'active'
          AND p.status = 'active'
        ORDER BY p.created_at, p.id
        LIMIT 1
      )
    )
  END
$function$;

-- These are authorization helpers, not public discovery endpoints.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_any_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_guest_pii_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.housekeeping_is_supervisor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_user_has_property_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_active_property_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_any_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_guest_pii_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.housekeeping_is_supervisor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_user_has_property_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_active_property_id(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_roles() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.restaurant_can_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_can_write(uuid, public.restaurant_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_can_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_can_write(uuid, public.restaurant_role[]) TO authenticated, service_role;

-- checkin_eligibility accepts a booking UUID, not a bearer token. It is an internal
-- primitive used by token-validated guest check-in functions and must not be an RPC.
REVOKE ALL ON FUNCTION public.checkin_eligibility(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_eligibility(uuid) TO service_role;

-- Trigger functions are invoked by PostgreSQL triggers; direct RPC execution is never needed.
REVOKE ALL ON FUNCTION public.bookings_link_guest() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_staynas_rate_plan_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_exception_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_inspection_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_room_state_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_task_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_enforce_hold_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_enforce_ops_task_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_set_guest_child_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_staynas_rate_plan_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_staynas_rate_plan_room_type() FROM PUBLIC, anon, authenticated;
