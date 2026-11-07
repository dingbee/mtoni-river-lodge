-- SPE-07 additive distribution persistence design.
-- REVIEW ARTIFACT ONLY. Generate the migration with:
--   supabase migration new spe07_distribution_persistence
-- Copy this SQL into the generated migration and validate on a clean local DB.
-- Do not apply to production without a separate release decision.
--
-- Canonical tenant = staynas_organisations; property = staynas_properties.
-- Credential material is external to Postgres; only an opaque vault reference
-- is stored. All queue/inbox operations are trusted-server only.

BEGIN;

-- A composite ownership key allows child records to prove tenant/property pairing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='staynas_properties_organisation_id_id_key'
      AND conrelid='public.staynas_properties'::regclass
  ) THEN
    ALTER TABLE public.staynas_properties
      ADD CONSTRAINT staynas_properties_organisation_id_id_key UNIQUE (organisation_id,id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.staynas_distribution_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$'),
  external_account_id text NOT NULL CHECK (length(btrim(external_account_id)) BETWEEN 1 AND 255),
  external_property_id text NOT NULL CHECK (length(btrim(external_property_id)) BETWEEN 1 AND 255),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validating','active','suspended','revoked','error')),
  credential_secret_ref text NOT NULL CHECK (length(btrim(credential_secret_ref)) BETWEEN 1 AND 255),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities)='object'),
  mapping_version integer NOT NULL DEFAULT 1 CHECK (mapping_version>0),
  last_validated_at timestamptz,
  last_error_code text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_connection_property_fk
    FOREIGN KEY (organisation_id,property_id)
    REFERENCES public.staynas_properties(organisation_id,id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_connection_scope_unique
    UNIQUE (id,organisation_id,property_id),
  CONSTRAINT staynas_distribution_connection_provider_scope_unique
    UNIQUE (organisation_id,property_id,provider,external_account_id,external_property_id)
);

CREATE INDEX IF NOT EXISTS staynas_distribution_connections_property_status_idx
  ON public.staynas_distribution_connections(organisation_id,property_id,status);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  mapping_type text NOT NULL CHECK (mapping_type IN ('room_type','rate_plan')),
  internal_id uuid NOT NULL,
  external_id text NOT NULL CHECK (length(btrim(external_id)) BETWEEN 1 AND 255),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_mapping_connection_fk
    FOREIGN KEY (connection_id,organisation_id,property_id)
    REFERENCES public.staynas_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_mapping_external_unique
    UNIQUE (connection_id,mapping_type,external_id),
  CONSTRAINT staynas_distribution_mapping_internal_unique
    UNIQUE (connection_id,mapping_type,internal_id)
);

CREATE INDEX IF NOT EXISTS staynas_distribution_mappings_property_idx
  ON public.staynas_distribution_mappings(organisation_id,property_id,connection_id,mapping_type,active);

CREATE OR REPLACE FUNCTION public.staynas_distribution_validate_mapping()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.mapping_type='room_type' AND NOT EXISTS (
    SELECT 1 FROM public.room_categories rc
    WHERE rc.id=NEW.internal_id AND rc.property_id=NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Room category mapping must belong to the same property' USING ERRCODE='23503';
  ELSIF NEW.mapping_type='rate_plan' AND NOT EXISTS (
    SELECT 1 FROM public.staynas_rate_plans rp
    WHERE rp.id=NEW.internal_id AND rp.property_id=NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Rate plan mapping must belong to the same property' USING ERRCODE='23503';
  END IF;
  NEW.external_id:=btrim(NEW.external_id);
  NEW.updated_at:=now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staynas_distribution_mapping_validate ON public.staynas_distribution_mappings;
CREATE TRIGGER staynas_distribution_mapping_validate
  BEFORE INSERT OR UPDATE ON public.staynas_distribution_mappings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_validate_mapping();

CREATE TABLE IF NOT EXISTS public.staynas_distribution_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN (
    'connection.validate','rates.push','availability.push','restrictions.push',
    'reservations.pull','reservations.receive','reservations.modify',
    'reservations.cancel','reconciliation.read'
  )),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_version text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','succeeded','retry_wait','failed','dead_letter','cancelled')),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) IN ('object','array')),
  result_summary jsonb,
  provider_operation_id text,
  provider_request_id text,
  error_code text,
  safe_error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_operation_connection_fk
    FOREIGN KEY (connection_id,organisation_id,property_id)
    REFERENCES public.staynas_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_operation_idempotency_unique
    UNIQUE (connection_id,operation_type,idempotency_key),
  CONSTRAINT staynas_distribution_operation_scope_unique
    UNIQUE (id,organisation_id,property_id,connection_id)
);

CREATE INDEX IF NOT EXISTS staynas_distribution_operations_due_idx
  ON public.staynas_distribution_operations(status,next_attempt_at,created_at)
  WHERE status IN ('queued','retry_wait');
CREATE INDEX IF NOT EXISTS staynas_distribution_operations_property_idx
  ON public.staynas_distribution_operations(organisation_id,property_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_distribution_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type='distribution.operation.requested'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','retry_wait','dead_letter','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token uuid,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_outbox_operation_fk
    FOREIGN KEY (operation_id,organisation_id,property_id,connection_id)
    REFERENCES public.staynas_distribution_operations(id,organisation_id,property_id,connection_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS staynas_distribution_outbox_claim_idx
  ON public.staynas_distribution_outbox(status,next_attempt_at,created_at)
  WHERE status IN ('pending','retry_wait');

CREATE TABLE IF NOT EXISTS public.staynas_distribution_reservation_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  provider_event_id text NOT NULL CHECK (length(btrim(provider_event_id)) BETWEEN 1 AND 255),
  external_reservation_id text NOT NULL CHECK (length(btrim(external_reservation_id)) BETWEEN 1 AND 255),
  event_type text NOT NULL CHECK (event_type IN ('created','modified','cancelled')),
  event_version text,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  normalized_payload jsonb NOT NULL CHECK (jsonb_typeof(normalized_payload)='object'),
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processing','applied','duplicate','stale','manual_review','failed','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_token uuid,
  canonical_booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  safe_error_code text,
  safe_error_message text,
  CONSTRAINT staynas_distribution_inbox_connection_fk
    FOREIGN KEY (connection_id,organisation_id,property_id)
    REFERENCES public.staynas_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_inbox_event_unique
    UNIQUE (connection_id,provider_event_id)
);


-- Immutable provider-confirmed commercial terms, one row per received event.
-- This is an evidence ledger only; it does not create or mutate canonical bookings.
CREATE TABLE IF NOT EXISTS public.staynas_distribution_price_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  inbox_id uuid NOT NULL UNIQUE
    REFERENCES public.staynas_distribution_reservation_inbox(id) ON DELETE RESTRICT,
  external_reservation_id text NOT NULL CHECK (length(btrim(external_reservation_id)) BETWEEN 1 AND 255),
  event_version text,
  confirmed_amount_minor bigint NOT NULL CHECK (confirmed_amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_price_commitments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_price_commitments FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;
GRANT ALL ON public.staynas_distribution_price_commitments TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;
),
  tax_amount_minor bigint CHECK (tax_amount_minor IS NULL OR tax_amount_minor >= 0),
  fee_amount_minor bigint CHECK (fee_amount_minor IS NULL OR fee_amount_minor >= 0),
  commission_amount_minor bigint CHECK (commission_amount_minor IS NULL OR commission_amount_minor >= 0),
  provider_payment_status text NOT NULL CHECK (provider_payment_status IN ('unknown','unpaid','paid','partially_paid','refunded')),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','verified','rejected')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_commitment_scope_fk
    FOREIGN KEY (connection_id,organisation_id,property_id)
    REFERENCES public.staynas_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS staynas_distribution_commitments_external_idx
  ON public.staynas_distribution_price_commitments(connection_id,external_reservation_id,captured_at DESC);

CREATE OR REPLACE FUNCTION public.staynas_distribution_reject_commitment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $
BEGIN
  RAISE EXCEPTION 'Provider price commitment evidence is append-only' USING ERRCODE='55000';
END $;

DROP TRIGGER IF EXISTS staynas_distribution_commitment_immutable
  ON public.staynas_distribution_price_commitments;
CREATE TRIGGER staynas_distribution_commitment_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_distribution_price_commitments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_reject_commitment_mutation();

ALTER TABLE public.staynas_distribution_price_commitments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_distribution_price_commitments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.staynas_distribution_price_commitments TO service_role;

-- Capture the exact amount/currency and provider-reported tax/fee/commission
-- from the already validated inbox payload. No local repricing is performed.
CREATE OR REPLACE FUNCTION public.staynas_distribution_record_price_commitment(p_inbox_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $
DECLARE
  v_inbox public.staynas_distribution_reservation_inbox%ROWTYPE;
  v_id uuid;
  v_payload jsonb;
  v_amount bigint;
  v_currency text;
BEGIN
  IF p_inbox_id IS NULL THEN
    RAISE EXCEPTION 'Inbox event is required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_inbox
  FROM public.staynas_distribution_reservation_inbox
  WHERE id=p_inbox_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation inbox event not found' USING ERRCODE='P0002';
  END IF;
  IF v_inbox.event_type='cancelled' THEN
    RAISE EXCEPTION 'Cancellation events do not create price commitments' USING ERRCODE='22023';
  END IF;
  v_payload:=v_inbox.normalized_payload;
  IF jsonb_typeof(v_payload)<>'object'
    OR coalesce(v_payload->>'confirmedAmountMinor','') !~ '^[0-9]+
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;

    OR upper(coalesce(v_payload->>'currency','')) !~ '^[A-Z]{3}
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;
 THEN
    RAISE EXCEPTION 'Provider-confirmed amount and currency are required' USING ERRCODE='22023';
  END IF;
  v_amount:=(v_payload->>'confirmedAmountMinor')::bigint;
  v_currency:=upper(v_payload->>'currency');

  INSERT INTO public.staynas_distribution_price_commitments(
    organisation_id,property_id,connection_id,inbox_id,external_reservation_id,event_version,
    confirmed_amount_minor,currency,tax_amount_minor,fee_amount_minor,commission_amount_minor,
    provider_payment_status
  ) VALUES (
    v_inbox.organisation_id,v_inbox.property_id,v_inbox.connection_id,v_inbox.id,
    v_inbox.external_reservation_id,v_inbox.event_version,v_amount,v_currency,
    CASE WHEN coalesce(v_payload->>'taxAmountMinor','') ~ '^[0-9]+
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;
 THEN (v_payload->>'taxAmountMinor')::bigint END,
    CASE WHEN coalesce(v_payload->>'feeAmountMinor','') ~ '^[0-9]+
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;
 THEN (v_payload->>'feeAmountMinor')::bigint END,
    CASE WHEN coalesce(v_payload->>'commissionAmountMinor','') ~ '^[0-9]+
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;
 THEN (v_payload->>'commissionAmountMinor')::bigint END,
    CASE WHEN v_payload->>'paymentStatus' IN ('unknown','unpaid','paid','partially_paid','refunded')
      THEN v_payload->>'paymentStatus' ELSE 'unknown' END
  )
  ON CONFLICT (inbox_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.staynas_distribution_price_commitments
    WHERE inbox_id=p_inbox_id;
  END IF;
  RETURN v_id;
END $;

REVOKE ALL ON FUNCTION public.staynas_distribution_record_price_commitment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_record_price_commitment(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_sequence_idx
  ON public.staynas_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_distribution_connections TO service_role;
GRANT ALL ON public.staynas_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_distribution_operations TO service_role;
GRANT ALL ON public.staynas_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_distribution_reservation_inbox TO service_role;

-- All RPCs below are service_role-only. The server derives actor_id from a
-- verified session; never trust an actor_id supplied by browser JSON.
CREATE OR REPLACE FUNCTION public.staynas_distribution_create_connection(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_provider text,
  p_external_account_id text,p_external_property_id text,p_credential_secret_ref text,
  p_capabilities jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution connection administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_connections(
    organisation_id,property_id,provider,external_account_id,external_property_id,
    credential_secret_ref,capabilities,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,btrim(p_provider),btrim(p_external_account_id),
    btrim(p_external_property_id),btrim(p_credential_secret_ref),coalesce(p_capabilities,'{}'::jsonb),
    p_actor_id,p_actor_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_upsert_mapping(
  p_actor_id uuid,p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_mapping_type text,p_internal_id uuid,p_external_id text,p_active boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_actor_id AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution mapping administration denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_distribution_mappings.property_id=p_property_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Mapping conflict or connection scope mismatch' USING ERRCODE='23505';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_enqueue_operation(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_operation_type text,p_idempotency_key text,p_request_fingerprint text,
  p_request_payload jsonb,p_source_version text DEFAULT NULL,p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(operation_id uuid,outbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation public.staynas_distribution_operations%ROWTYPE; v_outbox_id uuid;
BEGIN
  IF p_organisation_id IS NULL OR p_property_id IS NULL OR p_connection_id IS NULL
    OR p_operation_type IS NULL OR p_operation_type NOT IN (
      'connection.validate','rates.push','availability.push','restrictions.push',
      'reservations.pull','reservations.receive','reservations.modify',
      'reservations.cancel','reconciliation.read'
    )
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_request_payload IS NULL OR jsonb_typeof(p_request_payload) NOT IN ('object','array') THEN
    RAISE EXCEPTION 'Invalid distribution operation request' USING ERRCODE='22023';
  END IF;
  IF p_created_by IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staynas_property_members pm
    WHERE pm.user_id=p_created_by AND pm.property_id=p_property_id
      AND pm.status='active'
      AND pm.role=ANY(ARRAY['owner','manager','admin','reservations']::public.app_role[])
  ) THEN
    RAISE EXCEPTION 'Distribution operation actor is not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_distribution_outbox(
    organisation_id,property_id,connection_id,operation_id,event_type,payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,v_operation.id,
    'distribution.operation.requested',
    jsonb_build_object('operation_id',v_operation.id,'connection_id',p_connection_id,
      'organisation_id',p_organisation_id,'property_id',p_property_id)
  ) RETURNING id INTO v_outbox_id;

  RETURN QUERY SELECT v_operation.id,v_outbox_id,false;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_outbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(outbox_id uuid,operation_id uuid,connection_id uuid,
  organisation_id uuid,property_id uuid,payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid outbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_distribution_operations op
    SET status='processing',started_at=coalesce(op.started_at,now()),
        attempt_count=c.attempt_count,updated_at=now()
    FROM claimed c WHERE op.id=c.operation_id
    RETURNING op.id
  )
  SELECT c.id,c.operation_id,c.connection_id,c.organisation_id,c.property_id,c.payload,c.lock_token
  FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_outbox(
  p_outbox_id uuid,p_lease_token uuid,p_status text,
  p_next_attempt_at timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_operation_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','retry_wait','dead_letter') THEN
    RAISE EXCEPTION 'Invalid outbox result status' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_distribution_outbox WHERE id=p_outbox_id),
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      completed_at=CASE WHEN p_status IN ('delivered','dead_letter') THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=v_operation_id;
  RETURN true;
END $$;

-- Verify provider webhook signature before calling this server-only inbox RPC.
CREATE OR REPLACE FUNCTION public.staynas_distribution_receive_reservation_event(
  p_organisation_id uuid,p_property_id uuid,p_connection_id uuid,
  p_provider_event_id text,p_external_reservation_id text,p_event_type text,
  p_event_version text,p_payload_fingerprint text,p_normalized_payload jsonb
)
RETURNS TABLE(inbox_id uuid,duplicate boolean)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_row public.staynas_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object' THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_distribution_reservation_inbox(
    organisation_id,property_id,connection_id,provider_event_id,
    external_reservation_id,event_type,event_version,payload_fingerprint,normalized_payload
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,btrim(p_provider_event_id),
    btrim(p_external_reservation_id),p_event_type,p_event_version,p_payload_fingerprint,p_normalized_payload
  ) ON CONFLICT (connection_id,provider_event_id) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id,false; RETURN;
  END IF;
  SELECT * INTO v_row FROM public.staynas_distribution_reservation_inbox
  WHERE connection_id=p_connection_id AND provider_event_id=btrim(p_provider_event_id) FOR UPDATE;
  IF v_row.payload_fingerprint<>p_payload_fingerprint
    OR v_row.external_reservation_id<>btrim(p_external_reservation_id)
    OR v_row.event_type<>p_event_type THEN
    RAISE EXCEPTION 'Provider event ID replayed with a different payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT v_row.id,true;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_claim_reservation_inbox(
  p_limit integer DEFAULT 25,p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE(inbox_id uuid,connection_id uuid,organisation_id uuid,property_id uuid,
  provider_event_id text,external_reservation_id text,event_type text,event_version text,
  payload_fingerprint text,normalized_payload jsonb,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE attempt_count>=max_attempts AND (
    processing_status IN ('received','failed')
    OR (processing_status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.lock_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_finish_reservation_inbox(
  p_inbox_id uuid,p_lease_token uuid,p_status text,p_booking_id uuid DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_safe_error_message text DEFAULT NULL,p_retry_at timestamptz DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('applied','duplicate','stale','manual_review','failed') THEN
    RAISE EXCEPTION 'Invalid reservation inbox outcome' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_distribution_reservation_inbox
  SET processing_status=CASE WHEN p_status='failed' AND attempt_count>=max_attempts THEN 'dead_letter' ELSE p_status END,
      canonical_booking_id=coalesce(p_booking_id,canonical_booking_id),
      safe_error_code=p_error_code,safe_error_message=p_safe_error_message,
      next_attempt_at=CASE WHEN p_status='failed' THEN coalesce(p_retry_at,now()) ELSE next_attempt_at END,
      processed_at=CASE WHEN p_status='failed' AND attempt_count<max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_inbox_id AND processing_status='processing' AND lock_token=p_lease_token;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.staynas_distribution_create_connection(uuid,uuid,uuid,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_upsert_mapping(uuid,uuid,uuid,uuid,text,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_enqueue_operation(uuid,uuid,uuid,text,text,text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_outbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_outbox(uuid,uuid,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_receive_reservation_event(uuid,uuid,uuid,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_claim_reservation_inbox(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_finish_reservation_inbox(uuid,uuid,text,uuid,text,text,timestamptz) TO service_role;

COMMIT;
