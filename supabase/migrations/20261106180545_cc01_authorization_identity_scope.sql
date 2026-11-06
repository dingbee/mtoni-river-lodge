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

CREATE OR REPLACE FUNCTION public.checkin_eligibility_internal(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _b public.bookings%ROWTYPE;
  _r public.rooms%ROWTYPE;
  _fp text;
  _snap jsonb;
  _open_from date;
BEGIN
  SELECT * INTO _b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'We could not find this reservation.');
  END IF;

  SELECT * INTO _r FROM public.rooms WHERE id = _b.room_id;

  _fp := md5(coalesce(_b.status::text,'') || '|' || coalesce(_b.room_id::text,'') || '|' ||
             coalesce(_b.check_in::text,'') || '|' || coalesce(_b.check_out::text,''));
  _snap := jsonb_build_object(
    'fingerprint', _fp, 'status', _b.status, 'room_id', _b.room_id,
    'room_name', COALESCE(_r.name, 'Room'), 'check_in', _b.check_in, 'check_out', _b.check_out);

  IF _b.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code','cancelled','message','This reservation has been cancelled. Please contact the lodge.','snapshot',_snap);
  END IF;
  IF _b.status = 'checked_in' THEN
    RETURN jsonb_build_object('ok', false, 'code','already_checked_in','message','This reservation is already checked in.','snapshot',_snap);
  END IF;
  IF _b.status IN ('completed','no_show') THEN
    RETURN jsonb_build_object('ok', false, 'code','ineligible','message','This reservation is no longer eligible for online check-in.','snapshot',_snap);
  END IF;
  IF _b.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'code','not_confirmed','message','Your reservation is not confirmed yet. Online check-in opens once it is confirmed.','snapshot',_snap);
  END IF;
  IF _r.id IS NULL OR _r.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code','room_invalid','message','Your room assignment is being updated. Please contact the lodge.','snapshot',_snap);
  END IF;

  _open_from := _b.check_in - 3;
  IF current_date < _open_from THEN
    RETURN jsonb_build_object('ok', false, 'code','too_early',
      'message','Online check-in opens 3 days before arrival (' || to_char(_open_from,'DD Mon YYYY') || ').',
      'snapshot',_snap, 'opens_on', _open_from);
  END IF;
  IF current_date > _b.check_out THEN
    RETURN jsonb_build_object('ok', false, 'code','window_closed','message','The online check-in window for this stay has closed.','snapshot',_snap);
  END IF;

  RETURN jsonb_build_object('ok', true, 'code','eligible','message','Eligible for online check-in','snapshot',_snap);
END $function$;

REVOKE ALL ON FUNCTION public.checkin_eligibility_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_eligibility_internal(uuid) TO service_role;

-- Existing SECURITY DEFINER guest workflows have already validated the guest's
-- opaque check-in token. Route their internal eligibility check to the private
-- primitive so the public staff RPC can enforce property membership.
DO $block$
DECLARE
  v_function record;
  v_definition text;
BEGIN
  FOR v_function IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prosrc ILIKE '%public.checkin_eligibility(%'
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(v_definition, 'public.checkin_eligibility(', 'public.checkin_eligibility_internal(');
    EXECUTE v_definition;
  END LOOP;
END
$block$;

CREATE OR REPLACE FUNCTION public.checkin_eligibility(_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _property_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN public.checkin_eligibility_internal(_booking_id);
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT b.property_id INTO _property_id
  FROM public.bookings b
  WHERE b.id = _booking_id;

  IF _property_id IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT public.has_any_role(auth.uid(), ARRAY['owner','manager','reception','reservations']::public.app_role[]) THEN
    RAISE EXCEPTION 'Reservation eligibility access denied' USING ERRCODE = '42501';
  END IF;

  RETURN public.checkin_eligibility_internal(_booking_id);
END
$function$;

REVOKE ALL ON FUNCTION public.checkin_eligibility(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkin_eligibility(uuid) TO authenticated, service_role;
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
