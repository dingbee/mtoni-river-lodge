-- SN-IQ-04 prerequisite: active-property authorization helpers.
-- Uses the existing property-context and active-membership model; no tenant bypass.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_ai_property_in_active_context(
  p_property_id uuid,
  p_allowed_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_user_property_context c
    JOIN public.staynas_property_members pm
      ON pm.user_id = c.user_id
     AND pm.property_id = c.property_id
    WHERE c.user_id = auth.uid()
      AND c.property_id = p_property_id
      AND pm.status = 'active'
      AND pm.role = ANY(p_allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.staynas_ai_session_in_active_property(
  p_session_id uuid,
  p_allowed_roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ai_concierge_sessions s
    WHERE s.id = p_session_id
      AND public.staynas_ai_property_in_active_context(s.property_id, p_allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.staynas_ai_property_in_active_context(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_ai_session_in_active_property(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_ai_property_in_active_context(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staynas_ai_session_in_active_property(uuid, public.app_role[]) TO authenticated, service_role;

COMMIT;