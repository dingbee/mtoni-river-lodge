-- SN-GPA-01 — Guest Portal credential lifecycle, audit and checkout policy.
-- Extends the existing credential table; no parallel credential store is introduced.

BEGIN;

ALTER TABLE public.staynas_properties
  ADD COLUMN IF NOT EXISTS guest_portal_checkout_time time NOT NULL DEFAULT time '11:00',
  ADD COLUMN IF NOT EXISTS guest_portal_grace_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.staynas_properties
  DROP CONSTRAINT IF EXISTS staynas_properties_guest_portal_grace_minutes_check;
ALTER TABLE public.staynas_properties
  ADD CONSTRAINT staynas_properties_guest_portal_grace_minutes_check
  CHECK (guest_portal_grace_minutes BETWEEN 0 AND 1440);

ALTER TABLE public.staynas_guest_portal_access
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS superseded_by uuid
    REFERENCES public.staynas_guest_portal_access(id) ON DELETE SET NULL;

-- Reconcile legacy rows from the pre-lifecycle revoked_at/expires_at fields.
UPDATE public.staynas_guest_portal_access
SET status = CASE
  WHEN revoked_at IS NOT NULL THEN 'revoked'
  WHEN expires_at <= now() THEN 'expired'
  ELSE 'active'
END;

ALTER TABLE public.staynas_guest_portal_access
  DROP CONSTRAINT IF EXISTS staynas_guest_portal_access_status_check;
ALTER TABLE public.staynas_guest_portal_access
  ADD CONSTRAINT staynas_guest_portal_access_status_check
  CHECK (status IN ('pending','active','expired','revoked','superseded'));

-- Keep one active credential per booking guest identity. NULLS NOT DISTINCT
-- also protects bookings whose legacy guest profile has not yet been linked.
CREATE UNIQUE INDEX IF NOT EXISTS staynas_guest_portal_access_one_active_identity_uidx
  ON public.staynas_guest_portal_access
  (property_id, booking_id, guest_id) NULLS NOT DISTINCT
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.staynas_guest_portal_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id uuid REFERENCES public.staynas_guest_portal_access(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.staynas_properties(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'issued','activated','accessed','regenerated','superseded','revoked',
    'expired','qr_generated','link_shared','delivery_queued','delivery_sent',
    'delivery_delivered','delivery_retrying','delivery_failed','access_denied','issue_failed','qr_generation_failed'
  )),
  token_fingerprint text CHECK (token_fingerprint IS NULL OR length(token_fingerprint) = 12),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staynas_guest_portal_access_events_booking_idx
  ON public.staynas_guest_portal_access_events(property_id, booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staynas_guest_portal_access_events_access_idx
  ON public.staynas_guest_portal_access_events(access_id, created_at DESC);

ALTER TABLE public.staynas_guest_portal_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staynas_guest_portal_access_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_guest_portal_access_events TO service_role;
REVOKE ALL ON public.staynas_guest_portal_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staynas_guest_portal_access TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_issue_guest_portal_access(
  _property_id uuid,
  _booking_id uuid,
  _guest_id uuid,
  _concierge_session_id uuid,
  _token_hash text,
  _actor_id uuid,
  _rotate boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_property public.staynas_properties%ROWTYPE;
  v_expires_at timestamptz;
  v_access public.staynas_guest_portal_access%ROWTYPE;
  v_existing public.staynas_guest_portal_access%ROWTYPE;
  v_superseded_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF _actor_id IS NULL OR _token_hash IS NULL OR length(_token_hash) <> 64 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid guest access issuance request';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = _booking_id AND property_id = _property_id
  FOR UPDATE;

  IF NOT FOUND OR v_booking.status::text <> 'checked_in'
     OR v_booking.guest_id IS DISTINCT FROM _guest_id
     OR NOT (
       (
         public.staynas_user_has_property_access(_actor_id, _property_id)
         AND public.is_any_staff(_actor_id)
         AND public.has_any_role(
           _actor_id, ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]
         )
       )
       OR EXISTS (
         SELECT 1
         FROM public.commercial_founder_admin_memberships fam
         JOIN public.commercial_founder_tenant_config cfg
           ON cfg.singleton = true
          AND cfg.founder_organisation_id = fam.organisation_id
         JOIN public.staynas_organisations founder_org
           ON founder_org.id = cfg.founder_organisation_id
          AND founder_org.status = 'active'
         WHERE fam.principal_id = _actor_id
           AND fam.status = 'active'
           AND EXISTS (
             SELECT 1
             FROM public.staynas_properties founder_property
             JOIN public.staynas_property_members founder_member
               ON founder_member.property_id = founder_property.id
             WHERE founder_property.organisation_id = cfg.founder_organisation_id
               AND founder_property.status = 'active'
               AND founder_member.user_id = _actor_id
               AND founder_member.status = 'active'
           )
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Guest access issuance is not authorized for this checked-in booking';
  END IF;

  SELECT * INTO v_property
  FROM public.staynas_properties
  WHERE id = _property_id AND status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Property is not active';
  END IF;

  v_expires_at := (
    (v_booking.check_out + v_property.guest_portal_checkout_time)
    AT TIME ZONE COALESCE(NULLIF(v_property.timezone,''),'UTC')
  ) + make_interval(mins => v_property.guest_portal_grace_minutes);

  IF v_expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Guest stay has reached its configured portal expiry';
  END IF;

  -- The booking row lock serializes concurrent check-in issuance. A retry
  -- returns the existing credential metadata without rotating its bearer token.
  SELECT * INTO v_existing
  FROM public.staynas_guest_portal_access
  WHERE property_id = _property_id
    AND booking_id = _booking_id
    AND guest_id IS NOT DISTINCT FROM _guest_id
    AND status = 'active'
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF FOUND AND NOT COALESCE(_rotate, true) THEN
    RETURN jsonb_build_object(
      'access_id', v_existing.id,
      'expires_at', v_existing.expires_at,
      'status', v_existing.status,
      'already_active', true
    );
  END IF;

  -- Expired rows are retired before enforcing the active-identity constraint.
  UPDATE public.staynas_guest_portal_access
  SET status = 'expired'
  WHERE property_id = _property_id
    AND booking_id = _booking_id
    AND guest_id IS NOT DISTINCT FROM _guest_id
    AND status = 'active'
    AND revoked_at IS NULL
    AND expires_at <= now();

  WITH retired AS (
    UPDATE public.staynas_guest_portal_access
    SET status = 'superseded',
        revoked_at = now(),
        revoked_by = _actor_id
    WHERE property_id = _property_id
      AND booking_id = _booking_id
      AND guest_id IS NOT DISTINCT FROM _guest_id
      AND status = 'active'
      AND revoked_at IS NULL
    RETURNING id, property_id, booking_id, guest_id
  ), logged AS (
    INSERT INTO public.staynas_guest_portal_access_events
      (access_id, property_id, booking_id, guest_id, actor_id, event_type, metadata)
    SELECT id, property_id, booking_id, guest_id, _actor_id, 'superseded',
           jsonb_build_object('reason','credential_rotation')
    FROM retired
    RETURNING access_id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_superseded_ids
  FROM retired;

  INSERT INTO public.staynas_guest_portal_access
    (property_id, booking_id, guest_id, concierge_session_id, token_hash,
     expires_at, created_by, status)
  VALUES
    (_property_id, _booking_id, _guest_id, _concierge_session_id, _token_hash,
     v_expires_at, _actor_id, 'active')
  RETURNING * INTO v_access;

  INSERT INTO public.staynas_guest_portal_access_events
    (access_id, property_id, booking_id, guest_id, actor_id, event_type, metadata)
  VALUES
    (v_access.id, _property_id, _booking_id, _guest_id, _actor_id, 'issued',
     jsonb_build_object('expires_at',v_access.expires_at)),
    (v_access.id, _property_id, _booking_id, _guest_id, _actor_id, 'activated',
     jsonb_build_object('activation_source','authorized_check_in_or_admin_issue'));

  IF cardinality(v_superseded_ids) > 0 THEN
    UPDATE public.staynas_guest_portal_access
    SET superseded_by = v_access.id
    WHERE id = ANY(v_superseded_ids);

    INSERT INTO public.staynas_guest_portal_access_events
      (access_id, property_id, booking_id, guest_id, actor_id, event_type, metadata)
    VALUES
      (v_access.id, _property_id, _booking_id, _guest_id, _actor_id, 'regenerated',
       jsonb_build_object('superseded_access_ids', v_superseded_ids));
  END IF;

  RETURN jsonb_build_object(
    'access_id', v_access.id,
    'expires_at', v_access.expires_at,
    'status', v_access.status,
    'already_active', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_revoke_guest_portal_access(
  _property_id uuid,
  _booking_id uuid,
  _guest_id uuid,
  _actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF _actor_id IS NULL OR NOT (
    (
      public.staynas_user_has_property_access(_actor_id, _property_id)
      AND public.is_any_staff(_actor_id)
      AND public.has_any_role(
        _actor_id, ARRAY['owner','manager','admin','reception','reservations']::public.app_role[]
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.commercial_founder_admin_memberships fam
      JOIN public.commercial_founder_tenant_config cfg
        ON cfg.singleton = true
       AND cfg.founder_organisation_id = fam.organisation_id
      JOIN public.staynas_organisations founder_org
        ON founder_org.id = cfg.founder_organisation_id
       AND founder_org.status = 'active'
      WHERE fam.principal_id = _actor_id
        AND fam.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM public.staynas_properties founder_property
          JOIN public.staynas_property_members founder_member
            ON founder_member.property_id = founder_property.id
          WHERE founder_property.organisation_id = cfg.founder_organisation_id
            AND founder_property.status = 'active'
            AND founder_member.user_id = _actor_id
            AND founder_member.status = 'active'
        )
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Guest access revocation is not authorized';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = _booking_id AND property_id = _property_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Booking not found in authorized property';
  END IF;

  WITH retired AS (
    UPDATE public.staynas_guest_portal_access
    SET status = 'revoked', revoked_at = now(), revoked_by = _actor_id
    WHERE property_id = _property_id
      AND booking_id = _booking_id
      AND (_guest_id IS NULL OR guest_id IS NOT DISTINCT FROM _guest_id)
      AND status IN ('active','pending')
      AND revoked_at IS NULL
    RETURNING id, property_id, booking_id, guest_id
  ), logged AS (
    INSERT INTO public.staynas_guest_portal_access_events
      (access_id, property_id, booking_id, guest_id, actor_id, event_type, metadata)
    SELECT id, property_id, booking_id, guest_id, _actor_id, 'revoked',
           jsonb_build_object('reason','administrator_revocation')
    FROM retired
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM logged;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_issue_guest_portal_access(uuid,uuid,uuid,uuid,text,uuid,boolean)
  TO service_role;
REVOKE ALL ON FUNCTION public.staynas_revoke_guest_portal_access(uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_revoke_guest_portal_access_on_lifecycle()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_revoke_guest_portal_access(uuid,uuid,uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.staynas_revoke_guest_portal_access_on_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_event text;
  v_status text;
BEGIN
  IF NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.guest_id IS DISTINCT FROM OLD.guest_id THEN
    v_event := 'revoked';
    v_status := 'revoked';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text = 'completed' THEN
    v_event := 'expired';
    v_status := 'expired';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('cancelled','no_show') THEN
    v_event := 'revoked';
    v_status := 'revoked';
  ELSE
    RETURN NEW;
  END IF;

  WITH retired AS (
    UPDATE public.staynas_guest_portal_access
    SET status = v_status, revoked_at = now(), revoked_by = auth.uid()
    WHERE property_id = OLD.property_id
      AND booking_id = NEW.id
      AND status IN ('active','pending')
      AND revoked_at IS NULL
    RETURNING id, property_id, booking_id, guest_id
  )
  INSERT INTO public.staynas_guest_portal_access_events
    (access_id, property_id, booking_id, guest_id, actor_id, event_type, metadata)
  SELECT id, property_id, booking_id, guest_id, auth.uid(), v_event,
         jsonb_build_object('booking_status',NEW.status::text)
  FROM retired;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS staynas_guest_portal_access_booking_lifecycle
  ON public.bookings;
CREATE TRIGGER staynas_guest_portal_access_booking_lifecycle
  AFTER UPDATE OF status, property_id, guest_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.staynas_revoke_guest_portal_access_on_lifecycle();

COMMIT;
