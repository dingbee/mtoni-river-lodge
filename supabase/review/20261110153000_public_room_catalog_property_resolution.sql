-- Public room catalogue property resolution and tenant isolation.
-- REVIEW ARTIFACT: apply only after the application changes in this branch pass CI.
BEGIN;

-- Public room data must be served through the hostname-scoped server API.
-- Authenticated staff retain read access only to properties they belong to.
DROP POLICY IF EXISTS "Public read active rooms" ON public.rooms;
DROP POLICY IF EXISTS "Public read active room categories" ON public.room_categories;

CREATE POLICY "Property members read active rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "Property members read active room categories"
  ON public.room_categories FOR SELECT TO authenticated
  USING (status = 'active' AND public.staynas_user_has_property_access(auth.uid(), property_id));

REVOKE ALL PRIVILEGES ON TABLE public.rooms, public.room_categories FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.rooms, public.room_categories TO authenticated, service_role;


-- Room configuration persistence and physical inventory reconciliation.
-- One property-authorized transaction writes the room definition and reconciles
-- its physical room units. Existing occupied/booked/blocked units are protected.
CREATE OR REPLACE FUNCTION public.save_platform_room_type_configuration(
  _property_id uuid, _id uuid, _slug text, _name text, _category_id uuid,
  _short_name text, _room_number_label text, _short_description text,
  _description text[], _details jsonb, _cta_line text,
  _capacity_adults integer, _capacity_children integer, _max_occupancy integer,
  _total_units integer, _base_price numeric, _currency text,
  _included_guests integer, _extra_guest_fee numeric, _status text,
  _sort_order integer, _hero_line text, _image_url text, _gallery_urls text[],
  _size_label text, _view_label text, _bed_label text, _bathroom_label text,
  _amenities text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  _room_id uuid;
  _old_units integer := 0;
  _remove_count integer := 0;
  _removable_units integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  THEN
    RAISE EXCEPTION 'Room configuration requires property manager access'
      USING ERRCODE = '42501';
  END IF;

  IF _slug IS NULL OR _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid room slug' USING ERRCODE = '22023';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'Room name is required' USING ERRCODE = '22023';
  END IF;
  IF _total_units IS NULL OR _total_units < 1 THEN
    RAISE EXCEPTION 'Room quantity must be at least 1' USING ERRCODE = '22023';
  END IF;
  IF _base_price IS NULL OR _base_price < 0 OR _extra_guest_fee IS NULL OR _extra_guest_fee < 0 THEN
    RAISE EXCEPTION 'Pricing cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF _capacity_adults < 1 OR _max_occupancy < _capacity_adults
     OR _capacity_children < 0 OR _included_guests < 1 OR _included_guests > _max_occupancy THEN
    RAISE EXCEPTION 'Invalid occupancy configuration' USING ERRCODE = '22023';
  END IF;
  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter ISO code' USING ERRCODE = '22023';
  END IF;
  IF _status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'Invalid room status' USING ERRCODE = '22023';
  END IF;

  IF _category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories
    WHERE id = _category_id AND property_id = _property_id AND status = 'active' AND configuration_source = 'tenant_configured'
  ) THEN
    RAISE EXCEPTION 'Room category not found in the selected property';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rooms
    WHERE property_id = _property_id AND slug = _slug AND (_id IS NULL OR id <> _id)
  ) THEN
    RAISE EXCEPTION 'Room slug already exists in this property';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.rooms (
      property_id, configuration_source, configured_by, configured_at,
      category_id, slug, name, short_name, room_number_label,
      short_description, description, details, cta_line, capacity_adults,
      capacity_children, max_occupancy, total_units, base_price, currency,
      included_guests, extra_guest_fee, status, sort_order, hero_line,
      image_url, gallery_urls, size_label, view_label, bed_label,
      bathroom_label, amenities
    ) VALUES (
      _property_id, 'tenant_configured', auth.uid(), now(),
      _category_id, _slug, btrim(_name), NULLIF(btrim(_short_name),''),
      NULLIF(btrim(_room_number_label),''), NULLIF(btrim(_short_description),''),
      COALESCE(_description,'{}'::text[]), COALESCE(_details,'[]'::jsonb),
      NULLIF(btrim(_cta_line),''), _capacity_adults, _capacity_children,
      _max_occupancy, _total_units, _base_price, _currency, _included_guests,
      _extra_guest_fee, _status, COALESCE(_sort_order,0), NULLIF(btrim(_hero_line),''),
      NULLIF(btrim(_image_url),''), COALESCE(_gallery_urls,'{}'),
      NULLIF(btrim(_size_label),''), NULLIF(btrim(_view_label),''),
      NULLIF(btrim(_bed_label),''), NULLIF(btrim(_bathroom_label),''),
      COALESCE(_amenities,'{}')
    ) RETURNING id INTO _room_id;
  ELSE
    SELECT total_units INTO _old_units
    FROM public.rooms
    WHERE id = _id AND property_id = _property_id AND configuration_source = 'tenant_configured'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Room not found in selected property';
    END IF;

    UPDATE public.rooms SET
      configuration_source = 'tenant_configured',
      configured_by = auth.uid(),
      configured_at = now(),
      category_id = _category_id, slug = _slug, name = btrim(_name),
      short_name = NULLIF(btrim(_short_name),''),
      room_number_label = NULLIF(btrim(_room_number_label),''),
      short_description = NULLIF(btrim(_short_description),''),
      description = COALESCE(_description,'{}'::text[]),
      details = COALESCE(_details,'[]'::jsonb),
      cta_line = NULLIF(btrim(_cta_line),''),
      capacity_adults = _capacity_adults, capacity_children = _capacity_children,
      max_occupancy = _max_occupancy, total_units = _total_units,
      base_price = _base_price, currency = _currency,
      included_guests = _included_guests, extra_guest_fee = _extra_guest_fee,
      status = _status, sort_order = COALESCE(_sort_order,0),
      hero_line = NULLIF(btrim(_hero_line),''), image_url = NULLIF(btrim(_image_url),''),
      gallery_urls = COALESCE(_gallery_urls,'{}'),
      size_label = NULLIF(btrim(_size_label),''), view_label = NULLIF(btrim(_view_label),''),
      bed_label = NULLIF(btrim(_bed_label),''), bathroom_label = NULLIF(btrim(_bathroom_label),''),
      amenities = COALESCE(_amenities,'{}')
    WHERE id = _id AND property_id = _property_id AND configuration_source = 'tenant_configured'
    RETURNING id INTO _room_id;
  END IF;

  IF _total_units > _old_units THEN
    INSERT INTO public.room_states(property_id, room_id, unit_label)
    SELECT _property_id, _room_id, _slug || '-' || lpad(gs::text,2,'0')
    FROM generate_series(_old_units + 1, _total_units) AS gs;
  ELSIF _total_units < _old_units THEN
    _remove_count := _old_units - _total_units;
    SELECT count(*) INTO _removable_units
    FROM public.room_states
    WHERE property_id = _property_id AND room_id = _room_id
      AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty');

    IF _removable_units < _remove_count THEN
      RAISE EXCEPTION 'Cannot reduce quantity: physical room units are booked, occupied, blocked or otherwise protected';
    END IF;

    DELETE FROM public.room_states
    WHERE id IN (
      SELECT id FROM public.room_states
      WHERE property_id = _property_id AND room_id = _room_id
        AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty')
      ORDER BY unit_label DESC
      LIMIT _remove_count
    );
  END IF;

  RETURN _room_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.save_platform_room_type_configuration(
  uuid,uuid,text,text,uuid,text,text,text,text[],jsonb,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text,text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_room_type_configuration(
  uuid,uuid,text,text,uuid,text,text,text,text[],jsonb,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text,text[]
) TO authenticated, service_role;

COMMIT;
