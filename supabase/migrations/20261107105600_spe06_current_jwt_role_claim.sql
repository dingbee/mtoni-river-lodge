-- SPE-06 hardening: use the current JWT role claim for server-only RPC gates.
-- auth.role() is deprecated by Supabase; this preserves the same service-role
-- boundary while using the supported JWT helper.
BEGIN;
DO $migration$
DECLARE
  v_signature regprocedure;
  v_signature_text text;
  v_definition text;
  v_updated text;
BEGIN
  FOREACH v_signature_text IN ARRAY ARRAY[
    'public.staynas_create_reservation_quote(uuid,text,date,date,integer,integer,integer,jsonb,uuid,text,text,integer)',
    'public.staynas_create_reservation_from_quote(uuid,uuid,text,text,text,text,text,text,text,text,uuid,text,text,uuid,text,text)'
  ]
  LOOP
    v_signature := to_regprocedure(v_signature_text);
    IF v_signature IS NULL THEN
      RAISE EXCEPTION 'Required SPE-06 RPC is missing: %',v_signature_text;
    END IF;

    v_definition := pg_get_functiondef(v_signature);
    v_updated := replace(
      v_definition,
      'coalesce(auth.role(),'''')',
      'coalesce(auth.jwt()->>''role'','''')'
    );
    IF v_updated=v_definition THEN
      IF position('auth.jwt()->>''role''' in v_definition)=0 THEN
        RAISE EXCEPTION 'Expected service-role gate was not found in %',v_signature_text;
      END IF;
    ELSE
      EXECUTE v_updated;
    END IF;
  END LOOP;
END;
$migration$;
COMMIT;
