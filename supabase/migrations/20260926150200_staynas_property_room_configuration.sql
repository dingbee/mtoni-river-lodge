-- StayNas property/room hardening: property-aware room configuration and staff bootstrap.

GRANT EXECUTE ON FUNCTION public.staynas_active_property_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staynas_bootstrap_property_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _property_id uuid;
BEGIN
  IF NEW.role NOT IN ('owner','manager','reception','housekeeping','finance','admin','reservations','editor','marketing') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _property_id
  FROM public.staynas_properties
  WHERE slug = 'staynas-demo-property'
  LIMIT 1;

  IF _property_id IS NOT NULL THEN
    INSERT INTO public.staynas_property_members(property_id, user_id, role)
    VALUES (_property_id, NEW.user_id, NEW.role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staynas_user_role_property_bootstrap ON public.user_roles;
CREATE TRIGGER staynas_user_role_property_bootstrap
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.staynas_bootstrap_property_membership();

CREATE OR REPLACE FUNCTION public.save_room_type_configuration(
  _property_id uuid,
  _id uuid,
  _slug text,
  _name text,
  _category_id uuid,
  _short_description text,
  _capacity_adults integer,
  _capacity_children integer,
  _max_occupancy integer,
  _total_units integer,
  _base_price numeric,
  _currency text,
  _included_guests integer,
  _extra_guest_fee numeric,
  _status text,
  _sort_order integer,
  _hero_line text DEFAULT NULL,
  _image_url text DEFAULT NULL,
  _gallery_urls text[] DEFAULT '{}',
  _size_label text DEFAULT NULL,
  _view_label text DEFAULT NULL,
  _bed_label text DEFAULT NULL,
  _bathroom_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _room_id uuid;
  _old_units integer := 0;
  _remove_count integer := 0;
  _available integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
  THEN
    RAISE EXCEPTION 'Room configuration requires property manager access';
  END IF;

  IF _slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid room slug'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'Room name is required'; END IF;
  IF _total_units < 1 THEN RAISE EXCEPTION 'Room quantity must be at least 1'; END IF;
  IF _base_price < 0 OR _extra_guest_fee < 0 THEN RAISE EXCEPTION 'Pricing cannot be negative'; END IF;
  IF _capacity_adults < 1 OR _max_occupancy < _capacity_adults THEN RAISE EXCEPTION 'Invalid occupancy configuration'; END IF;
  IF _included_guests < 1 OR _included_guests > _max_occupancy THEN RAISE EXCEPTION 'Invalid included guest count'; END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a 3-letter ISO code'; END IF;

  IF _category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.room_categories
    WHERE id = _category_id
      AND property_id = _property_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Room category not found in the selected property';
  END IF;

  IF _id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.rooms WHERE property_id = _property_id AND slug = _slug
    ) THEN
      RAISE EXCEPTION 'Room slug already exists in this property';
    END IF;

    INSERT INTO public.rooms (
      property_id, slug, name, category_id, short_description,
      capacity_adults, capacity_children, max_occupancy, total_units,
      base_price, currency, status, sort_order, included_guests, extra_guest_fee,
      hero_line, image_url, gallery_urls, size_label, view_label, bed_label, bathroom_label
    )
    VALUES (
      _property_id, _slug, btrim(_name), _category_id, NULLIF(btrim(_short_description),''),
      _capacity_adults, _capacity_children, _max_occupancy, _total_units,
      _base_price, _currency, COALESCE(NULLIF(_status,''),'active'), COALESCE(_sort_order,0),
      _included_guests, _extra_guest_fee,
      NULLIF(btrim(_hero_line),''), NULLIF(btrim(_image_url),''), COALESCE(_gallery_urls,'{}'),
      NULLIF(btrim(_size_label),''), NULLIF(btrim(_view_label),''), NULLIF(btrim(_bed_label),''),
      NULLIF(btrim(_bathroom_label),'')
    )
    RETURNING id INTO _room_id;
  ELSE
    SELECT total_units INTO _old_units
    FROM public.rooms
    WHERE id = _id AND property_id = _property_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found in selected property'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.rooms
      WHERE property_id = _property_id AND slug = _slug AND id <> _id
    ) THEN
      RAISE EXCEPTION 'Room slug already exists in this property';
    END IF;

    UPDATE public.rooms SET
      slug = _slug,
      name = btrim(_name),
      category_id = _category_id,
      short_description = NULLIF(btrim(_short_description),''),
      capacity_adults = _capacity_adults,
      capacity_children = _capacity_children,
      max_occupancy = _max_occupancy,
      total_units = _total_units,
      base_price = _base_price,
      currency = _currency,
      status = COALESCE(NULLIF(_status,''),'active'),
      sort_order = COALESCE(_sort_order,0),
      included_guests = _included_guests,
      extra_guest_fee = _extra_guest_fee,
      hero_line = NULLIF(btrim(_hero_line),''),
      image_url = NULLIF(btrim(_image_url),''),
      gallery_urls = COALESCE(_gallery_urls,'{}'),
      size_label = NULLIF(btrim(_size_label),''),
      view_label = NULLIF(btrim(_view_label),''),
      bed_label = NULLIF(btrim(_bed_label),''),
      bathroom_label = NULLIF(btrim(_bathroom_label),'')
    WHERE id = _id AND property_id = _property_id
    RETURNING id INTO _room_id;
  END IF;

  IF _total_units > _old_units THEN
    INSERT INTO public.room_states(property_id, room_id, unit_label)
    SELECT _property_id, _room_id, _slug || '-' || lpad(gs::text,2,'0')
    FROM generate_series(GREATEST(_old_units,0)+1,_total_units) gs;
  ELSIF _total_units < _old_units THEN
    _remove_count := _old_units - _total_units;

    SELECT count(*) INTO _available
    FROM public.room_states
    WHERE property_id = _property_id
      AND room_id = _room_id
      AND booking_id IS NULL
      AND state IN ('vacant_clean','vacant_dirty');

    IF _available < _remove_count THEN
      RAISE EXCEPTION 'Cannot reduce quantity: protected physical room units are still in use';
    END IF;

    DELETE FROM public.room_states
    WHERE id IN (
      SELECT id
      FROM public.room_states
      WHERE property_id = _property_id
        AND room_id = _room_id
        AND booking_id IS NULL
        AND state IN ('vacant_clean','vacant_dirty')
      ORDER BY unit_label DESC
      LIMIT _remove_count
    );
  END IF;

  RETURN _room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_room_type_configuration(
  uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_room_type_configuration(
  uuid,uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text
) TO authenticated, service_role;
