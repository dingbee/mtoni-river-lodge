-- LB-02.02 — StayNas receiver for explicitly approved LexiBite outlet projections.
BEGIN;
CREATE TABLE IF NOT EXISTS public.lb02_inbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
 source_event_id uuid NOT NULL, event_type text NOT NULL CHECK(event_type IN ('outlet.published.v1','outlet.status_changed.v1')),
 event_version integer NOT NULL CHECK(event_version=1), integration_property_id uuid NOT NULL, aggregate_id uuid NOT NULL,
 aggregate_version bigint NOT NULL CHECK(aggregate_version>0), correlation_id text NOT NULL, idempotency_key text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 processing_state text NOT NULL DEFAULT 'accepted' CHECK(processing_state IN ('accepted','applied','ignored_stale','dead_lettered')),
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 CONSTRAINT lb02_staynas_inbox_event_uq UNIQUE(connection_id,source_event_id),
 CONSTRAINT lb02_staynas_inbox_idempotency_uq UNIQUE(connection_id,idempotency_key),
 CONSTRAINT lb02_staynas_inbox_payload_allowlist_ck CHECK(
  payload-ARRAY['outletReference','propertyReference','displayName','outletType','publicDescription','guestVisibleStatus','serviceHours','sourceVersion']::text[]='{}'::jsonb)
);
CREATE TABLE IF NOT EXISTS public.lb02_outlet_projections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
 integration_property_id uuid NOT NULL, outlet_reference uuid NOT NULL,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 120),
 outlet_type text NOT NULL CHECK(length(btrim(outlet_type)) BETWEEN 1 AND 48),
 public_description text CHECK(public_description IS NULL OR length(public_description)<=1000),
 guest_visible_status text NOT NULL CHECK(guest_visible_status IN ('unpublished','open','closed','temporarily_unavailable')),
 service_hours jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(service_hours)='object'),
 source_version bigint NOT NULL CHECK(source_version>0), received_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CONSTRAINT lb02_staynas_outlet_projection_uq UNIQUE(connection_id,outlet_reference)
);
CREATE TABLE IF NOT EXISTS public.lb02_outlet_dead_letters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
 source_event_id uuid NOT NULL,event_type text NOT NULL,idempotency_key text NOT NULL,
 failure_code text NOT NULL CHECK(length(failure_code)<=80),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 replay_count integer NOT NULL DEFAULT 0 CHECK(replay_count>=0),replayed_at timestamptz,
 replayed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT lb02_staynas_outlet_dlq_allowlist_ck CHECK(
  payload-ARRAY['outletReference','propertyReference','displayName','outletType','publicDescription','guestVisibleStatus','serviceHours','sourceVersion']::text[]='{}'::jsonb)
);
CREATE INDEX IF NOT EXISTS lb02_staynas_outlet_projection_property_idx
 ON public.lb02_outlet_projections(connection_id,integration_property_id,guest_visible_status);
ALTER TABLE public.lb02_inbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lb02_outlet_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lb02_outlet_dead_letters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lb02_inbox_events,public.lb02_outlet_projections,public.lb02_outlet_dead_letters FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lb02_inbox_events,public.lb02_outlet_projections,public.lb02_outlet_dead_letters TO service_role;

CREATE OR REPLACE FUNCTION public.lb02_apply_outlet_event(
 _connection_id uuid,_source_event_id uuid,_event_type text,_event_version integer,_integration_property_id uuid,
 _aggregate_id uuid,_aggregate_version bigint,_correlation_id text,_idempotency_key text,_payload jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $lb02$
DECLARE
 v_connection public.staynas_product_connections%ROWTYPE; v_outlet_reference uuid; v_property_reference uuid;
 v_display_name text; v_outlet_type text; v_description text; v_status text; v_hours jsonb;
 v_source_version bigint; v_inserted uuid; v_current_version bigint;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authentication required' USING ERRCODE='42501'; END IF;
 IF _event_type NOT IN ('outlet.published.v1','outlet.status_changed.v1') OR _event_version<>1
  OR _source_event_id IS NULL OR _aggregate_id IS NULL OR _aggregate_version<1
  OR _idempotency_key IS NULL OR length(_idempotency_key) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(_payload)<>'object'
  OR _payload-ARRAY['outletReference','propertyReference','displayName','outletType','publicDescription','guestVisibleStatus','serviceHours','sourceVersion']::text[]<>'{}'::jsonb
 THEN RAISE EXCEPTION 'Invalid LB-02 outlet event contract' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_connection FROM public.staynas_product_connections WHERE id=_connection_id FOR SHARE;
 IF NOT FOUND OR v_connection.remote_product<>'lexibite' OR v_connection.status<>'active'
  OR v_connection.local_approved_at IS NULL OR v_connection.remote_approved_at IS NULL
  OR v_connection.integration_property_id<>_integration_property_id OR v_connection.correlation_id<>_correlation_id
 THEN RAISE EXCEPTION 'LB-02 outlet connection/property scope rejected' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_connection_id::text||':'||_aggregate_id::text,0));
 BEGIN
  v_outlet_reference:=(_payload->>'outletReference')::uuid; v_property_reference:=(_payload->>'propertyReference')::uuid;
  v_display_name:=_payload->>'displayName'; v_outlet_type:=_payload->>'outletType';
  v_description:=_payload->>'publicDescription'; v_status:=_payload->>'guestVisibleStatus';
  v_hours:=coalesce(_payload->'serviceHours','{}'::jsonb); v_source_version:=(_payload->>'sourceVersion')::bigint;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid LB-02 outlet projection payload' USING ERRCODE='22023'; END;
 IF v_outlet_reference IS DISTINCT FROM _aggregate_id OR v_property_reference IS DISTINCT FROM _integration_property_id
  OR v_display_name IS NULL OR length(btrim(v_display_name)) NOT BETWEEN 1 AND 120
  OR v_outlet_type IS NULL OR length(btrim(v_outlet_type)) NOT BETWEEN 1 AND 48
  OR v_status IS NULL OR v_status NOT IN ('unpublished','open','closed','temporarily_unavailable')
  OR jsonb_typeof(v_hours)<>'object' OR v_source_version IS DISTINCT FROM _aggregate_version
 THEN RAISE EXCEPTION 'LB-02 outlet identity/version rejected' USING ERRCODE='22023'; END IF;
 INSERT INTO public.lb02_inbox_events(connection_id,source_event_id,event_type,event_version,integration_property_id,
  aggregate_id,aggregate_version,correlation_id,idempotency_key,payload)
 VALUES(_connection_id,_source_event_id,_event_type,_event_version,_integration_property_id,
  _aggregate_id,_aggregate_version,_correlation_id,_idempotency_key,_payload)
 ON CONFLICT DO NOTHING RETURNING id INTO v_inserted;
 IF v_inserted IS NULL THEN RETURN 'duplicate'; END IF;
 SELECT source_version INTO v_current_version FROM public.lb02_outlet_projections
 WHERE connection_id=_connection_id AND outlet_reference=v_outlet_reference FOR UPDATE;
 IF v_current_version IS NOT NULL AND _aggregate_version<=v_current_version THEN
  UPDATE public.lb02_inbox_events SET processing_state='ignored_stale',processed_at=now() WHERE id=v_inserted;
  RETURN 'ignored_stale';
 END IF;
 INSERT INTO public.lb02_outlet_projections(connection_id,integration_property_id,outlet_reference,display_name,
  outlet_type,public_description,guest_visible_status,service_hours,source_version,received_at,revoked_at)
 VALUES(_connection_id,_integration_property_id,v_outlet_reference,v_display_name,v_outlet_type,v_description,
  v_status,v_hours,v_source_version,now(),CASE WHEN v_status='unpublished' THEN now() ELSE NULL END)
 ON CONFLICT(connection_id,outlet_reference) DO UPDATE SET display_name=EXCLUDED.display_name,
  outlet_type=EXCLUDED.outlet_type,public_description=EXCLUDED.public_description,
  guest_visible_status=EXCLUDED.guest_visible_status,service_hours=EXCLUDED.service_hours,
  source_version=EXCLUDED.source_version,received_at=now(),revoked_at=EXCLUDED.revoked_at;
 UPDATE public.lb02_inbox_events SET processing_state='applied',processed_at=now() WHERE id=v_inserted;
 RETURN 'applied';
END;
$lb02$;
REVOKE ALL ON FUNCTION public.lb02_apply_outlet_event(uuid,uuid,text,integer,uuid,uuid,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lb02_apply_outlet_event(uuid,uuid,text,integer,uuid,uuid,bigint,text,text,jsonb) TO service_role;
COMMIT;