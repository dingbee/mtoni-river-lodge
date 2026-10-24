-- Read decrypted payment credentials only through a narrowly scoped server-role RPC.
-- No browser role is granted execute permission.
CREATE OR REPLACE FUNCTION public.staynas_read_payment_vault_secret(p_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_secret_id IS NULL THEN
    RAISE EXCEPTION 'Secret ID is required';
  END IF;
  SELECT ds.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = p_secret_id;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Secret not found';
  END IF;
  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.staynas_read_payment_vault_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_read_payment_vault_secret(uuid) TO service_role;

COMMENT ON FUNCTION public.staynas_read_payment_vault_secret(uuid) IS
  'Server-only credential resolver. Never grant to authenticated/anon and never return this value to browser clients.';
