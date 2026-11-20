-- Prevent publication of empty or unpriced rate plans.
CREATE OR REPLACE FUNCTION public.capture_staynas_rate_plan_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resolved jsonb;
  v_data jsonb;
  v_assignments jsonb;
  v_publication_number integer;
  v_published_at timestamptz;
  v_published_by uuid;
  v_hash text;
  v_assignment record;
  v_has_rate boolean;
  v_currency text;
BEGIN
  IF OLD.publication_status='published'
     OR NEW.publication_status<>'published'
     OR NEW.active IS DISTINCT FROM true THEN RETURN NEW; END IF;

  v_resolved := public.resolve_staynas_rate_plan_inheritance(NEW.property_id,NEW.id);
  v_data := COALESCE(v_resolved->'resolved_data','{}'::jsonb);
  v_currency := upper(NEW.currency);
  IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' OR v_data='{}'::jsonb THEN
    RAISE EXCEPTION 'Cannot publish a rate plan without resolved commercial pricing';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room_type_id',a.room_type_id,'name',c.name,'slug',c.slug,'display_order',a.display_order
  ) ORDER BY a.display_order,c.name),'[]'::jsonb)
  INTO v_assignments
  FROM public.staynas_rate_plan_room_types a
  JOIN public.staynas_room_catalogue_types c ON c.id=a.room_type_id
  WHERE a.property_id=NEW.property_id AND a.rate_plan_id=NEW.id AND a.active=true;

  IF jsonb_array_length(v_assignments)=0 THEN
    RAISE EXCEPTION 'A published rate plan must have at least one active room-type assignment';
  END IF;

  FOR v_assignment IN
    SELECT a.room_type_id::text AS room_type_id
    FROM public.staynas_rate_plan_room_types a
    WHERE a.property_id=NEW.property_id AND a.rate_plan_id=NEW.id AND a.active=true
  LOOP
    v_has_rate := false;
    IF jsonb_typeof(v_data->'base_rates')='object'
       AND jsonb_typeof(v_data->'base_rates'->v_assignment.room_type_id)='object'
       AND (v_data->'base_rates'->v_assignment.room_type_id->>'nightly_rate') ~ '^[0-9]+([.][0-9]+)?$'
       AND (v_data->'base_rates'->v_assignment.room_type_id->>'nightly_rate')::numeric > 0
       AND upper(v_data->'base_rates'->v_assignment.room_type_id->>'currency')=v_currency THEN
      v_has_rate := true;
    END IF;
    IF NOT v_has_rate AND jsonb_typeof(v_data->'daily_rates')='object' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_each(v_data->'daily_rates') d(date_key,room_rates)
        WHERE jsonb_typeof(room_rates->v_assignment.room_type_id)='object'
          AND COALESCE((room_rates->v_assignment.room_type_id->>'active')::boolean,false)
          AND (room_rates->v_assignment.room_type_id->>'nightly_rate') ~ '^[0-9]+([.][0-9]+)?$'
          AND (room_rates->v_assignment.room_type_id->>'nightly_rate')::numeric > 0
          AND upper(room_rates->v_assignment.room_type_id->>'currency')=v_currency
      ) INTO v_has_rate;
    END IF;
    IF NOT v_has_rate AND jsonb_typeof(v_data->'seasonal_rates')='object' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_each(v_data->'seasonal_rates') s(season_key,season)
        WHERE COALESCE((season->>'active')::boolean,false)
          AND season->'room_type_ids' @> jsonb_build_array(v_assignment.room_type_id)
          AND (season->>'nightly_rate') ~ '^[0-9]+([.][0-9]+)?$'
          AND (season->>'nightly_rate')::numeric > 0
          AND upper(season->>'currency')=v_currency
      ) INTO v_has_rate;
    END IF;
    IF NOT v_has_rate AND jsonb_typeof(v_data->'occupancy_rules')='object' THEN
      v_has_rate := COALESCE(jsonb_typeof(v_data->'occupancy_rules'->v_assignment.room_type_id)='object',false);
    END IF;
    IF NOT v_has_rate THEN
      RAISE EXCEPTION 'Cannot publish: assigned room type % has no valid positive rate in %',v_assignment.room_type_id,v_currency;
    END IF;
  END LOOP;

  SELECT COALESCE(MAX(publication_number),0)+1 INTO v_publication_number
  FROM public.staynas_rate_plan_publications
  WHERE property_id=NEW.property_id AND rate_plan_id=NEW.id;
  v_published_at := COALESCE(NEW.published_at,now());
  v_published_by := COALESCE(NEW.published_by,auth.uid());
  v_hash := md5(jsonb_build_object(
    'property_id',NEW.property_id,'rate_plan_id',NEW.id,
    'publication_number',v_publication_number,'rate_plan_version',NEW.version,
    'resolved_data',v_data,'inheritance_trace',v_resolved->'inheritance_trace',
    'lineage',v_resolved->'lineage','own_policy',v_resolved->'own_policy',
    'room_type_assignments',v_assignments,'effective_from',NEW.effective_from,
    'effective_to',NEW.effective_to
  )::text);

  INSERT INTO public.staynas_rate_plan_publications(
    property_id,rate_plan_id,publication_number,rate_plan_version,code,name,currency,
    effective_from,effective_to,published_by,published_at,resolved_data,
    inheritance_trace,lineage,own_policy,room_type_assignments,snapshot_hash
  ) VALUES (
    NEW.property_id,NEW.id,v_publication_number,NEW.version,NEW.code,NEW.name,NEW.currency,
    NEW.effective_from,NEW.effective_to,v_published_by,v_published_at,v_data,
    v_resolved->'inheritance_trace',v_resolved->'lineage',v_resolved->'own_policy',
    v_assignments,v_hash
  );
  RETURN NEW;
END;
$function$;