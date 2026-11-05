CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),'') $$;

CREATE TABLE public.staynas_properties(id uuid PRIMARY KEY,status text NOT NULL);
CREATE TABLE public.rooms(
 id uuid PRIMARY KEY,property_id uuid NOT NULL,slug text NOT NULL,name text NOT NULL,
 status text NOT NULL DEFAULT 'active',total_units integer NOT NULL DEFAULT 1,
 base_price numeric NOT NULL DEFAULT 100,currency text NOT NULL DEFAULT 'USD',
 max_occupancy integer NOT NULL DEFAULT 4,included_guests integer NOT NULL DEFAULT 2,
 extra_guest_fee numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.room_inventory(
 room_id uuid NOT NULL,date date NOT NULL,available_units integer NOT NULL,
 price_override numeric,is_blocked boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,date)
);
CREATE TABLE public.bookings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reference text NOT NULL UNIQUE,
 room_id uuid NOT NULL,property_id uuid NOT NULL,check_in date NOT NULL,check_out date NOT NULL,
 nights integer NOT NULL,adults integer NOT NULL,children integer NOT NULL DEFAULT 0,
 children_below_6 integer NOT NULL DEFAULT 0,children_7_plus integer NOT NULL DEFAULT 0,
 guest_name text NOT NULL,guest_email text NOT NULL,guest_phone text,country text,special_requests text,
 currency text NOT NULL DEFAULT 'USD',source text NOT NULL DEFAULT 'website',
 payment_method text,payment_provider text NOT NULL DEFAULT 'pesapal',
 subtotal numeric NOT NULL DEFAULT 0,extras_total numeric NOT NULL DEFAULT 0,
 taxes numeric NOT NULL DEFAULT 0,tax_addition numeric NOT NULL DEFAULT 0,
 tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,total numeric NOT NULL DEFAULT 0,
 deposit_amount numeric NOT NULL DEFAULT 0,balance_amount numeric NOT NULL DEFAULT 0,
 balance_due numeric NOT NULL DEFAULT 0,paid_amount numeric,payment_status text NOT NULL DEFAULT 'unpaid',
 status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.booking_holds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL,property_id uuid NOT NULL,
 check_in date NOT NULL,check_out date NOT NULL,session_id text NOT NULL,guest_email text,
 status text NOT NULL DEFAULT 'active',expires_at timestamptz NOT NULL,
 converted_booking_id uuid,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.booking_nights(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL,room_id uuid NOT NULL,
 date date NOT NULL,nightly_rate numeric NOT NULL
);
CREATE TABLE public.extras(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid NOT NULL,slug text NOT NULL,
 active boolean NOT NULL DEFAULT true,price numeric NOT NULL DEFAULT 0,unit text NOT NULL DEFAULT 'per_stay',currency text
);
CREATE TABLE public.booking_extras(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL,extra_id uuid NOT NULL,
 quantity integer NOT NULL,unit_price numeric NOT NULL,line_total numeric NOT NULL
);
CREATE TABLE public.calendar_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_type text NOT NULL,room_id uuid,
 booking_id uuid,hold_id uuid,date_from date,date_to date,payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.staynas_property_members(
 user_id uuid NOT NULL,property_id uuid NOT NULL,status text NOT NULL,
 PRIMARY KEY(user_id,property_id)
);
CREATE FUNCTION public.staynas_user_has_property_access(_user_id uuid,_property_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $
 SELECT EXISTS(SELECT 1 FROM public.staynas_property_members m
   WHERE m.user_id=_user_id AND m.property_id=_property_id AND m.status='active')
$;
CREATE FUNCTION public.calculate_staynas_booking_taxes(uuid,date,integer,numeric,numeric,text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('tax_total',0,'tax_addition',0,'breakdown','[]'::jsonb)
$$;
CREATE FUNCTION public.log_calendar_event(text,uuid,uuid,uuid,date,date,jsonb) RETURNS void
LANGUAGE sql AS $$
 INSERT INTO public.calendar_events(event_type,room_id,booking_id,hold_id,date_from,date_to,payload)
 VALUES($1,$2,$3,$4,$5,$6,$7)
$$;
CREATE FUNCTION public.enforce_finance_rpc_booking_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
     OR NEW.balance_amount IS DISTINCT FROM OLD.balance_amount
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method)
    AND current_setting('staynas.payment_rpc',true) IS DISTINCT FROM 'on'
    AND COALESCE(auth.role(),'')<>'service_role' THEN
   RAISE EXCEPTION 'Finance RPC required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER bookings_finance_guard BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_rpc_booking_update();

CREATE FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text)
RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text)
LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::text,NULL::numeric,NULL::text WHERE false $$;
CREATE FUNCTION public.create_booking_for_property(uuid,text,date,date,integer,integer,text,text,text,text,text,jsonb,integer,integer,uuid,text,text)
RETURNS TABLE(booking_id uuid,reference text,total numeric,currency text,taxes numeric,tax_addition numeric,tax_breakdown jsonb)
LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::text,NULL::numeric,NULL::text,NULL::numeric,NULL::numeric,NULL::jsonb WHERE false $$;
CREATE FUNCTION public.create_booking_hold_for_property(uuid,text,date,date,text,text,integer)
RETURNS TABLE(hold_id uuid,expires_at timestamptz,room_id uuid)
LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::timestamptz,NULL::uuid WHERE false $$;
CREATE FUNCTION public.staynas_active_property_id(_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $
 SELECT m.property_id FROM public.staynas_property_members m
 WHERE m.user_id=_user_id AND m.status='active'
 ORDER BY m.property_id LIMIT 1
$;
CREATE FUNCTION public.staynas_booking_property_id() RETURNS uuid
LANGUAGE sql STABLE AS $ SELECT NULL::uuid $;
CREATE FUNCTION public.staynas_booking_property_id(text) RETURNS uuid
LANGUAGE sql STABLE AS $ SELECT NULL::uuid $;
GRANT EXECUTE ON FUNCTION public.staynas_booking_property_id() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.staynas_booking_property_id(text) TO anon,authenticated,service_role;
CREATE FUNCTION public.get_room_availability_for_property(uuid,date,date)
RETURNS TABLE(room_id uuid,slug text,name text,base_price numeric,currency text,
  capacity_adults integer,capacity_children integer,max_occupancy integer,nights integer,
  nightly_total numeric,min_available integer,is_available boolean)
LANGUAGE sql STABLE AS $$
  SELECT NULL::uuid,NULL::text,NULL::text,NULL::numeric,NULL::text,
    NULL::integer,NULL::integer,NULL::integer,NULL::integer,NULL::numeric,NULL::integer,NULL::boolean
  WHERE false
$$;
GRANT EXECUTE ON FUNCTION public.get_room_availability_for_property(uuid,date,date) TO anon,authenticated;
