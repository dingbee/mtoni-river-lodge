-- Minimal Supabase-compatible schema for the NSC migration integration test.
-- This is CI-only and intentionally contains no production credentials or data.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $function$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text UNIQUE NOT NULL,
  schedule text NOT NULL,
  command text NOT NULL
);
CREATE OR REPLACE FUNCTION cron.unschedule(text)
RETURNS boolean LANGUAGE plpgsql
AS $function$
DECLARE v_count integer;
BEGIN
  DELETE FROM cron.job WHERE jobname = $1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END
$function$;
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text)
RETURNS bigint LANGUAGE plpgsql
AS $function$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job(jobname, schedule, command)
  VALUES($1, $2, $3)
  ON CONFLICT(jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END
$function$;

CREATE TYPE public.app_role AS ENUM ('admin','reservations','user','owner','manager','reception','marketing','housekeeping','finance','editor');
CREATE TYPE public.booking_status AS ENUM ('pending','confirmed','cancelled','completed','no_show','checked_in');
CREATE TYPE public.payment_status AS ENUM ('unpaid','deposit_paid','paid','refunded','payment_mismatch');
CREATE TYPE public.ops_task_status AS ENUM ('pending','in_progress','completed','cancelled');
CREATE TYPE public.room_state AS ENUM ('vacant_clean','vacant_dirty','occupied','reserved','inspection','maintenance','out_of_service');

CREATE TABLE public.staynas_organisations (id uuid PRIMARY KEY);
CREATE TABLE public.staynas_properties (
  id uuid PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.staynas_property_members (
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(property_id, user_id)
);
CREATE OR REPLACE FUNCTION public.staynas_user_has_property_access(_uid uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id = _uid AND pm.property_id = _property_id AND pm.status = 'active'
  )
$function$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT ON public.staynas_property_members TO authenticated;

CREATE OR REPLACE FUNCTION public.is_any_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id = _user_id AND pm.status = 'active' AND pm.role <> 'user'::public.app_role
  )
$function$;

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id)
);
CREATE TABLE public.room_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  unit_label text NOT NULL,
  state public.room_state NOT NULL DEFAULT 'vacant_clean',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  reference text,
  guest_name text,
  guest_email text,
  guest_phone text,
  special_requests text,
  room_id uuid,
  check_in date,
  check_out date,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  visit_purpose text,
  guest_type text NOT NULL DEFAULT 'new',
  guest_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  status public.booking_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid'
);
CREATE TABLE public.staynas_product_connections (
  id uuid PRIMARY KEY,
  remote_product text NOT NULL DEFAULT 'lexibite',
  remote_tenant_id uuid NOT NULL,
  remote_property_id uuid NOT NULL,
  local_organisation_id uuid NOT NULL REFERENCES public.staynas_organisations(id),
  local_property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  status text NOT NULL,
  local_approved_at timestamptz,
  remote_approved_at timestamptz,
  correlation_id text NOT NULL
);
CREATE TABLE public.restaurant_locations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid
);
CREATE TABLE public.restaurant_inventory_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  location_id uuid,
  name text NOT NULL,
  current_quantity numeric NOT NULL,
  reorder_point numeric,
  par_level numeric,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_stock_movements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  location_id uuid,
  inventory_item_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  balance_after numeric,
  currency text NOT NULL DEFAULT 'TZS',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_purchase_orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  reference text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_goods_receipts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  document_number text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_stocktakes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  stocktake_number text NOT NULL,
  status text NOT NULL,
  variance_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_stock_transfers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  transfer_number text NOT NULL,
  source_location_id uuid,
  status text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_reconciliation_exceptions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  property_id uuid,
  status text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  what_happened text NOT NULL,
  required_action text,
  impact_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  entity_type text,
  entity_id uuid,
  dedupe_key text NOT NULL,
  resolution text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id),
  room_state_id uuid REFERENCES public.room_states(id),
  property_id uuid REFERENCES public.staynas_properties(id),
  task_type text NOT NULL DEFAULT 'operations',
  category text,
  title text NOT NULL,
  description text,
  assignee_id uuid REFERENCES auth.users(id),
  priority integer NOT NULL DEFAULT 2,
  status public.ops_task_status NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.housekeeping_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  room_state_id uuid REFERENCES public.room_states(id),
  task_id uuid REFERENCES public.ops_tasks(id),
  inspection_id uuid,
  exception_id uuid,
  actor_id uuid REFERENCES auth.users(id),
  assignee_id uuid REFERENCES auth.users(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.housekeeping_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_state_id uuid NOT NULL REFERENCES public.room_states(id),
  task_id uuid REFERENCES public.ops_tasks(id),
  reported_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id)
);
CREATE TABLE public.housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id uuid REFERENCES auth.users(id)
);
CREATE TABLE public.staynas_guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id),
  operational_task_id uuid REFERENCES public.ops_tasks(id),
  category text NOT NULL,
  priority smallint NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'received',
  request_text text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  status_updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  booking_id uuid REFERENCES public.bookings(id),
  requested_for timestamptz
);
CREATE TABLE public.pms_folio_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL DEFAULT 'Outlet charge',
  amount numeric NOT NULL,
  currency text NOT NULL,
  failure_code text
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  role text,
  channel text NOT NULL DEFAULT 'in_app',
  title text NOT NULL,
  body text,
  href text,
  kind text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Legacy notification rows exercise the property/organisation backfill path.
INSERT INTO public.staynas_organisations(id) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.staynas_properties(id,organisation_id,status)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd','active');
INSERT INTO public.bookings(id,property_id,reference,guest_name,status,payment_status)
VALUES ('abababab-abab-4bab-8bab-abababababab','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','LEGACY-01','Legacy Guest','pending','unpaid');
INSERT INTO public.notifications(title,kind,meta)
VALUES ('Legacy booking notification','booking',
  jsonb_build_object('booking_id','abababab-abab-4bab-8bab-abababababab'));
INSERT INTO public.notifications(title,kind,meta)
VALUES ('Legacy property notification','ops',
  jsonb_build_object('property_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'));

CREATE TABLE public.pending_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.housekeeping_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  read_at timestamptz
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own housekeeping notifications"
  ON public.housekeeping_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = (select auth.uid()));
CREATE POLICY "Users mark own housekeeping notifications"
  ON public.housekeeping_notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = (select auth.uid()))
  WITH CHECK (recipient_user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.housekeeping_record_event(
  _event_type text,
  _room_state_id uuid DEFAULT NULL,
  _task_id uuid DEFAULT NULL,
  _inspection_id uuid DEFAULT NULL,
  _exception_id uuid DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb,
  _correlation_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.housekeeping_events(
    event_type, room_state_id, task_id, inspection_id, exception_id,
    actor_id, assignee_id, payload, correlation_id
  )
  VALUES(_event_type,_room_state_id,_task_id,_inspection_id,_exception_id,_actor_id,_assignee_id,_payload,_correlation_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;
REVOKE ALL ON FUNCTION public.housekeeping_record_event(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.housekeeping_record_event(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) TO service_role;
