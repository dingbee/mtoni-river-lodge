-- Disposable PostgreSQL 17 schema stubs for DC-05.03 migration contract verification.
-- Loaded only after DC-04 and DC-05.05 migrations; never used against a real tenant DB.
ALTER TABLE public.staynas_properties
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

CREATE TABLE public.staynas_room_catalogue_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.staynas_rate_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  publication_status text NOT NULL DEFAULT 'published',
  PRIMARY KEY(id),
  UNIQUE(property_id,id)
);

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  catalogue_type_id uuid NOT NULL REFERENCES public.staynas_room_catalogue_types(id),
  slug text NOT NULL,
  name text NOT NULL DEFAULT 'Fixture room',
  status text NOT NULL DEFAULT 'active',
  currency text NOT NULL DEFAULT 'USD',
  capacity_adults integer NOT NULL DEFAULT 2,
  capacity_children integer NOT NULL DEFAULT 2,
  max_occupancy integer NOT NULL DEFAULT 4,
  included_guests integer NOT NULL DEFAULT 2,
  extra_guest_fee numeric NOT NULL DEFAULT 0,
  base_price numeric NOT NULL DEFAULT 100,
  total_units integer NOT NULL DEFAULT 1,
  UNIQUE(property_id,slug)
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  property_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights integer NOT NULL,
  adults integer NOT NULL,
  children integer NOT NULL,
  children_below_6 integer NOT NULL DEFAULT 0,
  children_7_plus integer NOT NULL DEFAULT 0,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  country text,
  special_requests text,
  currency text NOT NULL,
  source text NOT NULL,
  payment_method text,
  payment_provider text,
  subtotal numeric NOT NULL DEFAULT 0,
  extras_total numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  tax_addition numeric NOT NULL DEFAULT 0,
  tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  deposit_amount numeric NOT NULL DEFAULT 0,
  balance_amount numeric NOT NULL DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  pricing_snapshot jsonb
);

CREATE TABLE public.booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  session_id text,
  converted_booking_id uuid,
  updated_at timestamptz
);

CREATE TABLE public.room_inventory (
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  date date NOT NULL,
  available_units integer NOT NULL DEFAULT 1,
  is_blocked boolean NOT NULL DEFAULT false,
  updated_at timestamptz,
  PRIMARY KEY(room_id,date)
);

CREATE TABLE public.booking_nights (
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  date date NOT NULL,
  nightly_rate numeric NOT NULL,
  pricing_snapshot jsonb,
  PRIMARY KEY(booking_id,date)
);

CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  scope text NOT NULL DEFAULT 'all',
  room_id uuid,
  starts_on date,
  ends_on date
);

CREATE TABLE public.staynas_property_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_to date
);

CREATE TABLE public.extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  currency text,
  price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'per_stay'
);

CREATE TABLE public.booking_extras (
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  extra_id uuid NOT NULL REFERENCES public.extras(id),
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL
);

CREATE OR REPLACE FUNCTION public.staynas_lock_room_inventory_dates(
  _room_id uuid,_property_id uuid,_check_in date,_check_out date
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d date; units integer;
BEGIN
  SELECT total_units INTO units FROM public.rooms WHERE id=_room_id AND property_id=_property_id;
  d:=_check_in;
  WHILE d<_check_out LOOP
    INSERT INTO public.room_inventory(room_id,date,available_units)
    VALUES(_room_id,d,units) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM public.room_inventory WHERE room_id=_room_id AND date=d FOR UPDATE;
    d:=d+1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_staynas_booking_quote(
  _property_id uuid,_room_id uuid,_check_in date,_check_out date,
  _adults integer,_children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0,
  _extras jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'ok',true,'currency',r.currency,'nightly',(
      SELECT jsonb_agg(jsonb_build_object(
        'date',d::date,'nightly_rate',r.base_price,'source_rate',r.base_price,
        'currency',r.currency,'rate_plan_id',current_setting('staynas.rate_plan_id',true),
        'publication_id',NULL,'publication_number',NULL,'rate_plan_version',NULL,'snapshot_hash',NULL
      ) ORDER BY d)
      FROM generate_series(_check_in,_check_out-1,interval '1 day') d
    ),
    'accommodation_subtotal',(_check_out-_check_in)*r.base_price,
    'extras_total',0,'taxes',0,'tax_addition',0,'tax_breakdown','[]'::jsonb,
    'total',(_check_out-_check_in)*r.base_price,'extras','[]'::jsonb
  ) FROM public.rooms r WHERE r.id=_room_id AND r.property_id=_property_id;
$$;

CREATE OR REPLACE FUNCTION public.get_staynas_room_availability_priced_with_rate_plan(
  _check_in date,_check_out date,_property_id uuid,_adults integer DEFAULT 1,
  _children_below_6 integer DEFAULT 0,_children_7_plus integer DEFAULT 0,
  _rate_plan_id uuid DEFAULT NULL
) RETURNS TABLE(
  room_id uuid,slug text,name text,base_price numeric,currency text,
  capacity_adults integer,capacity_children integer,max_occupancy integer,
  included_guests integer,extra_guest_fee numeric,nights integer,nightly_total numeric,
  min_available integer,is_available boolean,fits_occupancy boolean,pricing_quote jsonb
) LANGUAGE sql AS $$
  SELECT r.id,r.slug,r.name,r.base_price,r.currency,r.capacity_adults,r.capacity_children,
    r.max_occupancy,r.included_guests,r.extra_guest_fee,(_check_out-_check_in),
    (_check_out-_check_in)*r.base_price,1,true,true,
    public.calculate_staynas_booking_quote(_property_id,r.id,_check_in,_check_out,
      _adults,_children_below_6,_children_7_plus,'[]'::jsonb)
  FROM public.rooms r WHERE r.property_id=_property_id AND r.status='active';
$$;

CREATE OR REPLACE FUNCTION public.create_booking_for_property_with_rate_plan(
  _property_id uuid,_room_slug text,_check_in date,_check_out date,
  _adults integer,_children integer,_guest_name text,_guest_email text,
  _guest_phone text,_country text,_special_requests text,_extras jsonb DEFAULT '[]'::jsonb,
  _children_below_6 integer DEFAULT NULL,_children_7_plus integer DEFAULT NULL,
  _hold_id uuid DEFAULT NULL,_session_id text DEFAULT NULL,_payment_method text DEFAULT 'online',
  _rate_plan_id uuid DEFAULT NULL
) RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text,
  taxes numeric,tax_addition numeric,tax_breakdown jsonb)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('staynas.rate_plan_id',COALESCE(_rate_plan_id::text,''),true);
  RETURN QUERY EXECUTE
    'SELECT * FROM public.create_booking_for_property($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)'
    USING _property_id,_room_slug,_check_in,_check_out,_adults,_children,_guest_name,_guest_email,
      _guest_phone,_country,_special_requests,_extras,_children_below_6,_children_7_plus,
      _hold_id,_session_id,_payment_method;
END;
$$;

CREATE OR REPLACE FUNCTION public.staynas_user_has_property_access(_user_id uuid,_property_id uuid)
RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.log_calendar_event(
  text,uuid,uuid,uuid,date,date,jsonb
) RETURNS void LANGUAGE plpgsql AS $ BEGIN RETURN; END; $;

ALTER TABLE public.staynas_properties ADD CONSTRAINT staynas_properties_status_fixture_check
  CHECK (status IN ('active','inactive'));
