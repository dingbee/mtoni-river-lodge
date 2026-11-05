-- StayNas: read Supabase JWT role from both legacy and current PostgREST claim settings.
-- Service-role server functions must pass property-scoped RPC authorization without
-- weakening tenant checks for anon/authenticated callers.

DO $$
DECLARE
  v_definition text;
  v_old text := 'COALESCE(current_setting(''request.jwt.claim.role'', true), '''')';
  v_new text := 'COALESCE(NULLIF(current_setting(''request.jwt.claim.role'', true), ''''), (NULLIF(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''role''), '''')';
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_room_availability(date,date,uuid)'::regprocedure,
    'public.create_booking(text,date,date,integer,integer,text,text,text,jsonb,integer,integer,uuid,text,uuid)'::regprocedure
  ]
  LOOP
    v_definition := pg_get_functiondef(v_signature);
    IF position(v_old in v_definition) = 0 THEN
      RAISE EXCEPTION 'Expected legacy JWT role check not found in %', v_signature;
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
    EXECUTE v_definition;
  END LOOP;
END $$;
