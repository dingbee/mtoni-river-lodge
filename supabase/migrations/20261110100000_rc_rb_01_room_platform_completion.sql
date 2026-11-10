-- RC-RB-01: platform-safe public room catalogue and transactional room inventory.
-- This migration is additive. It does not seed or modify any tenant/property records.

CREATE OR REPLACE FUNCTION public.staynas_resolve_public_property(_hostname text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hostname text;
  v_count integer;
  v_property_id uuid;
BEGIN
  v_hostname := lower(trim(both '.' from split_part(trim(COALESCE(_hostname,'')), ':', 1)));
  IF v_hostname = '' OR v_hostname !~ '^[a-z0-9.-]+$' THEN
    RETURN NULL;
  END IF;

  SELECT count(*), (array_agg(d.property_id))[1]
    INTO v_count, v_property_id
  FROM public.staynas_property_domains d
  JOIN public.staynas_properties p ON p.id = d.property_id
  WHERE lower(d.hostname) = v_hostname
    AND d.verification_status = 'verified'
    AND d.verified_at IS NOT NULL
    AND p.status = 'active';

  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;
  RETURN v_property_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_get_public_room_catalog(
  _hostname text,
  _slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_property_id uuid;
  v_rooms jsonb;
BEGIN
  v_property_id := public.staynas_resolve_public_property(_hostname);
  IF v_property_id IS NULL THEN
    RETURN jsonb_build_object('rooms','[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',r.id,
      'slug',r.slug,
      'name',r.name,
      'short_name',r.short_name,
      'room_number_label',r.room_number_label,
      'short_description',r.short_description,
      'description',r.description,
      'details',r.details,
      'cta_line',r.cta_line,
      'capacity_adults',r.capacity_adults,
      'capacity_children',r.capacity_children,
      'max_occupancy',r.max_occupancy,
      'total_units',r.total_units,
      'currency',r.currency,
      'included_guests',r.included_guests,
      'extra_guest_fee',r.extra_guest_fee,
      'hero_line',r.hero_line,
      'image_url',r.image_url,
      'gallery_urls',r.gallery_urls,
      'size_label',r.size_label,
      'view_label',r.view_label,
      'bed_label',r.bed_label,
      'bathroom_label',r.bathroom_label,
      'amenities',r.amenities,
      'category',CASE WHEN c.id IS NULL OR c.status <> 'active' THEN NULL ELSE
        jsonb_build_object(
          'id',c.id,'slug',c.slug,'name',c.name,'description',c.description,
          'features',c.features,'specifications',c.specifications
        ) END
    ) ORDER BY r.sort_order,r.name
  ),'[]'::jsonb)
  INTO v_rooms
  FROM public.rooms r
  LEFT JOIN public.room_categories c
    ON c.id=r.category_id AND c.property_id=r.property_id
  WHERE r.property_id=v_property_id
    AND r.status='active'
    AND (_slug IS NULL OR r.slug=_slug);

  RETURN jsonb_build_object('property_id',v_property_id,'rooms',v_rooms);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_get_public_room_status(
  _hostname text,
  _date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_property_id uuid;
  v_rooms jsonb;
BEGIN
  IF _date IS NULL THEN
    RAISE EXCEPTION 'A valid inventory date is required';
  END IF;
  v_property_id := public.staynas_resolve_public_property(_hostname);
  IF v_property_id IS NULL THEN
    RETURN jsonb_build_object('date',_date,'rooms','[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'slug',r.slug,
      'name',r.name,
      'total_units',r.total_units,
      'available_units',GREATEST(
        COALESCE(i.available_units,r.total_units)
        - LEAST(
            COALESCE(i.available_units,r.total_units),
            COALESCE(blocks.blocked_units,0)
          )
        - COALESCE(holds.hold_count,0),
        0
      ),
      'is_available',(
        NOT COALESCE(i.is_blocked,false)
        AND COALESCE(i.available_units,r.total_units)
          - LEAST(COALESCE(i.available_units,r.total_units),COALESCE(blocks.blocked_units,0))
          - COALESCE(holds.hold_count,0) > 0
      )
    ) ORDER BY r.sort_order,r.name
  ),'[]'::jsonb)
  INTO v_rooms
  FROM public.rooms r
  LEFT JOIN public.room_inventory i ON i.room_id=r.id AND i.date=_date
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS blocked_units
    FROM public.room_states rs
    WHERE rs.room_id=r.id
      AND rs.property_id=r.property_id
      AND rs.booking_id IS NULL
      AND rs.state::text IN ('vacant_dirty','inspection','maintenance','out_of_service')
  ) blocks ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS hold_count
    FROM public.booking_holds h
    WHERE h.room_id=r.id
      AND h.status='active'
      AND h.expires_at>now()
      AND h.check_in<=_date
      AND h.check_out>_date
  ) holds ON true
  WHERE r.property_id=v_property_id AND r.status='active';

  RETURN jsonb_build_object('property_id',v_property_id,'date',_date,'rooms',v_rooms);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_save_room_type_configuration(_room jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_property_id uuid;
  v_room_id uuid := NULLIF(_room->>'id','')::uuid;
  v_category_id uuid := NULLIF(_room->>'category_id','')::uuid;
  v_slug text := trim(COALESCE(_room->>'slug',''));
  v_name text := trim(COALESCE(_room->>'name',''));
  v_currency text;
  v_status text := CASE WHEN _room->>'status' IN ('archived','inactive') THEN 'inactive' ELSE 'active' END;
  v_total_units integer := COALESCE(NULLIF(_room->>'total_units','')::integer,1);
  v_old_count integer := 0;
  v_actual_count integer := 0;
  v_delta integer := 0;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_capacity_adults integer := COALESCE(NULLIF(_room->>'capacity_adults','')::integer,2);
  v_capacity_children integer := COALESCE(NULLIF(_room->>'capacity_children','')::integer,0);
  v_max_occupancy integer := COALESCE(NULLIF(_room->>'max_occupancy','')::integer,2);
  v_included_guests integer := COALESCE(NULLIF(_room->>'included_guests','')::integer,2);
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor,ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Room configuration requires owner, manager or admin access' USING ERRCODE='42501';
  END IF;
  v_property_id := public.staynas_active_property_id(v_actor);
  IF v_property_id IS NULL OR NOT public.staynas_user_has_property_access(v_actor,v_property_id) THEN
    RAISE EXCEPTION 'No authorised active property context' USING ERRCODE='42501';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR v_name='' THEN
    RAISE EXCEPTION 'A valid room slug and name are required';
  END IF;
  IF v_total_units < 1 OR v_capacity_adults < 1 OR v_capacity_children < 0
     OR v_max_occupancy < v_capacity_adults OR v_max_occupancy < 1
     OR v_included_guests < 1 OR v_included_guests > v_max_occupancy THEN
    RAISE EXCEPTION 'Invalid room quantity or occupancy configuration';
  END IF;
  IF COALESCE((_room->>'base_price')::numeric,0) < 0
     OR COALESCE((_room->>'extra_guest_fee')::numeric,0) < 0 THEN
    RAISE EXCEPTION 'Room prices cannot be negative';
  END IF;

  IF v_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories c
    WHERE c.id=v_category_id AND c.property_id=v_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Selected category is not active in the current property';
  END IF;

  IF v_room_id IS NOT NULL THEN
    SELECT total_units,currency INTO v_old_count,v_currency
    FROM public.rooms
    WHERE id=v_room_id AND property_id=v_property_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Room does not belong to the active property';
    END IF;
  ELSE
    SELECT currency INTO v_currency FROM public.staynas_properties WHERE id=v_property_id;
  END IF;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'The property must have an explicit ISO currency before room configuration';
  END IF;

  IF v_room_id IS NULL THEN
    INSERT INTO public.rooms(
      property_id,category_id,slug,name,short_name,room_number_label,short_description,
      description,details,cta_line,capacity_adults,capacity_children,max_occupancy,total_units,
      base_price,currency,included_guests,extra_guest_fee,status,sort_order,hero_line,image_url,
      gallery_urls,size_label,view_label,bed_label,bathroom_label,amenities
    ) VALUES (
      v_property_id,v_category_id,v_slug,v_name,NULLIF(trim(COALESCE(_room->>'short_name','')),''),
      NULLIF(trim(COALESCE(_room->>'room_number_label','')),''),
      NULLIF(trim(COALESCE(_room->>'short_description','')),''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(_room->'description','[]'::jsonb))),
      COALESCE(_room->'details','[]'::jsonb),
      NULLIF(trim(COALESCE(_room->>'cta_line','')),''),
      v_capacity_adults,v_capacity_children,v_max_occupancy,v_total_units,
      COALESCE((_room->>'base_price')::numeric,0),v_currency,v_included_guests,
      COALESCE((_room->>'extra_guest_fee')::numeric,0),v_status,
      COALESCE((_room->>'sort_order')::integer,0),
      NULLIF(trim(COALESCE(_room->>'hero_line','')),''),
      NULLIF(trim(COALESCE(_room->>'image_url','')),''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(_room->'gallery_urls','[]'::jsonb))),
      NULLIF(trim(COALESCE(_room->>'size_label','')),''),
      NULLIF(trim(COALESCE(_room->>'view_label','')),''),
      NULLIF(trim(COALESCE(_room->>'bed_label','')),''),
      NULLIF(trim(COALESCE(_room->>'bathroom_label','')),''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(_room->'amenities','[]'::jsonb)))
    ) RETURNING id INTO v_room_id;
  ELSE
    UPDATE public.rooms SET
      category_id=v_category_id,slug=v_slug,name=v_name,
      short_name=NULLIF(trim(COALESCE(_room->>'short_name','')),''),
      room_number_label=NULLIF(trim(COALESCE(_room->>'room_number_label','')),''),
      short_description=NULLIF(trim(COALESCE(_room->>'short_description','')),''),
      description=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_room->'description','[]'::jsonb))),
      details=COALESCE(_room->'details','[]'::jsonb),
      cta_line=NULLIF(trim(COALESCE(_room->>'cta_line','')),''),
      capacity_adults=v_capacity_adults,capacity_children=v_capacity_children,
      max_occupancy=v_max_occupancy,total_units=v_total_units,
      base_price=COALESCE((_room->>'base_price')::numeric,0),
      included_guests=v_included_guests,
      extra_guest_fee=COALESCE((_room->>'extra_guest_fee')::numeric,0),
      status=v_status,sort_order=COALESCE((_room->>'sort_order')::integer,0),
      hero_line=NULLIF(trim(COALESCE(_room->>'hero_line','')),''),
      image_url=NULLIF(trim(COALESCE(_room->>'image_url','')),''),
      gallery_urls=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_room->'gallery_urls','[]'::jsonb))),
      size_label=NULLIF(trim(COALESCE(_room->>'size_label','')),''),
      view_label=NULLIF(trim(COALESCE(_room->>'view_label','')),''),
      bed_label=NULLIF(trim(COALESCE(_room->>'bed_label','')),''),
      bathroom_label=NULLIF(trim(COALESCE(_room->>'bathroom_label','')),''),
      amenities=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_room->'amenities','[]'::jsonb)))
    WHERE id=v_room_id AND property_id=v_property_id;
  END IF;

  SELECT count(*) INTO v_actual_count FROM public.room_states
  WHERE room_id=v_room_id AND property_id=v_property_id;

  v_delta := v_total_units-v_actual_count;
  IF v_delta < 0 THEN
    v_delta := abs(v_delta);
    IF EXISTS (
      SELECT 1 FROM public.booking_holds h
      WHERE h.room_id=v_room_id AND h.status='active' AND h.expires_at>now()
    ) OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id=v_room_id AND b.check_out>CURRENT_DATE
        AND b.status::text NOT IN ('cancelled','completed','no_show')
    ) THEN
      RAISE EXCEPTION 'Cannot reduce room quantity while active holds or future bookings exist';
    END IF;
    IF (SELECT count(*) FROM public.room_states rs
        WHERE rs.room_id=v_room_id AND rs.property_id=v_property_id
          AND rs.booking_id IS NULL AND rs.state::text IN ('vacant_clean','vacant_dirty')) < v_delta THEN
      RAISE EXCEPTION 'Cannot reduce quantity: occupied or protected physical units remain';
    END IF;
    DELETE FROM public.room_states rs
    WHERE rs.id IN (
      SELECT candidate.id FROM public.room_states candidate
      WHERE candidate.room_id=v_room_id AND candidate.property_id=v_property_id
        AND candidate.booking_id IS NULL
        AND candidate.state::text IN ('vacant_clean','vacant_dirty')
      ORDER BY candidate.created_at DESC,candidate.id
      LIMIT v_delta
      FOR UPDATE
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> v_delta THEN
      RAISE EXCEPTION 'Physical unit reconciliation was incomplete';
    END IF;
  ELSIF v_delta > 0 THEN
    WITH candidates AS (
      SELECT g.n,(v_slug || '-' || lpad(g.n::text,2,'0')) AS label
      FROM generate_series(1,10000) g(n)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.room_states rs
        WHERE rs.room_id=v_room_id AND rs.unit_label=(v_slug || '-' || lpad(g.n::text,2,'0'))
      )
      ORDER BY g.n
      LIMIT v_delta
    )
    INSERT INTO public.room_states(room_id,property_id,unit_label)
    SELECT v_room_id,v_property_id,label FROM candidates
    ON CONFLICT (room_id,unit_label) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_delta THEN
      RAISE EXCEPTION 'Physical unit provisioning was incomplete';
    END IF;
  END IF;

  RETURN v_room_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_manage_room_unit(
  _action text,
  _room_id uuid,
  _unit_id uuid DEFAULT NULL,
  _unit_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_property_id uuid;
  v_room_state public.room_states%ROWTYPE;
  v_result uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_any_role(v_actor,ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Room unit management requires owner, manager or admin access' USING ERRCODE='42501';
  END IF;
  v_property_id := public.staynas_active_property_id(v_actor);
  IF v_property_id IS NULL OR NOT public.staynas_user_has_property_access(v_actor,v_property_id) THEN
    RAISE EXCEPTION 'No authorised active property context' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id=_room_id AND property_id=v_property_id) THEN
    RAISE EXCEPTION 'Room type does not belong to the active property';
  END IF;

  IF _action='create' THEN
    IF NULLIF(trim(COALESCE(_unit_label,'')),'') IS NULL THEN
      RAISE EXCEPTION 'A physical unit label is required';
    END IF;
    INSERT INTO public.room_states(room_id,property_id,unit_label)
    VALUES (_room_id,v_property_id,trim(_unit_label))
    RETURNING id INTO v_result;
    UPDATE public.rooms SET total_units=total_units+1 WHERE id=_room_id AND property_id=v_property_id;
    RETURN v_result;
  ELSIF _action='rename' THEN
    SELECT * INTO v_room_state FROM public.room_states
    WHERE id=_unit_id AND room_id=_room_id AND property_id=v_property_id
    FOR UPDATE;
    IF NOT FOUND OR v_room_state.booking_id IS NOT NULL THEN
      RAISE EXCEPTION 'Physical unit is missing or currently assigned';
    END IF;
    IF NULLIF(trim(COALESCE(_unit_label,'')),'') IS NULL THEN
      RAISE EXCEPTION 'A physical unit label is required';
    END IF;
    UPDATE public.room_states SET unit_label=trim(_unit_label)
    WHERE id=_unit_id AND room_id=_room_id AND property_id=v_property_id
    RETURNING id INTO v_result;
    RETURN v_result;
  ELSIF _action='delete' THEN
    SELECT * INTO v_room_state FROM public.room_states
    WHERE id=_unit_id AND room_id=_room_id AND property_id=v_property_id
    FOR UPDATE;
    IF NOT FOUND OR v_room_state.booking_id IS NOT NULL
       OR v_room_state.state::text NOT IN ('vacant_clean','vacant_dirty') THEN
      RAISE EXCEPTION 'Only unassigned clean or dirty units can be removed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.booking_holds h
      WHERE h.room_id=_room_id AND h.status='active' AND h.expires_at>now())
      OR EXISTS (SELECT 1 FROM public.bookings b
      WHERE b.room_id=_room_id AND b.check_out>CURRENT_DATE
        AND b.status::text NOT IN ('cancelled','completed','no_show')) THEN
      RAISE EXCEPTION 'Cannot remove a unit while active holds or future bookings exist';
    END IF;
    IF (SELECT total_units FROM public.rooms WHERE id=_room_id AND property_id=v_property_id) <= 1 THEN
      RAISE EXCEPTION 'A room type must retain at least one physical unit; archive the room type instead';
    END IF;
    DELETE FROM public.room_states WHERE id=_unit_id AND room_id=_room_id AND property_id=v_property_id;
    UPDATE public.rooms SET total_units=total_units-1 WHERE id=_room_id AND property_id=v_property_id;
    RETURN _unit_id;
  END IF;
  RAISE EXCEPTION 'Unsupported room unit action';
END;
$function$;

-- Public guest access is through the hostname-bound SECURITY DEFINER RPCs only.
DROP POLICY IF EXISTS "Public read active rooms" ON public.rooms;
DROP POLICY IF EXISTS "Public read active room categories" ON public.room_categories;
REVOKE SELECT ON public.rooms, public.room_categories FROM anon;

DROP POLICY IF EXISTS "Staff read own property active rooms" ON public.rooms;
CREATE POLICY "Staff read own property active rooms"
ON public.rooms FOR SELECT TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(),property_id));

DROP POLICY IF EXISTS "Staff read own property active room categories" ON public.room_categories;
CREATE POLICY "Staff read own property active room categories"
ON public.room_categories FOR SELECT TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(),property_id));

REVOKE ALL ON FUNCTION public.staynas_resolve_public_property(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staynas_get_public_room_catalog(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staynas_get_public_room_status(text,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staynas_save_room_type_configuration(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staynas_manage_room_unit(text,uuid,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.staynas_resolve_public_property(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_get_public_room_catalog(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_get_public_room_status(text,date) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_save_room_type_configuration(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_manage_room_unit(text,uuid,uuid,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.staynas_get_public_room_pricing(
  _hostname text,
  _check_in date,
  _check_out date,
  _adults integer DEFAULT 2,
  _children_below_6 integer DEFAULT 0,
  _children_7_plus integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_property_id uuid;
  v_rooms jsonb;
BEGIN
  IF _check_in IS NULL OR _check_out IS NULL OR _check_out <= _check_in
     OR COALESCE(_adults,0)<1 OR COALESCE(_children_below_6,0)<0 OR COALESCE(_children_7_plus,0)<0 THEN
    RAISE EXCEPTION 'A valid stay and occupancy are required';
  END IF;
  v_property_id := public.staynas_resolve_public_property(_hostname);
  IF v_property_id IS NULL THEN
    RETURN jsonb_build_object('check_in',_check_in,'check_out',_check_out,'rooms','[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room_id',a.room_id,
    'slug',a.slug,
    'name',a.name,
    'currency',a.currency,
    'price_total',a.nightly_total,
    'nights',a.nights,
    'available_units',a.min_available,
    'is_available',a.is_available,
    'fits_occupancy',a.fits_occupancy,
    'pricing',a.pricing_quote
  ) ORDER BY a.slug),'[]'::jsonb)
  INTO v_rooms
  FROM public.get_staynas_room_availability_priced(
    _check_in,_check_out,v_property_id,_adults,_children_below_6,_children_7_plus
  ) a;

  RETURN jsonb_build_object(
    'property_id',v_property_id,
    'check_in',_check_in,
    'check_out',_check_out,
    'rooms',v_rooms
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_get_public_room_pricing(text,date,date,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staynas_get_public_room_pricing(text,date,date,integer,integer,integer) TO anon,authenticated;
