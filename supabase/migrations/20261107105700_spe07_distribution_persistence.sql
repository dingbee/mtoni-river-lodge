-- SPE-07 additive hospitality distribution persistence.
-- Canonical schema is deployed by supabase/migrations/20261107105700_spe07_distribution_persistence.sql.
-- Hospitality distribution tables are namespaced separately from the existing DC04/DC05 distribution infrastructure.
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

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_connections (
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

CREATE INDEX IF NOT EXISTS staynas_hospitality_distribution_connections_property_status_idx
  ON public.staynas_hospitality_distribution_connections(organisation_id,property_id,status);

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_mappings (
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
    REFERENCES public.staynas_hospitality_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_mapping_external_unique
    UNIQUE (connection_id,mapping_type,external_id),
  CONSTRAINT staynas_distribution_mapping_internal_unique
    UNIQUE (connection_id,mapping_type,internal_id)
);

CREATE INDEX IF NOT EXISTS staynas_hospitality_distribution_mappings_property_idx
  ON public.staynas_hospitality_distribution_mappings(organisation_id,property_id,connection_id,mapping_type,active);

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

DROP TRIGGER IF EXISTS staynas_distribution_mapping_validate ON public.staynas_hospitality_distribution_mappings;
CREATE TRIGGER staynas_distribution_mapping_validate
  BEFORE INSERT OR UPDATE ON public.staynas_hospitality_distribution_mappings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_validate_mapping();

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_operations (
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
    REFERENCES public.staynas_hospitality_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_operation_idempotency_unique
    UNIQUE (connection_id,operation_type,idempotency_key),
  CONSTRAINT staynas_distribution_operation_scope_unique
    UNIQUE (id,organisation_id,property_id,connection_id)
);

CREATE INDEX IF NOT EXISTS staynas_hospitality_distribution_operations_due_idx
  ON public.staynas_hospitality_distribution_operations(status,next_attempt_at,created_at)
  WHERE status IN ('queued','retry_wait');
CREATE INDEX IF NOT EXISTS staynas_hospitality_distribution_operations_property_idx
  ON public.staynas_hospitality_distribution_operations(organisation_id,property_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_outbox (
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
  CONSTRAINT staynas_hospitality_distribution_outbox_operation_fk
    FOREIGN KEY (operation_id,organisation_id,property_id,connection_id)
    REFERENCES public.staynas_hospitality_distribution_operations(id,organisation_id,property_id,connection_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS staynas_hospitality_distribution_outbox_claim_idx
  ON public.staynas_hospitality_distribution_outbox(status,next_attempt_at,created_at)
  WHERE status IN ('pending','retry_wait');

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_reservation_inbox (
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
    REFERENCES public.staynas_hospitality_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_inbox_event_unique
    UNIQUE (connection_id,provider_event_id)
);


-- Immutable provider-confirmed commercial terms, one row per received event.
-- Evidence only: this ledger never creates or mutates canonical bookings.
CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_price_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  inbox_id uuid NOT NULL UNIQUE REFERENCES public.staynas_hospitality_distribution_reservation_inbox(id) ON DELETE RESTRICT,
  external_reservation_id text NOT NULL CHECK (length(btrim(external_reservation_id)) BETWEEN 1 AND 255),
  event_version text,
  confirmed_amount_minor bigint NOT NULL CHECK (confirmed_amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  tax_amount_minor bigint CHECK (tax_amount_minor IS NULL OR tax_amount_minor >= 0),
  fee_amount_minor bigint CHECK (fee_amount_minor IS NULL OR fee_amount_minor >= 0),
  commission_amount_minor bigint CHECK (commission_amount_minor IS NULL OR commission_amount_minor >= 0),
  provider_payment_status text NOT NULL CHECK (provider_payment_status IN ('unknown','unpaid','paid','partially_paid','refunded')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','rejected')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_commitment_scope_fk
    FOREIGN KEY (connection_id,organisation_id,property_id)
    REFERENCES public.staynas_hospitality_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS staynas_distribution_commitments_external_idx
  ON public.staynas_hospitality_distribution_price_commitments(connection_id,external_reservation_id,captured_at DESC);

CREATE OR REPLACE FUNCTION public.staynas_distribution_reject_commitment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Provider price commitment evidence is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER staynas_distribution_commitment_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_hospitality_distribution_price_commitments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_reject_commitment_mutation();

ALTER TABLE public.staynas_hospitality_distribution_price_commitments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_hospitality_distribution_price_commitments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.staynas_hospitality_distribution_price_commitments TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_distribution_record_price_commitment(p_inbox_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_inbox public.staynas_hospitality_distribution_reservation_inbox%ROWTYPE;
  v_id uuid;
  v_payload jsonb;
BEGIN
  IF p_inbox_id IS NULL THEN RAISE EXCEPTION 'Inbox event is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_inbox FROM public.staynas_hospitality_distribution_reservation_inbox
  WHERE id=p_inbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation inbox event not found' USING ERRCODE='P0002'; END IF;
  IF v_inbox.event_type='cancelled' THEN
    RAISE EXCEPTION 'Cancellation events do not create price commitments' USING ERRCODE='22023';
  END IF;
  v_payload:=v_inbox.normalized_payload;
  IF jsonb_typeof(v_payload)<>'object'
    OR coalesce(v_payload->>'confirmedAmountMinor','') !~ '^[0-9]+$'
    OR upper(coalesce(v_payload->>'currency','')) !~ '^[A-Z]{3}$'
    OR (v_payload ? 'taxAmountMinor' AND v_payload->>'taxAmountMinor' IS NOT NULL AND v_payload->>'taxAmountMinor' !~ '^[0-9]+$')
    OR (v_payload ? 'feeAmountMinor' AND v_payload->>'feeAmountMinor' IS NOT NULL AND v_payload->>'feeAmountMinor' !~ '^[0-9]+$')
    OR (v_payload ? 'commissionAmountMinor' AND v_payload->>'commissionAmountMinor' IS NOT NULL AND v_payload->>'commissionAmountMinor' !~ '^[0-9]+$')
    OR (v_payload->>'paymentStatus' IS NOT NULL AND v_payload->>'paymentStatus' NOT IN ('unknown','unpaid','paid','partially_paid','refunded')) THEN
    RAISE EXCEPTION 'Provider commercial commitment contains missing or malformed fields' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.staynas_hospitality_distribution_price_commitments(
    organisation_id,property_id,connection_id,inbox_id,external_reservation_id,event_version,
    confirmed_amount_minor,currency,tax_amount_minor,fee_amount_minor,commission_amount_minor,provider_payment_status
  ) VALUES (
    v_inbox.organisation_id,v_inbox.property_id,v_inbox.connection_id,v_inbox.id,
    v_inbox.external_reservation_id,v_inbox.event_version,
    (v_payload->>'confirmedAmountMinor')::bigint,upper(v_payload->>'currency'),
    CASE WHEN v_payload->>'taxAmountMinor' IS NOT NULL THEN (v_payload->>'taxAmountMinor')::bigint END,
    CASE WHEN v_payload->>'feeAmountMinor' IS NOT NULL THEN (v_payload->>'feeAmountMinor')::bigint END,
    CASE WHEN v_payload->>'commissionAmountMinor' IS NOT NULL THEN (v_payload->>'commissionAmountMinor')::bigint END,
    coalesce(v_payload->>'paymentStatus','unknown')
  ) ON CONFLICT (inbox_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.staynas_hospitality_distribution_price_commitments WHERE inbox_id=p_inbox_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.staynas_distribution_record_price_commitment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_record_price_commitment(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_sequence_idx
  ON public.staynas_hospitality_distribution_reservation_inbox(connection_id,external_reservation_id,received_at DESC);
CREATE INDEX IF NOT EXISTS staynas_distribution_inbox_pending_idx
  ON public.staynas_hospitality_distribution_reservation_inbox(received_at)
  WHERE processing_status IN ('received','failed');

-- Integration state is server-only. Browser roles receive no direct table access.
ALTER TABLE public.staynas_hospitality_distribution_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_reservation_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_price_commitments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staynas_hospitality_distribution_connections FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_mappings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_operations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_outbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_reservation_inbox FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_price_commitments FROM PUBLIC,anon,authenticated;

GRANT ALL ON public.staynas_hospitality_distribution_connections TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_mappings TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_operations TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_outbox TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_reservation_inbox TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_price_commitments TO service_role;

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
  INSERT INTO public.staynas_hospitality_distribution_connections(
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
  INSERT INTO public.staynas_hospitality_distribution_mappings(
    organisation_id,property_id,connection_id,mapping_type,internal_id,external_id,
    active,created_by,updated_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_mapping_type,p_internal_id,
    btrim(p_external_id),coalesce(p_active,true),p_actor_id,p_actor_id
  )
  ON CONFLICT (connection_id,mapping_type,external_id) DO UPDATE
  SET internal_id=EXCLUDED.internal_id,active=EXCLUDED.active,
      version=public.staynas_hospitality_distribution_mappings.version+1,
      updated_by=p_actor_id,updated_at=now()
  WHERE public.staynas_hospitality_distribution_mappings.organisation_id=p_organisation_id
    AND public.staynas_hospitality_distribution_mappings.property_id=p_property_id
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
DECLARE v_operation public.staynas_hospitality_distribution_operations%ROWTYPE; v_outbox_id uuid;
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
    SELECT 1 FROM public.staynas_hospitality_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status IN ('draft','validating','active')
  ) THEN
    RAISE EXCEPTION 'Distribution connection scope or status denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.staynas_hospitality_distribution_operations(
    organisation_id,property_id,connection_id,operation_type,idempotency_key,
    request_fingerprint,request_payload,source_version,created_by
  ) VALUES (
    p_organisation_id,p_property_id,p_connection_id,p_operation_type,p_idempotency_key,
    p_request_fingerprint,p_request_payload,p_source_version,p_created_by
  ) ON CONFLICT (connection_id,operation_type,idempotency_key) DO NOTHING
  RETURNING * INTO v_operation;

  IF v_operation.id IS NULL THEN
    SELECT * INTO v_operation FROM public.staynas_hospitality_distribution_operations
    WHERE connection_id=p_connection_id AND operation_type=p_operation_type
      AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF v_operation.request_fingerprint<>p_request_fingerprint THEN
      RAISE EXCEPTION 'Distribution idempotency key reused with different payload' USING ERRCODE='23505';
    END IF;
    SELECT o.id INTO v_outbox_id FROM public.staynas_hospitality_distribution_outbox AS o
    WHERE o.operation_id=v_operation.id;
    RETURN QUERY SELECT v_operation.id,v_outbox_id,true;
    RETURN;
  END IF;

  INSERT INTO public.staynas_hospitality_distribution_outbox(
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
  UPDATE public.staynas_hospitality_distribution_outbox
  SET status='dead_letter',locked_at=NULL,lock_token=NULL,last_error_code='MAX_ATTEMPTS_EXCEEDED'
  WHERE attempt_count>=max_attempts AND (
    status IN ('pending','retry_wait')
    OR (status='processing' AND locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  UPDATE public.staynas_hospitality_distribution_operations op
  SET status='dead_letter',error_code='MAX_ATTEMPTS_EXCEEDED',completed_at=now(),updated_at=now()
  FROM public.staynas_hospitality_distribution_outbox ob
  WHERE ob.operation_id=op.id AND ob.status='dead_letter'
    AND op.status NOT IN ('succeeded','dead_letter','cancelled');

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.staynas_hospitality_distribution_outbox o
    WHERE (o.status IN ('pending','retry_wait') AND o.next_attempt_at<=now() AND o.attempt_count<o.max_attempts)
       OR (o.status='processing' AND o.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY o.next_attempt_at,o.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_hospitality_distribution_outbox o
    SET status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=o.attempt_count+1
    FROM candidates c WHERE o.id=c.id RETURNING o.*
  ), updated_operations AS (
    UPDATE public.staynas_hospitality_distribution_operations op
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
  UPDATE public.staynas_hospitality_distribution_outbox
  SET status=p_status,
      delivered_at=CASE WHEN p_status='delivered' THEN now() ELSE NULL END,
      next_attempt_at=CASE WHEN p_status='retry_wait' THEN coalesce(p_next_attempt_at,now()) ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='delivered' THEN NULL ELSE p_error_code END,
      locked_at=NULL,lock_token=NULL
  WHERE id=p_outbox_id AND status='processing' AND lock_token=p_lease_token
  RETURNING operation_id INTO v_operation_id;
  IF v_operation_id IS NULL THEN RETURN false; END IF;

  UPDATE public.staynas_hospitality_distribution_operations
  SET status=CASE p_status WHEN 'delivered' THEN 'succeeded'
      WHEN 'retry_wait' THEN 'retry_wait' ELSE 'dead_letter' END,
      attempt_count=(SELECT attempt_count FROM public.staynas_hospitality_distribution_outbox WHERE id=p_outbox_id),
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
DECLARE v_row public.staynas_hospitality_distribution_reservation_inbox%ROWTYPE;
BEGIN
  IF p_provider_event_id IS NULL OR length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 255
    OR p_external_reservation_id IS NULL OR length(btrim(p_external_reservation_id)) NOT BETWEEN 1 AND 255
    OR p_event_type IS NULL OR p_event_type NOT IN ('created','modified','cancelled')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_normalized_payload IS NULL OR jsonb_typeof(p_normalized_payload)<>'object'
    OR coalesce(p_normalized_payload->>'externalReservationId','')<>btrim(p_external_reservation_id)
    OR coalesce(p_normalized_payload->>'eventType','')<>p_event_type THEN
    RAISE EXCEPTION 'Invalid normalized reservation event' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_hospitality_distribution_connections c
    WHERE c.id=p_connection_id AND c.organisation_id=p_organisation_id
      AND c.property_id=p_property_id AND c.status='active'
  ) THEN
    RAISE EXCEPTION 'Reservation event connection scope or status denied' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.staynas_hospitality_distribution_reservation_inbox(
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
  SELECT * INTO v_row FROM public.staynas_hospitality_distribution_reservation_inbox
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
  payload_fingerprint text,normalized_payload jsonb,attempt_count integer,lease_token uuid)
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid inbox claim bounds' USING ERRCODE='22023';
  END IF;
  UPDATE public.staynas_hospitality_distribution_reservation_inbox AS inbox
  SET processing_status='dead_letter',locked_at=NULL,lock_token=NULL,
      safe_error_code='MAX_ATTEMPTS_EXCEEDED',
      safe_error_message='Reservation event exceeded configured processing attempts',processed_at=now()
  WHERE inbox.attempt_count>=inbox.max_attempts AND (
    inbox.processing_status IN ('received','failed')
    OR (inbox.processing_status='processing' AND inbox.locked_at<now()-make_interval(secs=>p_lease_seconds))
  );
  RETURN QUERY
  WITH candidates AS (
    SELECT i.id FROM public.staynas_hospitality_distribution_reservation_inbox i
    WHERE (i.processing_status IN ('received','failed') AND i.next_attempt_at<=now() AND i.attempt_count<i.max_attempts)
       OR (i.processing_status='processing' AND i.locked_at<now()-make_interval(secs=>p_lease_seconds))
    ORDER BY i.received_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.staynas_hospitality_distribution_reservation_inbox i
    SET processing_status='processing',locked_at=now(),lock_token=gen_random_uuid(),
        attempt_count=i.attempt_count+1
    FROM candidates c WHERE i.id=c.id RETURNING i.*
  )
  SELECT c.id,c.connection_id,c.organisation_id,c.property_id,c.provider_event_id,
    c.external_reservation_id,c.event_type,c.event_version,c.payload_fingerprint,
    c.normalized_payload,c.attempt_count,c.lock_token FROM claimed c;
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
  UPDATE public.staynas_hospitality_distribution_reservation_inbox
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



-- SPE-07.10: external reservation aggregate, allocation links and verification evidence.
-- This remains an additive review artifact; CI applies it only to an ephemeral database.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_price_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id uuid NOT NULL REFERENCES public.staynas_hospitality_distribution_price_commitments(id) ON DELETE RESTRICT,
  verification_status text NOT NULL CHECK (verification_status IN ('verified','rejected')),
  evidence_type text NOT NULL CHECK (evidence_type IN ('provider_api','provider_statement','manual_reconciliation')),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 255),
  evidence_fingerprint text NOT NULL CHECK (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commitment_id,evidence_fingerprint)
);
ALTER TABLE public.staynas_hospitality_distribution_price_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_hospitality_distribution_price_verifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.staynas_hospitality_distribution_price_verifications TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_distribution_reject_verification_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Provider price verification evidence is append-only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS staynas_distribution_price_verification_immutable ON public.staynas_hospitality_distribution_price_verifications;
CREATE TRIGGER staynas_distribution_price_verification_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_hospitality_distribution_price_verifications
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_reject_verification_mutation();

CREATE OR REPLACE FUNCTION public.staynas_distribution_record_price_verification(
  p_commitment_id uuid,p_status text,p_evidence_type text,
  p_evidence_reference text,p_evidence_fingerprint text,p_verified_by uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_commitment_id IS NULL OR p_status NOT IN ('verified','rejected')
    OR p_evidence_type NOT IN ('provider_api','provider_statement','manual_reconciliation')
    OR p_evidence_reference IS NULL OR length(btrim(p_evidence_reference)) NOT BETWEEN 1 AND 255
    OR p_evidence_fingerprint IS NULL OR p_evidence_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid provider price verification evidence' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staynas_hospitality_distribution_price_commitments WHERE id=p_commitment_id) THEN
    RAISE EXCEPTION 'Price commitment not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.staynas_hospitality_distribution_price_verifications(
    commitment_id,verification_status,evidence_type,evidence_reference,evidence_fingerprint,verified_by
  ) VALUES (
    p_commitment_id,p_status,p_evidence_type,btrim(p_evidence_reference),p_evidence_fingerprint,p_verified_by
  ) ON CONFLICT (commitment_id,evidence_fingerprint) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.staynas_hospitality_distribution_price_verifications
    WHERE commitment_id=p_commitment_id AND evidence_fingerprint=p_evidence_fingerprint;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_price_commitment_is_verified(p_inbox_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staynas_hospitality_distribution_price_commitments pc
    JOIN public.staynas_hospitality_distribution_price_verifications pv ON pv.commitment_id=pc.id
    WHERE pc.inbox_id=p_inbox_id AND pv.verification_status='verified'
      AND NOT EXISTS (
        SELECT 1 FROM public.staynas_hospitality_distribution_price_verifications rejected
        WHERE rejected.commitment_id=pc.id AND rejected.verification_status='rejected'
          AND rejected.verified_at>=pv.verified_at
      )
  )
$$;

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_external_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  property_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_reservation_id text NOT NULL CHECK (length(btrim(external_reservation_id)) BETWEEN 1 AND 255),
  latest_event_version text,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','manual_review')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_amount_minor bigint NOT NULL CHECK (total_amount_minor>=0),
  latest_commitment_id uuid NOT NULL REFERENCES public.staynas_hospitality_distribution_price_commitments(id) ON DELETE RESTRICT,
  primary_booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_external_reservation_scope_fk
    FOREIGN KEY (connection_id,organisation_id,property_id)
    REFERENCES public.staynas_hospitality_distribution_connections(id,organisation_id,property_id) ON DELETE RESTRICT,
  CONSTRAINT staynas_distribution_external_reservation_unique
    UNIQUE (connection_id,external_reservation_id),
  CONSTRAINT staynas_distribution_external_reservation_scope_unique
    UNIQUE (id,organisation_id,property_id,connection_id)
);
CREATE INDEX IF NOT EXISTS staynas_hospitality_distribution_external_reservations_property_idx
  ON public.staynas_hospitality_distribution_external_reservations(organisation_id,property_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_external_reservation_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_reservation_id uuid NOT NULL REFERENCES public.staynas_hospitality_distribution_external_reservations(id) ON DELETE RESTRICT,
  external_allocation_id text NOT NULL CHECK (length(btrim(external_allocation_id)) BETWEEN 1 AND 255),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  adults integer NOT NULL CHECK (adults BETWEEN 1 AND 20),
  children integer NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 20),
  amount_minor bigint NOT NULL CHECK (amount_minor>=0),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staynas_distribution_external_allocation_dates CHECK (departure_date>arrival_date),
  CONSTRAINT staynas_distribution_external_allocation_unique
    UNIQUE (external_reservation_id,external_allocation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS staynas_distribution_external_allocation_booking_uidx
  ON public.staynas_hospitality_distribution_external_reservation_allocations(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.staynas_hospitality_distribution_external_reservation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_reservation_id uuid NOT NULL REFERENCES public.staynas_hospitality_distribution_external_reservations(id) ON DELETE RESTRICT,
  inbox_id uuid NOT NULL UNIQUE REFERENCES public.staynas_hospitality_distribution_reservation_inbox(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created','modified','cancelled')),
  event_version text,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  payload_snapshot jsonb NOT NULL CHECK (jsonb_typeof(payload_snapshot)='object'),
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.staynas_distribution_reject_external_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'External reservation event history is append-only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS staynas_distribution_external_event_immutable ON public.staynas_hospitality_distribution_external_reservation_events;
CREATE TRIGGER staynas_distribution_external_event_immutable
  BEFORE UPDATE OR DELETE ON public.staynas_hospitality_distribution_external_reservation_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_reject_external_event_mutation();

ALTER TABLE public.staynas_hospitality_distribution_external_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_external_reservation_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_hospitality_distribution_external_reservation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_hospitality_distribution_external_reservations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_external_reservation_allocations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.staynas_hospitality_distribution_external_reservation_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.staynas_hospitality_distribution_external_reservations TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_external_reservation_allocations TO service_role;
GRANT ALL ON public.staynas_hospitality_distribution_external_reservation_events TO service_role;

-- Existing mapping_type='room_type' is now an exact sellable room-type mapping,
-- not a broad display-category mapping. No fuzzy category-to-room inference.
CREATE OR REPLACE FUNCTION public.staynas_distribution_validate_mapping()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.mapping_type='room_type' AND NOT EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id=NEW.internal_id AND r.property_id=NEW.property_id AND r.status='active'
  ) THEN
    RAISE EXCEPTION 'Room-type mapping must reference an active sellable room type in the same property' USING ERRCODE='23503';
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


CREATE OR REPLACE FUNCTION public.staynas_distribution_validate_external_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_commitment public.staynas_hospitality_distribution_price_commitments%ROWTYPE;
  v_booking_property uuid;
BEGIN
  SELECT * INTO v_commitment FROM public.staynas_hospitality_distribution_price_commitments
  WHERE id=NEW.latest_commitment_id;
  IF NOT FOUND OR v_commitment.connection_id<>NEW.connection_id
    OR v_commitment.organisation_id<>NEW.organisation_id
    OR v_commitment.property_id<>NEW.property_id
    OR v_commitment.external_reservation_id<>NEW.external_reservation_id
    OR v_commitment.currency<>NEW.currency
    OR v_commitment.confirmed_amount_minor<>NEW.total_amount_minor THEN
    RAISE EXCEPTION 'External reservation commitment scope or amount mismatch' USING ERRCODE='23503';
  END IF;
  IF NEW.primary_booking_id IS NOT NULL THEN
    SELECT property_id INTO v_booking_property FROM public.bookings WHERE id=NEW.primary_booking_id;
    IF v_booking_property IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'Primary booking belongs to another property' USING ERRCODE='23503';
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staynas_distribution_external_reservation_scope_trg ON public.staynas_hospitality_distribution_external_reservations;
CREATE TRIGGER staynas_distribution_external_reservation_scope_trg
  BEFORE INSERT OR UPDATE ON public.staynas_hospitality_distribution_external_reservations
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_validate_external_reservation();

CREATE OR REPLACE FUNCTION public.staynas_distribution_validate_external_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_property_id uuid;
  v_room_property uuid;
  v_booking_property uuid;
BEGIN
  SELECT property_id INTO v_property_id
  FROM public.staynas_hospitality_distribution_external_reservations WHERE id=NEW.external_reservation_id;
  SELECT property_id INTO v_room_property FROM public.rooms WHERE id=NEW.room_id;
  IF v_property_id IS NULL OR v_room_property IS DISTINCT FROM v_property_id THEN
    RAISE EXCEPTION 'External allocation room belongs to another property' USING ERRCODE='23503';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT property_id INTO v_booking_property FROM public.bookings WHERE id=NEW.booking_id;
    IF v_booking_property IS DISTINCT FROM v_property_id THEN
      RAISE EXCEPTION 'External allocation booking belongs to another property' USING ERRCODE='23503';
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staynas_distribution_external_allocation_scope_trg ON public.staynas_hospitality_distribution_external_reservation_allocations;
CREATE TRIGGER staynas_distribution_external_allocation_scope_trg
  BEFORE INSERT OR UPDATE ON public.staynas_hospitality_distribution_external_reservation_allocations
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_validate_external_allocation();

CREATE OR REPLACE FUNCTION public.staynas_distribution_validate_external_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_reservation public.staynas_hospitality_distribution_external_reservations%ROWTYPE;
  v_inbox public.staynas_hospitality_distribution_reservation_inbox%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM public.staynas_hospitality_distribution_external_reservations WHERE id=NEW.external_reservation_id;
  SELECT * INTO v_inbox FROM public.staynas_hospitality_distribution_reservation_inbox WHERE id=NEW.inbox_id;
  IF v_reservation.id IS NULL OR v_inbox.id IS NULL
    OR v_reservation.connection_id<>v_inbox.connection_id
    OR v_reservation.organisation_id<>v_inbox.organisation_id
    OR v_reservation.property_id<>v_inbox.property_id
    OR v_reservation.external_reservation_id<>v_inbox.external_reservation_id
    OR NEW.event_type<>v_inbox.event_type
    OR NEW.payload_fingerprint<>v_inbox.payload_fingerprint THEN
    RAISE EXCEPTION 'External reservation event scope or evidence mismatch' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staynas_distribution_external_event_scope_trg ON public.staynas_hospitality_distribution_external_reservation_events;
CREATE TRIGGER staynas_distribution_external_event_scope_trg
  BEFORE INSERT ON public.staynas_hospitality_distribution_external_reservation_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_distribution_validate_external_event();

-- ISO currency minor-unit exponent for supported booking currencies.
-- Three-decimal and four-decimal currencies are intentionally rejected by the
-- canonical booking writer because bookings store money at two decimal places.
CREATE OR REPLACE FUNCTION public.staynas_currency_minor_unit_exponent(p_currency text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE upper(p_currency)
    WHEN 'BIF' THEN 0 WHEN 'CLP' THEN 0 WHEN 'DJF' THEN 0 WHEN 'GNF' THEN 0
    WHEN 'ISK' THEN 0 WHEN 'JPY' THEN 0 WHEN 'KMF' THEN 0 WHEN 'KRW' THEN 0
    WHEN 'PYG' THEN 0 WHEN 'RWF' THEN 0 WHEN 'UGX' THEN 0 WHEN 'UYI' THEN 0
    WHEN 'VND' THEN 0 WHEN 'VUV' THEN 0 WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0
    WHEN 'XPF' THEN 0 WHEN 'TWD' THEN 0 WHEN 'TZS' THEN 0
    WHEN 'BHD' THEN 3 WHEN 'IQD' THEN 3 WHEN 'JOD' THEN 3 WHEN 'KWD' THEN 3
    WHEN 'LYD' THEN 3 WHEN 'OMR' THEN 3 WHEN 'TND' THEN 3
    WHEN 'CLF' THEN 4
    ELSE 2
  END
$$;

CREATE OR REPLACE FUNCTION public.staynas_distribution_apply_reservation_event(p_inbox_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_inbox public.staynas_hospitality_distribution_reservation_inbox%ROWTYPE;
  v_connection public.staynas_hospitality_distribution_connections%ROWTYPE;
  v_commitment public.staynas_hospitality_distribution_price_commitments%ROWTYPE;
  v_reservation public.staynas_hospitality_distribution_external_reservations%ROWTYPE;
  v_alloc jsonb;
  v_allocations jsonb;
  v_room public.rooms%ROWTYPE;
  v_room_id uuid;
  v_booking_id uuid;
  v_primary_booking_id uuid;
  v_reservation_id uuid;
  v_reference text;
  v_currency text;
  v_exponent integer;
  v_total numeric;
  v_amount numeric;
  v_nights integer;
  v_day date;
  v_rate numeric;
  v_units integer;
  v_blocked boolean;
  v_holds integer;
  v_status text;
  v_old_alloc public.staynas_hospitality_distribution_external_reservation_allocations%ROWTYPE;
  v_existing_count integer;
  v_incoming_count integer;
  v_version_numeric boolean;
BEGIN
  IF p_inbox_id IS NULL THEN RAISE EXCEPTION 'Inbox event is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_inbox FROM public.staynas_hospitality_distribution_reservation_inbox
  WHERE id=p_inbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation inbox event not found' USING ERRCODE='P0002'; END IF;
  IF v_inbox.processing_status NOT IN ('processing','manual_review') THEN
    RAISE EXCEPTION 'Reservation inbox event is not claimed for processing' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_connection FROM public.staynas_hospitality_distribution_connections
  WHERE id=v_inbox.connection_id AND organisation_id=v_inbox.organisation_id
    AND property_id=v_inbox.property_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','reason','Distribution connection is not active.'); END IF;

  SELECT * INTO v_reservation FROM public.staynas_hospitality_distribution_external_reservations
  WHERE connection_id=v_inbox.connection_id
    AND external_reservation_id=v_inbox.external_reservation_id
  FOR UPDATE;

  IF v_inbox.event_type='cancelled' THEN
    IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','reason','No canonical external reservation exists to cancel.'); END IF;
    IF v_reservation.status='cancelled' THEN
      RETURN jsonb_build_object('status','duplicate','booking_id',v_reservation.primary_booking_id);
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.staynas_hospitality_distribution_external_reservation_allocations a
      JOIN public.bookings b ON b.id=a.booking_id
      WHERE a.external_reservation_id=v_reservation.id AND a.status='confirmed'
        AND b.status::text NOT IN ('pending','confirmed','cancelled')
    ) THEN
      RETURN jsonb_build_object('status','manual_review','reason','A linked booking has progressed operationally and requires staff-led cancellation.');
    END IF;
    IF v_inbox.event_version IS NULL OR v_reservation.latest_event_version IS NULL
      OR v_inbox.event_version !~ '^[0-9]+$' OR v_reservation.latest_event_version !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('status','manual_review','reason','Cancellation event version is missing or non-numeric.');
    END IF;
    IF v_inbox.event_version::numeric<=v_reservation.latest_event_version::numeric THEN
      RETURN jsonb_build_object('status','stale');
    END IF;
    FOR v_old_alloc IN
      SELECT * FROM public.staynas_hospitality_distribution_external_reservation_allocations
      WHERE external_reservation_id=v_reservation.id AND status='confirmed'
      ORDER BY id FOR UPDATE
    LOOP
      IF v_old_alloc.booking_id IS NOT NULL THEN
        SELECT status::text INTO v_status FROM public.bookings WHERE id=v_old_alloc.booking_id FOR UPDATE;
        IF v_status IN ('pending','confirmed') THEN
          PERFORM public.staynas_transition_booking_core(
            v_old_alloc.booking_id,'cancelled','Cancelled by external distribution provider',NULL,'distribution',v_inbox.property_id
          );
        ELSIF v_status<>'cancelled' THEN
          RETURN jsonb_build_object('status','manual_review','reason','A linked booking has progressed operationally and requires staff-led cancellation.');
        END IF;
      END IF;
      UPDATE public.staynas_hospitality_distribution_external_reservation_allocations
      SET status='cancelled',updated_at=now() WHERE id=v_old_alloc.id;
    END LOOP;
    UPDATE public.staynas_hospitality_distribution_external_reservations
    SET status='cancelled',latest_event_version=v_inbox.event_version,updated_at=now()
    WHERE id=v_reservation.id;
    INSERT INTO public.staynas_hospitality_distribution_external_reservation_events(
      external_reservation_id,inbox_id,event_type,event_version,payload_fingerprint,payload_snapshot
    ) VALUES(v_reservation.id,v_inbox.id,v_inbox.event_type,v_inbox.event_version,
      v_inbox.payload_fingerprint,v_inbox.normalized_payload);
    RETURN jsonb_build_object('status','applied','booking_id',v_reservation.primary_booking_id,'reservation_id',v_reservation.id);
  END IF;

  SELECT * INTO v_commitment FROM public.staynas_hospitality_distribution_price_commitments
  WHERE inbox_id=p_inbox_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','reason','Provider financial commitment evidence is missing.'); END IF;
  IF coalesce(v_inbox.normalized_payload->>'externalReservationId','')<>v_inbox.external_reservation_id
    OR coalesce(v_inbox.normalized_payload->>'eventType','')<>v_inbox.event_type
    OR (v_inbox.normalized_payload ? 'eventId'
      AND v_inbox.normalized_payload->>'eventId'<>v_inbox.provider_event_id)
    OR (v_inbox.normalized_payload ? 'provider'
      AND v_inbox.normalized_payload->>'provider'<>v_connection.provider)
    OR (v_inbox.normalized_payload ? 'externalAccountId'
      AND v_inbox.normalized_payload->>'externalAccountId'<>v_connection.external_account_id)
    OR (v_inbox.normalized_payload ? 'externalPropertyId'
      AND v_inbox.normalized_payload->>'externalPropertyId'<>v_connection.external_property_id)
    OR (v_inbox.normalized_payload ? 'eventVersion'
      AND coalesce(v_inbox.normalized_payload->>'eventVersion','')<>coalesce(v_inbox.event_version,'')) THEN
    RETURN jsonb_build_object('status','manual_review','reason','Normalized provider identity does not match the authenticated connection and inbox envelope.');
  END IF;
  IF NOT public.staynas_distribution_price_commitment_is_verified(p_inbox_id) THEN
    RETURN jsonb_build_object('status','manual_review','reason','Provider price has not been independently verified.'); 
  END IF;
  v_currency:=v_commitment.currency;
  v_exponent:=public.staynas_currency_minor_unit_exponent(v_currency);
  IF v_exponent>2 THEN
    RETURN jsonb_build_object('status','manual_review','reason','Provider currency precision exceeds canonical booking monetary precision.');
  END IF;
  v_total:=v_commitment.confirmed_amount_minor::numeric/power(10::numeric,v_exponent);
  IF coalesce(v_commitment.tax_amount_minor,0)+coalesce(v_commitment.fee_amount_minor,0)>v_commitment.confirmed_amount_minor THEN
    RETURN jsonb_build_object('status','manual_review','reason','Provider tax and fee components exceed the confirmed reservation amount.');
  END IF;

  v_allocations:=v_inbox.normalized_payload->'allocations';
  IF v_allocations IS NULL THEN
    v_allocations:=jsonb_build_array(jsonb_build_object(
      'externalAllocationId','primary',
      'roomTypeExternalId',v_inbox.normalized_payload->>'roomTypeExternalId',
      'arrivalDate',v_inbox.normalized_payload->>'arrivalDate',
      'departureDate',v_inbox.normalized_payload->>'departureDate',
      'adults',v_inbox.normalized_payload->>'adults',
      'children',coalesce(v_inbox.normalized_payload->>'children','0'),
      'confirmedAmountMinor',v_commitment.confirmed_amount_minor
    ));
  END IF;
  IF jsonb_typeof(v_allocations)<>'array' OR jsonb_array_length(v_allocations)<1 OR jsonb_array_length(v_allocations)>20 THEN
    RETURN jsonb_build_object('status','manual_review','reason','Reservation room allocations are missing or exceed the supported limit.');
  END IF;
  IF (SELECT coalesce(sum((item->>'confirmedAmountMinor')::numeric),0) FROM jsonb_array_elements(v_allocations) item)
      <>v_commitment.confirmed_amount_minor THEN
    RETURN jsonb_build_object('status','manual_review','reason','Room allocation amounts do not reconcile to provider-confirmed reservation total.');
  END IF;

  IF v_inbox.event_type='created' AND v_reservation.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','booking_id',v_reservation.primary_booking_id,'reservation_id',v_reservation.id);
  END IF;
  IF v_inbox.event_type='modified' THEN
    IF v_reservation.id IS NULL OR v_reservation.status<>'confirmed' THEN
      RETURN jsonb_build_object('status','manual_review','reason','No active canonical external reservation exists to modify.');
    END IF;
    IF v_inbox.event_version IS NULL OR v_reservation.latest_event_version IS NULL
      OR v_inbox.event_version !~ '^[0-9]+$' OR v_reservation.latest_event_version !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('status','manual_review','reason','Modification event version is missing or non-numeric.');
    END IF;
    IF v_inbox.event_version::numeric<=v_reservation.latest_event_version::numeric THEN
      RETURN jsonb_build_object('status','stale');
    END IF;
    SELECT count(*) INTO v_existing_count
    FROM public.staynas_hospitality_distribution_external_reservation_allocations
    WHERE external_reservation_id=v_reservation.id AND status='confirmed';
    v_incoming_count:=jsonb_array_length(v_allocations);
    IF v_existing_count<>v_incoming_count THEN
      RETURN jsonb_build_object('status','manual_review','reason','Room-count changes require staff review until allocation replacement is separately verified.');
    END IF;
    FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocations)
    LOOP
      SELECT * INTO v_old_alloc FROM public.staynas_hospitality_distribution_external_reservation_allocations
      WHERE external_reservation_id=v_reservation.id
        AND external_allocation_id=v_alloc->>'externalAllocationId' AND status='confirmed'
      FOR UPDATE;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','reason','Modification changed the external room-allocation identity.'); END IF;
      SELECT r.* INTO v_room FROM public.rooms r
      JOIN public.staynas_hospitality_distribution_mappings m
        ON m.internal_id=r.id AND m.mapping_type='room_type' AND m.active=true
      WHERE m.connection_id=v_inbox.connection_id
        AND m.external_id=v_alloc->>'roomTypeExternalId'
        AND r.property_id=v_inbox.property_id AND r.status='active';
      IF NOT FOUND OR v_room.id<>v_old_alloc.room_id
        OR v_old_alloc.arrival_date<>(v_alloc->>'arrivalDate')::date
        OR v_old_alloc.departure_date<>(v_alloc->>'departureDate')::date
        OR v_old_alloc.adults<>(v_alloc->>'adults')::integer
        OR v_old_alloc.children<>coalesce((v_alloc->>'children')::integer,0) THEN
        RETURN jsonb_build_object('status','manual_review','reason','Date, room or occupancy changes require staff-led reallocation.');
      END IF;
    END LOOP;
    FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocations)
    LOOP
      SELECT * INTO v_old_alloc FROM public.staynas_hospitality_distribution_external_reservation_allocations
      WHERE external_reservation_id=v_reservation.id
        AND external_allocation_id=v_alloc->>'externalAllocationId' AND status='confirmed' FOR UPDATE;
      v_amount:=(v_alloc->>'confirmedAmountMinor')::numeric/power(10::numeric,v_exponent);
      UPDATE public.bookings SET subtotal=v_amount,extras_total=0,
        taxes=round(coalesce(v_commitment.tax_amount_minor,0)::numeric/power(10::numeric,v_exponent),2),
        total=v_amount,deposit_amount=0,balance_amount=v_amount,balance_due=v_amount
      WHERE id=v_old_alloc.booking_id;
      UPDATE public.staynas_hospitality_distribution_external_reservation_allocations
      SET amount_minor=(v_alloc->>'confirmedAmountMinor')::bigint,updated_at=now()
      WHERE id=v_old_alloc.id;
      UPDATE public.booking_nights
      SET nightly_rate=CASE WHEN date=v_old_alloc.departure_date-1
          THEN v_amount-round(v_amount/(v_old_alloc.departure_date-v_old_alloc.arrival_date),2)
            *((v_old_alloc.departure_date-v_old_alloc.arrival_date)-1)
          ELSE round(v_amount/(v_old_alloc.departure_date-v_old_alloc.arrival_date),2) END
      WHERE booking_id=v_old_alloc.booking_id;
    END LOOP;
    UPDATE public.staynas_hospitality_distribution_external_reservations
    SET latest_event_version=v_inbox.event_version,total_amount_minor=v_commitment.confirmed_amount_minor,
      latest_commitment_id=v_commitment.id,updated_at=now()
    WHERE id=v_reservation.id;
    INSERT INTO public.staynas_hospitality_distribution_external_reservation_events(
      external_reservation_id,inbox_id,event_type,event_version,payload_fingerprint,payload_snapshot
    ) VALUES(v_reservation.id,v_inbox.id,v_inbox.event_type,v_inbox.event_version,
      v_inbox.payload_fingerprint,v_inbox.normalized_payload);
    RETURN jsonb_build_object('status','applied','booking_id',v_reservation.primary_booking_id,'reservation_id',v_reservation.id);
  END IF;

  IF nullif(btrim(v_inbox.normalized_payload#>>'{guest,fullName}'),'') IS NULL
    OR nullif(btrim(v_inbox.normalized_payload#>>'{guest,email}'),'') IS NULL THEN
    RETURN jsonb_build_object('status','manual_review','reason','Guest name and email are required by the canonical guest-linking contract.');
  END IF;

  -- Preflight every exact room mapping, property, capacity and currency before
  -- inserting the aggregate or decrementing inventory.
  FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocations)
  LOOP
    IF nullif(v_alloc->>'externalAllocationId','') IS NULL
      OR nullif(v_alloc->>'roomTypeExternalId','') IS NULL
      OR (v_alloc->>'departureDate')::date<=(v_alloc->>'arrivalDate')::date
      OR (v_alloc->>'adults')::integer<1
      OR coalesce((v_alloc->>'children')::integer,0)<0 THEN
      RETURN jsonb_build_object('status','manual_review','reason','A room allocation has invalid identity, dates or occupancy.');
    END IF;
    SELECT r.* INTO v_room FROM public.rooms r
    JOIN public.staynas_hospitality_distribution_mappings m
      ON m.internal_id=r.id AND m.mapping_type='room_type' AND m.active=true
    WHERE m.connection_id=v_inbox.connection_id
      AND m.organisation_id=v_inbox.organisation_id AND m.property_id=v_inbox.property_id
      AND m.external_id=v_alloc->>'roomTypeExternalId'
      AND r.property_id=v_inbox.property_id AND r.status='active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status','manual_review','reason','No exact active room-type mapping exists for a provider allocation.');
    END IF;
    IF (v_alloc->>'adults')::integer+coalesce((v_alloc->>'children')::integer,0)>v_room.max_occupancy THEN
      RETURN jsonb_build_object('status','manual_review','reason','Provider occupancy exceeds the mapped room-type capacity.');
    END IF;
    IF upper(v_room.currency)<>v_currency THEN
      RETURN jsonb_build_object('status','manual_review','reason','Provider currency differs from the mapped room-type currency; FX conversion is not inferred.');
    END IF;
    IF nullif(v_alloc->>'ratePlanExternalId','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.staynas_hospitality_distribution_mappings rm
      WHERE rm.connection_id=v_inbox.connection_id AND rm.property_id=v_inbox.property_id
        AND rm.mapping_type='rate_plan' AND rm.active=true
        AND rm.external_id=v_alloc->>'ratePlanExternalId'
    ) THEN
      RETURN jsonb_build_object('status','manual_review','reason','Provider rate-plan mapping is missing or inactive.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.staynas_hospitality_distribution_external_reservation_allocations a
      WHERE a.external_reservation_id=v_reservation.id
        AND a.external_allocation_id=v_alloc->>'externalAllocationId' AND a.status='confirmed'
    ) THEN
      RETURN jsonb_build_object('status','manual_review','reason','External allocation identity already exists.');
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext(lower(v_inbox.normalized_payload#>>'{guest,email}')));

  INSERT INTO public.staynas_hospitality_distribution_external_reservations(
    organisation_id,property_id,connection_id,external_reservation_id,
    latest_event_version,status,currency,total_amount_minor,latest_commitment_id
  ) VALUES (
    v_inbox.organisation_id,v_inbox.property_id,v_inbox.connection_id,
    v_inbox.external_reservation_id,v_inbox.event_version,'confirmed',v_currency,
    v_commitment.confirmed_amount_minor,v_commitment.id
  ) RETURNING id INTO v_reservation_id;

  FOR v_alloc IN SELECT value FROM jsonb_array_elements(v_allocations)
  LOOP
    SELECT r.* INTO v_room FROM public.rooms r
    JOIN public.staynas_hospitality_distribution_mappings m
      ON m.internal_id=r.id AND m.mapping_type='room_type' AND m.active=true
    WHERE m.connection_id=v_inbox.connection_id
      AND m.external_id=v_alloc->>'roomTypeExternalId'
      AND r.property_id=v_inbox.property_id AND r.status='active';
    v_amount:=(v_alloc->>'confirmedAmountMinor')::numeric/power(10::numeric,v_exponent);
    v_nights:=(v_alloc->>'departureDate')::date-(v_alloc->>'arrivalDate')::date;
    v_day:=(v_alloc->>'arrivalDate')::date;
    WHILE v_day<(v_alloc->>'departureDate')::date LOOP
      INSERT INTO public.room_inventory(room_id,date,available_units)
      VALUES(v_room.id,v_day,v_room.total_units) ON CONFLICT(room_id,date) DO NOTHING;
      SELECT available_units,is_blocked INTO v_units,v_blocked
      FROM public.room_inventory WHERE room_id=v_room.id AND date=v_day FOR UPDATE;
      SELECT count(*) INTO v_holds FROM public.booking_holds h
      WHERE h.room_id=v_room.id AND h.status='active' AND h.expires_at>now()
        AND h.check_in<=v_day AND h.check_out>v_day;
      IF v_blocked OR v_units-coalesce(v_holds,0)<=0 THEN
        RAISE EXCEPTION 'No sellable inventory remains for mapped room type on %',v_day USING ERRCODE='P0001';
      END IF;
      UPDATE public.room_inventory SET available_units=available_units-1
      WHERE room_id=v_room.id AND date=v_day;
      v_day:=v_day+1;
    END LOOP;

    v_reference:='OTA-'||upper(substr(md5(v_inbox.connection_id::text||v_inbox.external_reservation_id||(v_alloc->>'externalAllocationId')),1,12));
    INSERT INTO public.bookings(
      reference,room_id,property_id,check_in,check_out,nights,adults,children,
      guest_name,guest_email,guest_phone,currency,source,
      subtotal,extras_total,taxes,total,deposit_amount,balance_amount,balance_due,pricing_snapshot
    ) VALUES (
      v_reference,v_room.id,v_inbox.property_id,(v_alloc->>'arrivalDate')::date,
      (v_alloc->>'departureDate')::date,v_nights,(v_alloc->>'adults')::integer,
      coalesce((v_alloc->>'children')::integer,0),
      nullif(btrim(v_inbox.normalized_payload#>>'{guest,fullName}'),''),
      lower(nullif(btrim(v_inbox.normalized_payload#>>'{guest,email}'),'')),
      nullif(btrim(v_inbox.normalized_payload#>>'{guest,phone}'),''),
      v_currency,'ota:'||v_connection.provider,
      v_amount,0,
      round(coalesce(v_commitment.tax_amount_minor,0)::numeric/power(10::numeric,v_exponent),2),
      v_amount,0,v_amount,v_amount,
      jsonb_build_object('source','distribution','commitment_id',v_commitment.id,
        'external_reservation_id',v_inbox.external_reservation_id,
        'external_allocation_id',v_alloc->>'externalAllocationId',
        'amount_minor',(v_alloc->>'confirmedAmountMinor')::bigint,'currency',v_currency,
        'event_version',v_inbox.event_version,'tax_amount_minor',v_commitment.tax_amount_minor,
        'fee_amount_minor',v_commitment.fee_amount_minor,'commission_amount_minor',v_commitment.commission_amount_minor,
        'provider_payment_status',v_commitment.provider_payment_status)
    ) RETURNING id INTO v_booking_id;

    v_day:=(v_alloc->>'arrivalDate')::date;
    WHILE v_day<(v_alloc->>'departureDate')::date LOOP
      v_rate:=CASE WHEN v_day=(v_alloc->>'departureDate')::date-1
        THEN v_amount-round(v_amount/v_nights,2)*(v_nights-1)
        ELSE round(v_amount/v_nights,2) END;
      INSERT INTO public.booking_nights(booking_id,room_id,date,nightly_rate,pricing_snapshot)
      VALUES(v_booking_id,v_room.id,v_day,v_rate,
        jsonb_build_object('source','distribution','commitment_id',v_commitment.id,'currency',v_currency));
      v_day:=v_day+1;
    END LOOP;

    PERFORM public.staynas_transition_booking_core(
      v_booking_id,'confirmed','Confirmed by external distribution provider',NULL,'distribution',v_inbox.property_id
    );
    INSERT INTO public.staynas_hospitality_distribution_external_reservation_allocations(
      external_reservation_id,external_allocation_id,room_id,arrival_date,departure_date,
      adults,children,amount_minor,booking_id
    ) VALUES (
      v_reservation_id,v_alloc->>'externalAllocationId',v_room.id,
      (v_alloc->>'arrivalDate')::date,(v_alloc->>'departureDate')::date,
      (v_alloc->>'adults')::integer,coalesce((v_alloc->>'children')::integer,0),
      (v_alloc->>'confirmedAmountMinor')::bigint,v_booking_id
    );
    IF v_primary_booking_id IS NULL THEN v_primary_booking_id:=v_booking_id; END IF;
  END LOOP;

  UPDATE public.staynas_hospitality_distribution_external_reservations
  SET primary_booking_id=v_primary_booking_id,updated_at=now()
  WHERE id=v_reservation_id;
  INSERT INTO public.staynas_hospitality_distribution_external_reservation_events(
    external_reservation_id,inbox_id,event_type,event_version,payload_fingerprint,payload_snapshot
  ) VALUES(v_reservation_id,v_inbox.id,v_inbox.event_type,v_inbox.event_version,
    v_inbox.payload_fingerprint,v_inbox.normalized_payload);
  RETURN jsonb_build_object('status','applied','booking_id',v_primary_booking_id,'reservation_id',v_reservation_id);
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('status','manual_review','reason','Mapped room inventory is unavailable for one or more requested nights.');
  WHEN OTHERS THEN
    RAISE;
END $$;

REVOKE ALL ON FUNCTION public.staynas_distribution_record_price_verification(uuid,text,text,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_price_commitment_is_verified(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_distribution_apply_reservation_event(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_record_price_verification(uuid,text,text,text,text,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_price_commitment_is_verified(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.staynas_distribution_apply_reservation_event(uuid)
  TO service_role;

COMMIT;
