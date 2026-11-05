CREATE TABLE public.pms_folio_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  unit_label text,
  source_system text NOT NULL DEFAULT 'restaurant_pos',
  source_tenant_id uuid,
  source_property_id uuid,
  source_location_id uuid,
  source_order_id uuid,
  source_payment_id uuid,
  idempotency_key text NOT NULL,
  correlation_id text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  description text NOT NULL DEFAULT 'Outlet charge',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','posted','failed','unknown','reversed')),
  folio_reference text,
  posting_reference text,
  failure_code text,
  failure_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pms_folio_postings_idem_idx ON public.pms_folio_postings (idempotency_key);
CREATE INDEX pms_folio_postings_booking_idx ON public.pms_folio_postings (booking_id, requested_at DESC);
CREATE INDEX pms_folio_postings_order_idx ON public.pms_folio_postings (source_order_id);
CREATE INDEX pms_folio_postings_status_idx ON public.pms_folio_postings (status, requested_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.pms_folio_postings TO authenticated;
GRANT ALL ON public.pms_folio_postings TO service_role;

ALTER TABLE public.pms_folio_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read folio postings"
  ON public.pms_folio_postings FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "Staff can record folio postings"
  ON public.pms_folio_postings FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()));

CREATE POLICY "Staff can update folio postings"
  ON public.pms_folio_postings FOR UPDATE TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));

CREATE TRIGGER pms_folio_postings_set_updated_at
  BEFORE UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.pms_post_folio_charge(
  _idempotency_key text,
  _booking_id uuid,
  _amount numeric,
  _currency text,
  _description text,
  _source jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _existing public.pms_folio_postings%ROWTYPE;
  _booking public.bookings%ROWTYPE;
  _unit text;
  _ref text;
  _row public.pms_folio_postings%ROWTYPE;
BEGIN
  IF _actor IS NULL OR NOT public.is_any_staff(_actor) THEN
    RAISE EXCEPTION 'Forbidden — folio posting requires staff authorisation.';
  END IF;

  SELECT * INTO _existing FROM public.pms_folio_postings WHERE idempotency_key = _idempotency_key;
  IF FOUND AND _existing.status = 'posted' THEN
    RETURN jsonb_build_object(
      'status', 'posted', 'duplicate', true, 'posting_id', _existing.id,
      'posting_reference', _existing.posting_reference, 'folio_reference', _existing.folio_reference,
      'amount', _existing.amount, 'currency', _existing.currency);
  END IF;

  SELECT * INTO _booking FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','failed','duplicate',false,'failure_code','guest_not_found','failure_message','No reservation found for this room.');
  END IF;

  IF _booking.status <> 'checked_in' THEN
    RETURN jsonb_build_object('status','failed','duplicate',false,'failure_code','stay_not_active','failure_message','The stay is not currently checked in, so its folio is closed.');
  END IF;

  IF upper(coalesce(_currency,'')) <> upper(coalesce(_booking.currency,'')) THEN
    RETURN jsonb_build_object('status','failed','duplicate',false,'failure_code','currency_mismatch',
      'failure_message', format('The folio is held in %s and cannot accept a charge in %s.', _booking.currency, _currency));
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('status','failed','duplicate',false,'failure_code','posting_rejected','failure_message','A folio charge must be greater than zero.');
  END IF;

  SELECT unit_label INTO _unit FROM public.room_states
   WHERE booking_id = _booking_id ORDER BY updated_at DESC LIMIT 1;

  _ref := 'FOL-' || upper(coalesce(_booking.reference, substr(_booking_id::text, 1, 8))) || '-' ||
          to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(_idempotency_key), 1, 6));

  UPDATE public.bookings SET
    extras_total = coalesce(extras_total, 0) + _amount,
    total        = coalesce(total, 0) + _amount,
    balance_due  = coalesce(balance_due, 0) + _amount,
    balance_amount = coalesce(balance_amount, 0) + _amount,
    updated_at   = now()
  WHERE id = _booking_id;

  IF FOUND AND _existing.id IS NOT NULL THEN
    UPDATE public.pms_folio_postings SET
      status = 'posted', posting_reference = _ref, folio_reference = _booking.reference,
      posted_at = now(), failure_code = NULL, failure_message = NULL
    WHERE id = _existing.id RETURNING * INTO _row;
  ELSE
    INSERT INTO public.pms_folio_postings (
      booking_id, guest_id, room_id, unit_label, source_system, source_tenant_id, source_property_id,
      source_location_id, source_order_id, source_payment_id, idempotency_key, correlation_id,
      amount, currency, description, status, folio_reference, posting_reference, posted_at, created_by, metadata)
    VALUES (
      _booking_id, _booking.guest_id, _booking.room_id, _unit,
      coalesce(_source->>'source_system','restaurant_pos'),
      nullif(_source->>'tenant_id','')::uuid, nullif(_source->>'property_id','')::uuid,
      nullif(_source->>'location_id','')::uuid, nullif(_source->>'order_id','')::uuid,
      nullif(_source->>'payment_id','')::uuid, _idempotency_key, _source->>'correlation_id',
      _amount, upper(_currency), coalesce(_description,'Outlet charge'), 'posted',
      _booking.reference, _ref, now(), _actor, coalesce(_source,'{}'::jsonb))
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'status','posted','duplicate',false,'posting_id',_row.id,
    'posting_reference',_row.posting_reference,'folio_reference',_row.folio_reference,
    'amount',_row.amount,'currency',_row.currency,'unit_label',_row.unit_label);
END;
$$;

REVOKE ALL ON FUNCTION public.pms_post_folio_charge(text, uuid, numeric, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.pms_post_folio_charge(text, uuid, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_post_folio_charge(text, uuid, numeric, text, text, jsonb) TO service_role;