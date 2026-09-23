-- StayNas room configuration and guest-facing category content.
CREATE TABLE IF NOT EXISTS public.room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  features text[] NOT NULL DEFAULT '{}',
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.room_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hero_line text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS gallery_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS size_label text,
  ADD COLUMN IF NOT EXISTS view_label text,
  ADD COLUMN IF NOT EXISTS bed_label text,
  ADD COLUMN IF NOT EXISTS bathroom_label text;

CREATE INDEX IF NOT EXISTS idx_rooms_category_id ON public.rooms(category_id);
CREATE INDEX IF NOT EXISTS idx_room_categories_status_sort ON public.room_categories(status, sort_order);

ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active room categories" ON public.room_categories;
CREATE POLICY "Public read active room categories"
  ON public.room_categories FOR SELECT TO anon, authenticated
  USING (status = 'active' OR public.is_any_staff(auth.uid()));

DROP POLICY IF EXISTS "Room admins manage categories" ON public.room_categories;
CREATE POLICY "Room admins manage categories"
  ON public.room_categories FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

DROP TRIGGER IF EXISTS room_categories_updated_at ON public.room_categories;
CREATE TRIGGER room_categories_updated_at BEFORE UPDATE ON public.room_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.room_categories TO anon, authenticated;
GRANT ALL ON public.room_categories TO service_role;

CREATE OR REPLACE FUNCTION public.save_room_type_configuration(
  _id uuid, _slug text, _name text, _category_id uuid, _short_description text,
  _capacity_adults integer, _capacity_children integer, _max_occupancy integer,
  _total_units integer, _base_price numeric, _currency text, _included_guests integer,
  _extra_guest_fee numeric, _status text, _sort_order integer,
  _hero_line text DEFAULT NULL, _image_url text DEFAULT NULL, _gallery_urls text[] DEFAULT '{}',
  _size_label text DEFAULT NULL, _view_label text DEFAULT NULL, _bed_label text DEFAULT NULL,
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
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Room configuration requires owner or manager access';
  END IF;
  IF _slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid room slug'; END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'Room name is required'; END IF;
  IF _total_units < 1 THEN RAISE EXCEPTION 'Room quantity must be at least 1'; END IF;
  IF _base_price < 0 OR _extra_guest_fee < 0 THEN RAISE EXCEPTION 'Pricing cannot be negative'; END IF;
  IF _capacity_adults < 1 OR _max_occupancy < _capacity_adults THEN RAISE EXCEPTION 'Invalid occupancy configuration'; END IF;
  IF _included_guests < 1 OR _included_guests > _max_occupancy THEN RAISE EXCEPTION 'Invalid included guest count'; END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Currency must be a 3-letter ISO code'; END IF;
  IF _category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories WHERE id = _category_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'Room category not found or inactive'; END IF;

  IF _id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.rooms WHERE slug = _slug) THEN RAISE EXCEPTION 'Room slug already exists'; END IF;
    INSERT INTO public.rooms (
      slug,name,category_id,short_description,capacity_adults,capacity_children,max_occupancy,
      total_units,base_price,currency,status,sort_order,included_guests,extra_guest_fee,
      hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label
    ) VALUES (
      _slug,btrim(_name),_category_id,NULLIF(btrim(_short_description),''),_capacity_adults,
      _capacity_children,_max_occupancy,_total_units,_base_price,_currency,
      COALESCE(NULLIF(_status,''),'active'),COALESCE(_sort_order,0),_included_guests,_extra_guest_fee,
      NULLIF(btrim(_hero_line),''),NULLIF(btrim(_image_url),''),COALESCE(_gallery_urls,'{}'),
      NULLIF(btrim(_size_label),''),NULLIF(btrim(_view_label),''),NULLIF(btrim(_bed_label),''),
      NULLIF(btrim(_bathroom_label),'')
    ) RETURNING id INTO _room_id;
  ELSE
    SELECT total_units INTO _old_units FROM public.rooms WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.rooms WHERE slug = _slug AND id <> _id) THEN RAISE EXCEPTION 'Room slug already exists'; END IF;
    UPDATE public.rooms SET
      slug=_slug,name=btrim(_name),category_id=_category_id,short_description=NULLIF(btrim(_short_description),''),
      capacity_adults=_capacity_adults,capacity_children=_capacity_children,max_occupancy=_max_occupancy,
      total_units=_total_units,base_price=_base_price,currency=_currency,
      status=COALESCE(NULLIF(_status,''),'active'),sort_order=COALESCE(_sort_order,0),
      included_guests=_included_guests,extra_guest_fee=_extra_guest_fee,
      hero_line=NULLIF(btrim(_hero_line),''),image_url=NULLIF(btrim(_image_url),''),
      gallery_urls=COALESCE(_gallery_urls,'{}'),size_label=NULLIF(btrim(_size_label),''),
      view_label=NULLIF(btrim(_view_label),''),bed_label=NULLIF(btrim(_bed_label),''),
      bathroom_label=NULLIF(btrim(_bathroom_label),'')
    WHERE id=_id RETURNING id INTO _room_id;
  END IF;

  IF _total_units > _old_units THEN
    INSERT INTO public.room_states(room_id,unit_label)
    SELECT _room_id,_slug || '-' || lpad(gs::text,2,'0')
    FROM generate_series(GREATEST(_old_units,0)+1,_total_units) gs;
  ELSIF _total_units < _old_units THEN
    _remove_count := _old_units - _total_units;
    SELECT count(*) INTO _available FROM public.room_states
      WHERE room_id=_room_id AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty');
    IF _available < _remove_count THEN
      RAISE EXCEPTION 'Cannot reduce quantity: protected physical room units are still in use';
    END IF;
    DELETE FROM public.room_states WHERE id IN (
      SELECT id FROM public.room_states
      WHERE room_id=_room_id AND booking_id IS NULL AND state IN ('vacant_clean','vacant_dirty')
      ORDER BY unit_label DESC LIMIT _remove_count
    );
  END IF;
  RETURN _room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_room_type_configuration(uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_room_type_configuration(uuid,text,text,uuid,text,integer,integer,integer,integer,numeric,text,integer,numeric,text,integer,text,text,text[],text,text,text,text) TO authenticated;
