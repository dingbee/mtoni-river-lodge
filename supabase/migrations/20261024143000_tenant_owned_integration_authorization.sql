-- Tenant-owned integration setup boundary.
-- Secrets remain in Vault; no client-readable RPC returns secret material.
ALTER TABLE public.staynas_property_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_integrations_property_admin_select ON public.staynas_property_integrations;
CREATE POLICY staynas_integrations_property_admin_select
ON public.staynas_property_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staynas_property_members m
    WHERE m.property_id = staynas_property_integrations.property_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role::text IN ('owner', 'manager', 'admin')
  )
);

DROP POLICY IF EXISTS staynas_integrations_property_admin_insert ON public.staynas_property_integrations;
CREATE POLICY staynas_integrations_property_admin_insert
ON public.staynas_property_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staynas_property_members m
    WHERE m.property_id = staynas_property_integrations.property_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role::text IN ('owner', 'manager', 'admin')
  )
  AND (public_config - ARRAY[
    'secret','client_secret','consumer_secret','api_key','apiKey',
    'access_token','refresh_token','private_key','password','consumer_key'
  ]) = public_config
);

DROP POLICY IF EXISTS staynas_integrations_property_admin_update ON public.staynas_property_integrations;
CREATE POLICY staynas_integrations_property_admin_update
ON public.staynas_property_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staynas_property_members m
    WHERE m.property_id = staynas_property_integrations.property_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role::text IN ('owner', 'manager', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staynas_property_members m
    WHERE m.property_id = staynas_property_integrations.property_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role::text IN ('owner', 'manager', 'admin')
  )
  AND (public_config - ARRAY[
    'secret','client_secret','consumer_secret','api_key','apiKey',
    'access_token','refresh_token','private_key','password','consumer_key'
  ]) = public_config
);

-- Founder monitoring is served only through a separately authorized server route;
-- there is deliberately no cross-tenant SELECT policy for global administrators.
REVOKE ALL ON public.staynas_property_integrations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.staynas_property_integrations TO authenticated;

COMMENT ON TABLE public.staynas_property_integrations IS
  'Tenant-owned integration metadata. Credentials must be held in Vault or an external secret manager; Founder monitoring must be redacted and read-only.';
