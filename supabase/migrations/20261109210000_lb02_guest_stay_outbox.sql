-- LB-02.01/03/04 — StayNas source-side opaque guest references and transactional outbox.
-- Additive and product-local. No guest PII is copied into integration storage or payloads.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lb02_guest_reference_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE RESTRICT,
  guest_reference uuid NOT NULL DEFAULT gen_random_uuid(),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lb02_guest_reference_per_property_uq UNIQUE(connection_id, property_id, guest_id),
  CONSTRAINT lb02_guest_reference_id_uq UNIQUE(connection_id, property_id, guest_reference),
  CONSTRAINT lb02_guest_reference_identity_fk_uq UNIQUE(connection_id, property_id, guest_id, guest_reference),
  CONSTRAINT lb02_guest_reference_revocation_ck CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE TABLE IF NOT EXISTS public.lb02_guest_stay_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  property_id uuid NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE RESTRICT,
  guest_reference uuid NOT NULL,
  stay_reference uuid NOT NULL DEFAULT gen_random_uuid(),
  status_version bigint NOT NULL DEFAULT 0 CHECK (status_version >= 0),
  last_projected_status text CHECK (last_projected_status IS NULL OR last_projected_status IN
    ('expected','checked_in','checked_out','cancelled','no_show')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lb02_guest_stay_reference_connection_booking_uq UNIQUE(connection_id, booking_id),
  CONSTRAINT lb02_guest_stay_reference_stay_ref_uq UNIQUE(connection_id, stay_reference),
  CONSTRAINT lb02_guest_stay_reference_guest_fk FOREIGN KEY(connection_id, property_id, guest_id, guest_reference)
    REFERENCES public.lb02_guest_reference_registry(connection_id, property_id, guest_id, guest_reference)
    ON DELETE RESTRICT,
  CONSTRAINT lb02_guest_stay_reference_revocation_ck CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX IF NOT EXISTS lb02_guest_stay_references_property_idx
  ON public.lb02_guest_stay_references(connection_id, property_id, revoked_at);

CREATE TABLE IF NOT EXISTS public.lb02_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.staynas_product_connections(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'property.profile_published.v1','property.status_changed.v1',
    'guest.reference_issued.v1','guest.reference_revoked.v1','guest.stay_status_changed.v1'
  )),
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version = 1),
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
  correlation_id text NOT NULL,
  causation_id uuid,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','delivered','dead_lettered','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  delivered_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lb02_outbox_idempotency_uq UNIQUE(connection_id, idempotency_key),
  CONSTRAINT lb02_outbox_payload_no_pii_ck CHECK (
    NOT (payload ?| ARRAY['name','email','phone','address','dateOfBirth','guestName','guestEmail','guestPhone','guestId','bookingId'])
  )
);
CREATE INDEX IF NOT EXISTS lb02_outbox_dispatch_idx
  ON public.lb02_outbox_events(state, available_at, created_at)
  WHERE state IN ('pending','leased');
CREATE INDEX IF NOT EXISTS lb02_outbox_connection_idx
  ON public.lb02_outbox_events(connection_id, created_at DESC);

ALTER TABLE public.lb02_guest_reference_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lb02_guest_stay_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lb02_outbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lb02_guest_reference_registry, public.lb02_guest_stay_references,
  public.lb02_outbox_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lb02_guest_reference_registry, public.lb02_guest_stay_references,
  public.lb02_outbox_events TO service_role;

CREATE OR REPLACE FUNCTION public.lb02_enqueue_stay_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $lb02$
DECLARE
  v_status text;
  v_guest_ref public.lb02_guest_reference_registry%ROWTYPE;
  v_stay_ref public.lb02_guest_stay_references%ROWTYPE;
  v_connection record;
  v_version bigint;
  v_occurred_at timestamptz := clock_timestamp();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.guest_id IS NOT DISTINCT FROM OLD.guest_id
     AND NEW.property_id IS NOT DISTINCT FROM OLD.property_id THEN
    RETURN NEW;
  END IF;
  IF NEW.guest_id IS NULL THEN RETURN NEW; END IF;
  v_status := CASE NEW.status::text
    WHEN 'confirmed' THEN 'expected'
    WHEN 'checked_in' THEN 'checked_in'
    WHEN 'completed' THEN 'checked_out'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'no_show' THEN 'no_show'
    ELSE NULL
  END;
  IF v_status IS NULL THEN RETURN NEW; END IF;

  FOR v_connection IN
    SELECT c.id, c.correlation_id, c.integration_property_id
    FROM public.staynas_product_connections c
    WHERE c.local_property_id = NEW.property_id
      AND c.remote_product = 'lexibite'
      AND c.status = 'active'
      AND c.local_approved_at IS NOT NULL
      AND c.remote_approved_at IS NOT NULL
  LOOP
    INSERT INTO public.lb02_guest_reference_registry(connection_id, property_id, guest_id)
    VALUES (v_connection.id, NEW.property_id, NEW.guest_id)
    ON CONFLICT (connection_id, property_id, guest_id) DO UPDATE
      SET updated_at = now()
      WHERE public.lb02_guest_reference_registry.revoked_at IS NULL
    RETURNING * INTO v_guest_ref;
    IF v_guest_ref.id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.lb02_guest_stay_references(
      connection_id, property_id, booking_id, guest_id, guest_reference, last_projected_status, status_version
    ) VALUES (
      v_connection.id, NEW.property_id, NEW.id, NEW.guest_id, v_guest_ref.guest_reference, v_status, 1
    )
    ON CONFLICT (connection_id, booking_id) DO UPDATE
      SET guest_id = EXCLUDED.guest_id,
          property_id = EXCLUDED.property_id,
          guest_reference = EXCLUDED.guest_reference,
          last_projected_status = EXCLUDED.last_projected_status,
          status_version = public.lb02_guest_stay_references.status_version + 1,
          updated_at = now(),
          revoked_at = NULL
    RETURNING * INTO v_stay_ref;

    v_version := v_stay_ref.status_version;
    INSERT INTO public.lb02_outbox_events(
      connection_id, event_type, aggregate_id, aggregate_version,
      correlation_id, idempotency_key, payload
    ) VALUES (
      v_connection.id, 'guest.stay_status_changed.v1',
      v_stay_ref.stay_reference, v_version, v_connection.correlation_id,
      v_stay_ref.stay_reference::text || ':' || v_version::text,
      jsonb_build_object(
        'guestReference', v_guest_ref.guest_reference,
        'stayReference', v_stay_ref.stay_reference,
        'propertyReference', v_connection.integration_property_id,
        'status', v_status,
        'statusVersion', v_version,
        'occurredAt', v_occurred_at,
        'effectiveAt', v_occurred_at
      )
    );
  END LOOP;
  RETURN NEW;
END;
$lb02$;

DROP TRIGGER IF EXISTS lb02_booking_status_outbox ON public.bookings;
CREATE TRIGGER lb02_booking_status_outbox
AFTER INSERT OR UPDATE OF status, guest_id, property_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.lb02_enqueue_stay_status_change();

COMMIT;
