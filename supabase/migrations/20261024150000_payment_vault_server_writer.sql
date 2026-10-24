-- Vault-backed credential storage. This RPC is server-only and independently
-- verifies the tenant membership supplied by the authenticated server handler.
CREATE OR REPLACE FUNCTION public.staynas_create_payment_vault_secret(
  p_name text,
  p_secret text,
  p_property_id uuid,
  p_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF p_name IS NULL OR p_secret IS NULL OR length(p_secret) = 0 THEN
    RAISE EXCEPTION 'Secret name and value are required';
  END IF;
  IF p_name !~ '^staynas-payment-[0-9a-f-]{36}-pesapal-[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'Invalid secret name';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members m
    WHERE m.property_id = p_property_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
      AND m.role::text IN ('owner','manager','admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden: property admin membership required';
  END IF;

  SELECT vault.create_secret(p_secret, p_name, 'StayNas tenant-owned payment provider credential')
  INTO v_secret_id;
  RETURN v_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_create_payment_vault_secret(text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_create_payment_vault_secret(text,text,uuid,uuid) TO service_role;

COMMENT ON FUNCTION public.staynas_create_payment_vault_secret(text,text,uuid,uuid) IS
  'Server-only Vault writer. Server handler must authenticate caller; function independently enforces active property owner/manager membership. Secret values are never returned.';
