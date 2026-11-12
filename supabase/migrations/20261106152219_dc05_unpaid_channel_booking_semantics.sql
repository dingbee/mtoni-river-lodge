-- DC-05.03 channel payment semantics: bookings remain unpaid pending DC-05.06 settlement.
BEGIN;
CREATE OR REPLACE FUNCTION public.staynas_materialize_distribution_reservation(
  _inbox_id uuid,
  _lease_token uuid,
  _worker_id text,
  _payload_fingerprint text,
  _external_reservation_id text,
  _arrival_date date,
  _departure_date date,
  _adults integer,
  _children integer,
  _children_below_6 integer,
  _children_7_plus integer,
  _guest_name text,
  _guest_email text,
  _guest_phone text DEFAULT NULL,
  _country text DEFAULT NULL,
  _special_requests text DEFAULT NULL
)
RETURNS TABLE(outcome text,booking_id uuid,created boolean,reconciliation_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_existing public.staynas_distribution_reservation_links%ROWTYPE;
  v_connection public.staynas_distribution_connections%ROWTYPE;
  v_room_type_id uuid;
  v_listing_type_id uuid;
  v_room_mapping_type_id uuid;
  v_rate_plan_id uuid;
  v_external_listing_id text;
  v_external_room_id text;
  v_external_rate_plan_id text;
  v_provider_status text;
  v_candidate record;
  v_created record;
  v_message text;
  v_link_id uuid;
  v_quote_valid boolean;
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),auth.role())<>'service_role' THEN
    RAISE EXCEPTION 'Reservation materialization is service-only.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_inbox
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id AND i.processing_status='processing'
    AND i.lease_token=_lease_token AND i.lease_owner=_worker_id
    AND i.lease_expires_at>pg_catalog.now()
  FOR UPDATE;

  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'Reservation materialization lease is not current.' USING ERRCODE='42501';
  END IF;
  IF v_inbox.event_type NOT IN ('reservation.created','reservation.confirmed') THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'event_type_not_supported';
    RETURN;
  END IF;
  IF _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR NOT EXISTS (
       SELECT 1 FROM public.staynas_distribution_reservation_payloads p
       WHERE p.inbox_id=v_inbox.id AND p.payload_fingerprint=_payload_fingerprint
     ) THEN
    RAISE EXCEPTION 'Encrypted reservation payload evidence is missing or mismatched.'
      USING ERRCODE='42501';
  END IF;

  IF _external_reservation_id IS NULL OR length(trim(_external_reservation_id)) NOT BETWEEN 1 AND 256
     OR _external_reservation_id IS DISTINCT FROM v_inbox.normalized_event->>'externalReservationId'
     OR _arrival_date IS DISTINCT FROM (v_inbox.normalized_event->>'arrivalDate')::date
     OR _departure_date IS DISTINCT FROM (v_inbox.normalized_event->>'departureDate')::date
     OR _adults IS DISTINCT FROM (v_inbox.normalized_event->>'adults')::integer
     OR _children IS DISTINCT FROM COALESCE((v_inbox.normalized_event->>'children')::integer,0)
     OR _departure_date<=_arrival_date OR _adults<1 OR _children<0
     OR _children_below_6 IS NULL OR _children_7_plus IS NULL
     OR _children_below_6<0 OR _children_7_plus<0
     OR _children_below_6+_children_7_plus<>_children
     OR _children_below_6 IS DISTINCT FROM COALESCE(
       (v_inbox.normalized_event->>'childrenBelow6')::integer,
       CASE WHEN _children=0 THEN 0 ELSE NULL END
     )
     OR _children_7_plus IS DISTINCT FROM COALESCE(
       (v_inbox.normalized_event->>'children7Plus')::integer,
       CASE WHEN _children=0 THEN 0 ELSE NULL END
     ) THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'reservation_payload_mismatch';
    RETURN;
  END IF;
  IF _guest_name IS NULL OR length(trim(_guest_name))<2
     OR _guest_email IS NULL
     OR _guest_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'guest_identity_incomplete';
    RETURN;
  END IF;

  SELECT c.* INTO v_connection
  FROM public.staynas_distribution_connections c
  JOIN public.staynas_distribution_account_grants g
    ON g.id=c.account_grant_id
   AND g.organisation_id=c.organisation_id
   AND g.property_id=c.property_id
   AND g.external_account_id=c.external_account_id
   AND g.provider_key=c.provider_key
   AND g.environment=c.environment
  WHERE c.id=v_inbox.connection_id
    AND c.organisation_id=v_inbox.organisation_id
    AND c.property_id=v_inbox.property_id
    AND c.account_grant_id=v_inbox.account_grant_id
    AND c.external_account_id=v_inbox.external_account_id
    AND c.provider_key=v_inbox.provider_key
    AND c.environment=v_inbox.environment
    AND c.lifecycle='connected'
    AND g.grant_status='active'
    AND 'reservation.import'=ANY(g.granted_capabilities);
  IF v_connection.id IS NULL THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'connection_grant_inactive';
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.staynas_distribution_reservation_links l
  WHERE l.provider_key=v_inbox.provider_key
    AND l.external_account_id=v_inbox.external_account_id
    AND l.external_reservation_id=_external_reservation_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.organisation_id<>v_inbox.organisation_id
       OR v_existing.property_id<>v_inbox.property_id
       OR v_existing.connection_id<>v_inbox.connection_id THEN
      RAISE EXCEPTION 'Provider reservation is already linked in a different tenant/property scope.'
        USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT 'already_materialized',v_existing.booking_id,false,NULL::text;
    RETURN;
  END IF;

  v_external_listing_id:=v_inbox.normalized_event->>'externalListingId';
  v_external_room_id:=v_inbox.normalized_event->>'externalRoomId';
  v_external_rate_plan_id:=v_inbox.normalized_event->>'externalRatePlanId';
  v_provider_status:=v_inbox.normalized_event->>'providerStatus';

  IF lower(COALESCE(v_provider_status,'')) NOT IN
     ('pending','requested','confirmed','booked','accepted') THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'unknown_provider_state';
    RETURN;
  END IF;

  SELECT m.internal_room_type_id INTO v_listing_type_id
  FROM public.staynas_distribution_listing_mappings m
  WHERE m.organisation_id=v_inbox.organisation_id
    AND m.property_id=v_inbox.property_id
    AND m.connection_id=v_inbox.connection_id
    AND m.external_listing_id=v_external_listing_id
    AND m.mapping_status='active';

  IF v_external_room_id IS NOT NULL THEN
    SELECT m.internal_room_type_id INTO v_room_mapping_type_id
    FROM public.staynas_distribution_room_mappings m
    WHERE m.organisation_id=v_inbox.organisation_id
      AND m.property_id=v_inbox.property_id
      AND m.connection_id=v_inbox.connection_id
      AND m.external_room_id=v_external_room_id
      AND m.mapping_status='active';
  END IF;

  IF v_listing_type_id IS NULL AND v_room_mapping_type_id IS NULL THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'room_mapping_missing';
    RETURN;
  END IF;
  IF v_listing_type_id IS NOT NULL AND v_room_mapping_type_id IS NOT NULL
     AND v_listing_type_id<>v_room_mapping_type_id THEN
    RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'room_mapping_conflict';
    RETURN;
  END IF;
  v_room_type_id:=COALESCE(v_room_mapping_type_id,v_listing_type_id);

  IF v_external_rate_plan_id IS NOT NULL THEN
    SELECT m.internal_rate_plan_id INTO v_rate_plan_id
    FROM public.staynas_distribution_rate_plan_mappings m
    WHERE m.organisation_id=v_inbox.organisation_id
      AND m.property_id=v_inbox.property_id
      AND m.connection_id=v_inbox.connection_id
      AND m.external_rate_plan_id=v_external_rate_plan_id
      AND m.mapping_status='active';
    IF v_rate_plan_id IS NULL THEN
      RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,'rate_plan_mapping_missing';
      RETURN;
    END IF;
  END IF;

  FOR v_candidate IN
    SELECT a.room_id,a.slug,a.pricing_quote,a.is_available
    FROM public.get_staynas_room_availability_priced_with_rate_plan(
      _arrival_date,_departure_date,v_inbox.property_id,_adults,
      _children_below_6,_children_7_plus,v_rate_plan_id
    ) a
    JOIN public.rooms r ON r.id=a.room_id
    WHERE r.property_id=v_inbox.property_id
      AND r.catalogue_type_id=v_room_type_id
      AND a.fits_occupancy=true
    ORDER BY r.slug,r.id
  LOOP
    -- Pricing eligibility is evaluated before inventory availability. In
    -- particular, RATE_PLAN_REQUIRED must not be misreported as an inventory
    -- retry merely because the priced-availability projection marks the room
    -- unavailable while plan selection is unresolved.
    -- SPE-04 success quotes omit an explicit ok=true flag.
    -- Require a complete quote and immutable publication evidence.
    v_quote_valid :=
      v_candidate.pricing_quote IS NOT NULL
      AND v_candidate.pricing_quote->>'ok' IS DISTINCT FROM 'false'
      AND NOT (v_candidate.pricing_quote ? 'error_code')
      AND jsonb_typeof(v_candidate.pricing_quote->'total')='number'
      AND jsonb_typeof(v_candidate.pricing_quote->'currency')='string'
      AND jsonb_typeof(v_candidate.pricing_quote->'nightly')='array'
      AND v_candidate.pricing_quote->'pricing_evidence'->>'rate_plan_id' IS NOT NULL
      AND v_candidate.pricing_quote->'pricing_evidence'->>'publication_id' IS NOT NULL
      AND v_candidate.pricing_quote->'pricing_evidence'->>'snapshot_hash' IS NOT NULL;
    IF v_quote_valid THEN
      v_quote_valid := jsonb_array_length(v_candidate.pricing_quote->'nightly')
        = (_departure_date-_arrival_date);
    END IF;
    IF NOT COALESCE(v_quote_valid,false) THEN
      RETURN QUERY SELECT 'manual_reconciliation',NULL::uuid,false,
        CASE v_candidate.pricing_quote->>'error_code'
          WHEN 'RATE_PLAN_REQUIRED' THEN 'rate_plan_required'
          WHEN 'NO_ELIGIBLE_RATE_PLAN' THEN 'no_eligible_rate_plan'
          ELSE 'pricing_rejected'
        END;
      RETURN;
    END IF;

    IF NOT COALESCE(v_candidate.is_available,false) THEN
      CONTINUE;
    END IF;

    BEGIN
      PERFORM pg_catalog.set_config('staynas.booking_source','channel',true);
      SELECT * INTO v_created
      FROM public.create_booking_for_property_with_rate_plan(
        v_inbox.property_id,v_candidate.slug,_arrival_date,_departure_date,
        _adults,_children,_guest_name,_guest_email,_guest_phone,_country,
        _special_requests,'[]'::jsonb,_children_below_6,_children_7_plus,
        NULL,NULL,'pay_at_property',v_rate_plan_id
      );

      IF v_created.booking_id IS NULL THEN
        RAISE EXCEPTION 'Canonical allocator returned no booking identifier.';
      END IF;

      -- A channel reservation is not a settled payment method. Preserve it as
      -- an unpaid distribution booking until DC-05.06 settlement reconciles
      -- provider remittance; do not create payment rows or imply a deposit.
      UPDATE public.bookings
      SET source='channel',
          payment_method=NULL,
          payment_provider='channel',
          payment_status='unpaid',
          deposit_amount=0,
          balance_amount=v_created.total,
          balance_due=v_created.total
      WHERE id=v_created.booking_id
        AND property_id=v_inbox.property_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Canonical channel booking payment semantics could not be persisted.';
      END IF;

      INSERT INTO public.staynas_distribution_reservation_links(
        organisation_id,property_id,connection_id,account_grant_id,
        external_account_id,provider_key,environment,external_reservation_id,
        booking_id,source_inbox_id,source_provider_event_id,provider_status,provider_modified_at
      ) VALUES (
        v_inbox.organisation_id,v_inbox.property_id,v_inbox.connection_id,
        v_inbox.account_grant_id,v_inbox.external_account_id,v_inbox.provider_key,
        v_inbox.environment,_external_reservation_id,v_created.booking_id,
        v_inbox.id,v_inbox.provider_event_id,v_provider_status,
        NULLIF(v_inbox.normalized_event->>'providerModifiedAt','')::timestamptz
      );

      RETURN QUERY SELECT 'materialized',v_created.booking_id,true,NULL::text;
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_existing
        FROM public.staynas_distribution_reservation_links l
        WHERE l.provider_key=v_inbox.provider_key
          AND l.external_account_id=v_inbox.external_account_id
          AND l.external_reservation_id=_external_reservation_id;
        IF v_existing.id IS NOT NULL
           AND v_existing.organisation_id=v_inbox.organisation_id
           AND v_existing.property_id=v_inbox.property_id
           AND v_existing.connection_id=v_inbox.connection_id THEN
          RETURN QUERY SELECT 'already_materialized',v_existing.booking_id,false,NULL::text;
          RETURN;
        END IF;
        RAISE;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;
        IF v_message LIKE 'No availability%'
           OR v_message LIKE 'No unallocated inventory%'
           OR v_message LIKE 'Room blocked%'
           OR v_message LIKE 'Inventory changed%' THEN
          CONTINUE;
        END IF;
        RAISE;
    END;
  END LOOP;

  RETURN QUERY SELECT 'retryable_failure',NULL::uuid,false,'inventory_unavailable';
END;
$function$;
COMMIT;
