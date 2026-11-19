-- Enforce property currency at room, extra, booking and transaction boundaries.
BEGIN;

CREATE OR REPLACE FUNCTION public.staynas_guard_room_price_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $room_price_currency$
DECLARE v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id
     AND OLD.currency IS NOT DISTINCT FROM NEW.currency
     AND OLD.base_price IS NOT DISTINCT FROM NEW.base_price
     AND OLD.extra_guest_fee IS NOT DISTINCT FROM NEW.extra_guest_fee THEN
    RETURN NEW;
  END IF;
  SELECT upper(p.currency) INTO v_property_currency
  FROM public.staynas_properties p WHERE p.id = NEW.property_id;
  IF v_property_currency IS NULL OR upper(COALESCE(NEW.currency,'')) IS DISTINCT FROM v_property_currency THEN
    RAISE EXCEPTION 'Room price currency must match the property operating currency; enter a new rate without FX conversion';
  END IF;
  RETURN NEW;
END;
$room_price_currency$;

CREATE OR REPLACE FUNCTION public.staynas_guard_extra_price_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $extra_price_currency$
DECLARE v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id
     AND OLD.currency IS NOT DISTINCT FROM NEW.currency
     AND OLD.price IS NOT DISTINCT FROM NEW.price THEN
    RETURN NEW;
  END IF;
  SELECT upper(p.currency) INTO v_property_currency
  FROM public.staynas_properties p WHERE p.id = NEW.property_id;
  IF v_property_currency IS NULL OR upper(COALESCE(NEW.currency,'')) IS DISTINCT FROM v_property_currency THEN
    RAISE EXCEPTION 'Extra price currency must match the property operating currency; enter a new price without FX conversion';
  END IF;
  RETURN NEW;
END;
$extra_price_currency$;

CREATE OR REPLACE FUNCTION public.staynas_guard_booking_extra_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $booking_extra_currency$
DECLARE v_booking record; v_extra record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.booking_id IS DISTINCT FROM NEW.booking_id OR OLD.extra_id IS DISTINCT FROM NEW.extra_id THEN
      RAISE EXCEPTION 'Historical booking extra association is immutable';
    END IF;
    RETURN NEW;
  END IF;
  SELECT b.property_id, upper(b.currency) AS currency INTO v_booking
  FROM public.bookings b WHERE b.id = NEW.booking_id;
  SELECT e.property_id, upper(e.currency) AS currency INTO v_extra
  FROM public.extras e WHERE e.id = NEW.extra_id AND e.active = true;
  IF v_booking.property_id IS NULL OR v_extra.property_id IS NULL
     OR v_booking.property_id IS DISTINCT FROM v_extra.property_id
     OR v_booking.currency IS NULL OR v_extra.currency IS NULL
     OR v_booking.currency IS DISTINCT FROM v_extra.currency THEN
    RAISE EXCEPTION 'Booking extra must belong to the booking property and use its transaction currency';
  END IF;
  RETURN NEW;
END;
$booking_extra_currency$;

CREATE OR REPLACE FUNCTION public.staynas_guard_booking_transaction_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $booking_currency$
DECLARE v_property_currency text; v_room_currency text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.currency IS DISTINCT FROM NEW.currency
       OR OLD.property_id IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'Booking property and transaction currency are immutable';
    END IF;
    IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
      SELECT upper(r.currency) INTO v_room_currency
      FROM public.rooms r WHERE r.id = NEW.room_id AND r.property_id = NEW.property_id;
      IF v_room_currency IS DISTINCT FROM upper(NEW.currency) THEN
        RAISE EXCEPTION 'A reassigned room must use the booking transaction currency';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
    SELECT upper(p.currency), upper(r.currency)
      INTO v_property_currency, v_room_currency
    FROM public.staynas_properties p
    JOIN public.rooms r ON r.property_id = p.id AND r.id = NEW.room_id
    WHERE p.id = NEW.property_id AND p.status IN ('active','setup');
    IF v_property_currency IS NULL
       OR v_property_currency !~ '^[A-Z]{3}$'
       OR v_room_currency IS DISTINCT FROM v_property_currency
       OR upper(COALESCE(NEW.currency,'')) IS DISTINCT FROM v_property_currency THEN
      RAISE EXCEPTION 'New booking currency and room price currency must match the authoritative property operating currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$booking_currency$;

CREATE OR REPLACE FUNCTION public.staynas_guard_child_transaction_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $child_currency$
DECLARE v_booking_currency text; v_booking_property_id uuid; v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.currency IS DISTINCT FROM NEW.currency
       OR OLD.booking_id IS DISTINCT FROM NEW.booking_id THEN
      RAISE EXCEPTION 'Historical transaction currency and booking association are immutable';
    END IF;
    RETURN NEW;
  END IF;
  -- Provider callback events are evidence, not settled financial transactions.
  -- Read event_type through JSON because this trigger is shared by tables whose
  -- row types do not contain that column. Preserve NULL currency exactly.
  IF TG_TABLE_NAME = 'payment_events' THEN
    IF NEW.currency IS NULL
       AND (COALESCE(to_jsonb(NEW)->>'event_type','') LIKE 'ipn:%'
         OR COALESCE(to_jsonb(NEW)->>'event_type','') LIKE 'status_check:%'
         OR COALESCE(to_jsonb(NEW)->>'event_type','') = 'security:payment_mismatch') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    RAISE EXCEPTION 'New financial transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  NEW.currency := upper(btrim(NEW.currency));
  IF NEW.currency !~ '^[A-Z]{3}
  RETURN NEW;
END;
$child_currency$;

DROP TRIGGER IF EXISTS trg_staynas_guard_room_price_currency ON public.rooms;
CREATE TRIGGER trg_staynas_guard_room_price_currency BEFORE INSERT OR UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_room_price_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_extra_price_currency ON public.extras;
CREATE TRIGGER trg_staynas_guard_extra_price_currency BEFORE INSERT OR UPDATE ON public.extras
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_extra_price_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_booking_extra_currency ON public.booking_extras;
CREATE TRIGGER trg_staynas_guard_booking_extra_currency BEFORE INSERT OR UPDATE ON public.booking_extras
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_extra_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency BEFORE INSERT OR UPDATE ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency BEFORE INSERT OR UPDATE ON public.pms_folio_postings
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_room_price_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_extra_price_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_booking_extra_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC,anon,authenticated;

COMMIT;
 THEN
    RAISE EXCEPTION 'New financial transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF TG_TABLE_NAME = 'staynas_promotion_redemptions' THEN
    SELECT upper(p.currency) INTO v_property_currency
    FROM public.staynas_properties p WHERE p.id = NEW.property_id;
    IF v_property_currency IS NULL OR NEW.currency IS DISTINCT FROM v_property_currency THEN
      RAISE EXCEPTION 'Promotion redemption currency must match its property operating currency';
    END IF;
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency), b.property_id INTO v_booking_currency, v_booking_property_id
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR NEW.currency IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
    IF TG_TABLE_NAME = 'staynas_promotion_redemptions'
       AND NEW.property_id IS DISTINCT FROM v_booking_property_id THEN
      RAISE EXCEPTION 'Promotion redemption booking must belong to the same property';
    END IF;
  END IF;
  RETURN NEW;
END;
$child_currency$;

DROP TRIGGER IF EXISTS trg_staynas_guard_room_price_currency ON public.rooms;
CREATE TRIGGER trg_staynas_guard_room_price_currency BEFORE INSERT OR UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_room_price_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_extra_price_currency ON public.extras;
CREATE TRIGGER trg_staynas_guard_extra_price_currency BEFORE INSERT OR UPDATE ON public.extras
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_extra_price_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_booking_extra_currency ON public.booking_extras;
CREATE TRIGGER trg_staynas_guard_booking_extra_currency BEFORE INSERT OR UPDATE ON public.booking_extras
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_extra_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency BEFORE INSERT OR UPDATE ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency BEFORE INSERT OR UPDATE ON public.pms_folio_postings
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();
DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_room_price_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_extra_price_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_booking_extra_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC,anon,authenticated;

COMMIT;
