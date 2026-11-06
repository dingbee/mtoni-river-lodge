DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.resolve_staynas_published_room_pricing(uuid,uuid,date,date,integer,integer,integer,uuid,timestamp with time zone)'::regprocedure
  );

  v_old := '  v_uid uuid := auth.uid();';
  v_new := v_old || E'\n  v_publication_rate_plan_id uuid;';
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'SPE-04.07 patch precondition failed: declaration anchor missing';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := '  IF v_jwt_role IS DISTINCT FROM ''service_role'' THEN';
  v_new := E'  -- Public plan discovery returns a publication identifier in some client paths.\n' ||
    E'  -- Accept either the canonical rate_plan_id or its publication id, scoped to this property.\n' ||
    E'  IF _rate_plan_id IS NOT NULL AND NOT EXISTS (\n' ||
    E'    SELECT 1 FROM public.staynas_rate_plans p\n' ||
    E'    WHERE p.id = _rate_plan_id AND p.property_id = _property_id\n' ||
    E'  ) THEN\n' ||
    E'    SELECT pub.rate_plan_id INTO v_publication_rate_plan_id\n' ||
    E'    FROM public.staynas_rate_plan_publications pub\n' ||
    E'    WHERE pub.id = _rate_plan_id AND pub.property_id = _property_id\n' ||
    E'    ORDER BY pub.publication_number DESC LIMIT 1;\n' ||
    E'    IF FOUND THEN _rate_plan_id := v_publication_rate_plan_id; END IF;\n' ||
    E'  END IF;\n\n' || v_old;
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'SPE-04.07 patch precondition failed: authorization anchor missing';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$patch$;