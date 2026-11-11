-- StayNas: read Supabase JWT role from both legacy and current PostgREST claim settings.
-- Service-role server functions must pass property-scoped RPC authorization without
-- weakening tenant checks for anon/authenticated callers. Discover actual overloads
-- from the schema: function signatures evolved and are not stable across installations.

DO $$
DECLARE
  v_definition text;
  v_old text := 'COALESCE(current_setting(''request.jwt.claim.role'', true), '''')';
  v_new text := 'COALESCE(NULLIF(current_setting(''request.jwt.claim.role'', true), ''''), (NULLIF(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''role''), '''')';
  v_signature regprocedure;
BEGIN
  FOR v_signature IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_room_availability', 'create_booking')
     ORDER BY p.proname, p.oid
  LOOP
    v_definition := pg_get_functiondef(v_signature);
    IF position(v_old in v_definition) > 0 THEN
      v_definition := replace(v_definition, v_old, v_new);
      EXECUTE v_definition;
    END IF;
  END LOOP;
END $$;
