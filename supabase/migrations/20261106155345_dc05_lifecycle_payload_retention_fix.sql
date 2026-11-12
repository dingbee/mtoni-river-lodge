-- DC-05.04 corrective guard: preserve encrypted payloads for linked lifecycle events.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_store_distribution_reservation_payload(
  _inbox_id uuid,
  _payload_fingerprint text,
  _ciphertext text,
  _nonce text,
  _auth_tag text,
  _key_version text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_inbox public.staynas_distribution_webhook_inbox%ROWTYPE;
  v_existing text;
BEGIN
  SELECT * INTO v_inbox
  FROM public.staynas_distribution_webhook_inbox i
  WHERE i.id=_inbox_id
  FOR UPDATE;

  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'Reservation inbox event was not found.' USING ERRCODE='P0002';
  END IF;

  IF v_inbox.event_type NOT LIKE 'reservation.%' OR v_inbox.connection_id IS NULL
     OR _payload_fingerprint IS DISTINCT FROM v_inbox.payload_fingerprint
     OR _payload_fingerprint !~ '^[0-9a-f]{64}$'
     OR _ciphertext IS NULL OR length(_ciphertext) NOT BETWEEN 1 AND 65536
     OR _nonce IS NULL OR length(_nonce) NOT BETWEEN 1 AND 64
     OR _auth_tag IS NULL OR length(_auth_tag) NOT BETWEEN 1 AND 64
     OR _key_version IS NULL OR _key_version !~ '^[A-Za-z0-9_-]{1,32}$' THEN
    RAISE EXCEPTION 'Encrypted reservation payload does not match its durable inbox event.'
      USING ERRCODE='22023';
  END IF;

  -- A completed create/confirm duplicate must not recreate retained PII. A
  -- later modification/cancellation must retain its own encrypted payload.
  IF v_inbox.processing_status IN ('processed','ignored')
     OR (v_inbox.event_type IN ('reservation.created','reservation.confirmed')
       AND EXISTS (
         SELECT 1 FROM public.staynas_distribution_reservation_links l
         WHERE l.provider_key=v_inbox.provider_key
           AND l.external_account_id=v_inbox.external_account_id
           AND l.external_reservation_id=v_inbox.normalized_event->>'externalReservationId'
       )) THEN
    RETURN false;
  END IF;

  INSERT INTO public.staynas_distribution_reservation_payloads(
    inbox_id,payload_fingerprint,ciphertext,nonce,auth_tag,key_version
  ) VALUES (
    _inbox_id,_payload_fingerprint,_ciphertext,_nonce,_auth_tag,_key_version
  ) ON CONFLICT(inbox_id) DO NOTHING;

  SELECT p.payload_fingerprint INTO v_existing
  FROM public.staynas_distribution_reservation_payloads p
  WHERE p.inbox_id=_inbox_id;

  IF v_existing IS DISTINCT FROM _payload_fingerprint THEN
    RAISE EXCEPTION 'Reservation payload fingerprint conflicts with the stored event.'
      USING ERRCODE='22023';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.staynas_store_distribution_reservation_payload(uuid,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_store_distribution_reservation_payload(uuid,text,text,text,text,text)
  TO service_role;

COMMIT;
