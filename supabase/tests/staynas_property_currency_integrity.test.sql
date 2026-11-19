-- StayNas property operating currency, transaction immutability and property isolation contracts.
BEGIN;
SELECT plan(14);

INSERT INTO public.staynas_organisations (id, slug, name) VALUES
  ('91000000-0000-4000-8000-000000000001', 'currency-org-a', 'Currency Organisation A'),
  ('91000000-0000-4000-8000-000000000002', 'currency-org-b', 'Currency Organisation B');

INSERT INTO public.staynas_properties (id, organisation_id, slug, code, name, currency, timezone, status) VALUES
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'currency-property-a', 'CURRA', 'Currency Property A', 'TZS', 'Africa/Dar_es_Salaam', 'active'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'currency-property-b', 'CURRB', 'Currency Property B', 'KES', 'Africa/Nairobi', 'active');

INSERT INTO auth.users (id) VALUES
  ('93000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002'),
  ('93000000-0000-4000-8000-000000000003');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('93000000-0000-4000-8000-000000000001', 'owner'),
  ('93000000-0000-4000-8000-000000000002', 'owner'),
  ('93000000-0000-4000-8000-000000000003', 'reception');

INSERT INTO public.staynas_property_members (property_id, user_id, role, status) VALUES
  ('92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', 'reception', 'active');

INSERT INTO public.staynas_user_property_context (user_id, property_id) VALUES
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000002')
ON CONFLICT (user_id) DO UPDATE
SET property_id = EXCLUDED.property_id, updated_at = now();

INSERT INTO public.staynas_room_catalogue_types (id, slug, name, status) VALUES
  ('94000000-0000-4000-8000-000000000001', 'currency-room-type-a', 'Currency Room Type A', 'active'),
  ('94000000-0000-4000-8000-000000000002', 'currency-room-type-b', 'Currency Room Type B', 'active');

INSERT INTO public.rooms (id, property_id, catalogue_type_id, slug, name, base_price, currency, status) VALUES
  ('95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'currency-room-a', 'Currency Room A', 1000, 'TZS', 'active'),
  ('95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002', 'currency-room-b', 'Currency Room B', 2000, 'KES', 'active');

-- New room and extra pricing cannot be entered in a different property currency.
DO $pricing_currency$
BEGIN
  BEGIN
    INSERT INTO public.rooms (id, property_id, catalogue_type_id, slug, name, base_price, currency, status)
    VALUES ('95000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001', 'currency-room-a-wrong', 'Wrong Currency Room', 100, 'KES', 'active');
    RAISE EXCEPTION 'Wrong-currency room price unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Wrong-currency room price unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.extras (property_id, slug, name, price, currency)
    VALUES ('92000000-0000-4000-8000-000000000001', 'currency-extra-a-wrong', 'Wrong Currency Extra', 50, 'KES');
    RAISE EXCEPTION 'Wrong-currency extra price unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Wrong-currency extra price unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$pricing_currency$;
SELECT pass('Room and extra prices must match the property operating currency');

-- Both properties accept only their own operating currency at booking creation.
INSERT INTO public.bookings
  (id, reference, room_id, property_id, check_in, check_out, nights, guest_name, guest_email, subtotal, total, currency, payment_status)
VALUES
  ('96000000-0000-4000-8000-000000000001', 'CURR-A-001', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', current_date + 30, current_date + 31, 1, 'Currency Guest A', 'currency-a@example.test', 1000, 1000, 'TZS', 'paid'),
  ('96000000-0000-4000-8000-000000000002', 'CURR-B-001', '95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', current_date + 30, current_date + 31, 1, 'Currency Guest B', 'currency-b@example.test', 2000, 2000, 'KES', 'paid');

INSERT INTO public.payment_events (booking_id, event_type, amount, currency, idempotency_key)
VALUES ('96000000-0000-4000-8000-000000000001', 'payment_received', 250, 'TZS', 'currency-test-payment-a');
-- An unverified provider event with no currency remains auditable as NULL, not USD or property currency.
INSERT INTO public.payment_events (booking_id, event_type, amount, currency, idempotency_key)
VALUES ('96000000-0000-4000-8000-000000000001', 'ipn:completed', 10, NULL, 'currency-test-payment-unknown');
SELECT is((SELECT currency IS NULL FROM public.payment_events WHERE idempotency_key = 'currency-test-payment-unknown'),
  true, 'Unknown provider currency remains NULL and is never guessed');
INSERT INTO public.pms_folio_postings (booking_id, idempotency_key, amount, currency, description)
VALUES ('96000000-0000-4000-8000-000000000001', 'currency-test-folio-a', 75, 'TZS', 'Currency test posting');

-- A booking cannot consume an extra owned by another property, even if that extra's
-- currency happens to be valid for the other property.
INSERT INTO public.extras (property_id, slug, name, price, currency)
VALUES ('92000000-0000-4000-8000-000000000002', 'currency-extra-b-kes', 'Property B Extra', 50, 'KES');
DO $booking_extra_currency$
BEGIN
  BEGIN
    INSERT INTO public.booking_extras (booking_id, extra_id, quantity, unit_price, line_total)
    SELECT '96000000-0000-4000-8000-000000000001', id, 1, 50, 50
    FROM public.extras WHERE slug = 'currency-extra-b-kes';
    RAISE EXCEPTION 'Cross-property booking extra unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Cross-property booking extra unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$booking_extra_currency$;
SELECT pass('Booking extras must belong to the booking property and transaction currency');

DO $child_currency$
BEGIN
  BEGIN
    INSERT INTO public.payment_events (booking_id, event_type, amount, currency)
    VALUES ('96000000-0000-4000-8000-000000000001', 'payment_received', 10, 'KES');
    RAISE EXCEPTION 'Wrong-currency payment event unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Wrong-currency payment event unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.payment_events SET currency = 'USD'
    WHERE idempotency_key = 'currency-test-payment-a';
    RAISE EXCEPTION 'Historical payment event currency mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Historical payment event currency mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.pms_folio_postings (booking_id, idempotency_key, amount, currency, description)
    VALUES ('96000000-0000-4000-8000-000000000001', 'currency-test-folio-wrong', 10, 'KES', 'Wrong currency');
    RAISE EXCEPTION 'Wrong-currency folio posting unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Wrong-currency folio posting unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.pms_folio_postings SET currency = 'USD'
    WHERE idempotency_key = 'currency-test-folio-a';
    RAISE EXCEPTION 'Historical folio currency mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Historical folio currency mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$child_currency$;

INSERT INTO public.guests (id, full_name) VALUES
  ('97000000-0000-4000-8000-000000000001', 'Currency Test Guest');
UPDATE public.bookings SET guest_id = '97000000-0000-4000-8000-000000000001'
WHERE id IN ('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002');

DO $test$
BEGIN
  IF (SELECT currency FROM public.staynas_properties WHERE id = '92000000-0000-4000-8000-000000000001') <> 'TZS'
     OR (SELECT currency FROM public.staynas_properties WHERE id = '92000000-0000-4000-8000-000000000002') <> 'KES' THEN
    RAISE EXCEPTION 'Properties did not retain distinct operating currencies';
  END IF;

  BEGIN
    INSERT INTO public.bookings
      (reference, room_id, property_id, check_in, check_out, nights, guest_name, guest_email, total, currency)
    VALUES
      ('CURR-A-BAD', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
       current_date + 32, current_date + 33, 1, 'Wrong Currency Guest', 'wrong-currency@example.test', 1000, 'KES');
    RAISE EXCEPTION 'Wrong-currency booking unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Wrong-currency booking unexpectedly succeeded' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.bookings SET currency = 'USD'
    WHERE id = '96000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Historical booking currency mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Historical booking currency mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;

-- Property-owned AI monetary artifacts must carry the property currency and cannot be relabelled.
INSERT INTO public.ai_revenue_opportunities (property_id, currency, kind, title, estimated_impact)
VALUES
  ('92000000-0000-4000-8000-000000000002', 'KES', 'currency_test', 'Property B opportunity', 200),
  ('92000000-0000-4000-8000-000000000001', 'TZS', 'currency_test', 'Property A opportunity', 100);
DO $artifact_currency$
BEGIN
  BEGIN
    INSERT INTO public.ai_revenue_opportunities (property_id, currency, kind, title, estimated_impact)
    VALUES ('92000000-0000-4000-8000-000000000001', 'KES', 'currency_test', 'Wrong currency', 50);
    RAISE EXCEPTION 'Wrong-currency AI artifact unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Wrong-currency AI artifact unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.ai_revenue_opportunities SET currency = 'USD'
    WHERE title = 'Property A opportunity';
    RAISE EXCEPTION 'Historical AI artifact currency mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Historical AI artifact currency mutation unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$artifact_currency$;
SELECT pass('AI monetary artifacts must match and retain property currency');

-- An authorised owner changes only Property A. Historical booking amount and currency remain unchanged.
SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.ai_revenue_opportunities WHERE property_id = '92000000-0000-4000-8000-000000000002'),
  0::bigint, 'Property A cannot read Property B AI monetary artifacts');
SELECT * FROM public.staynas_update_property_currency('USD');
RESET ROLE;

DO $test$
BEGIN
  IF (SELECT currency FROM public.staynas_properties WHERE id = '92000000-0000-4000-8000-000000000001') <> 'USD' THEN
    RAISE EXCEPTION 'Authorised property currency update failed';
  END IF;
  IF (SELECT currency FROM public.staynas_properties WHERE id = '92000000-0000-4000-8000-000000000002') <> 'KES' THEN
    RAISE EXCEPTION 'Property A currency update affected Property B';
  END IF;
  IF (SELECT currency FROM public.bookings WHERE id = '96000000-0000-4000-8000-000000000001') <> 'TZS'
     OR (SELECT total FROM public.bookings WHERE id = '96000000-0000-4000-8000-000000000001') <> 1000
     OR (SELECT currency FROM public.payment_events WHERE idempotency_key = 'currency-test-payment-a') <> 'TZS'
     OR (SELECT currency FROM public.pms_folio_postings WHERE idempotency_key = 'currency-test-folio-a') <> 'TZS' THEN
    RAISE EXCEPTION 'Property currency update rewrote historical booking, payment or folio currency/amount';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staynas_property_settings_audit
    WHERE property_id = '92000000-0000-4000-8000-000000000001'
      AND setting_key = 'currency' AND previous_value = 'TZS' AND new_value = 'USD'
      AND changed_by = '93000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Property currency audit record was not written';
  END IF;
END
$test$;

DO $test$
BEGIN
  IF (SELECT currency FROM public.bookings WHERE id = '96000000-0000-4000-8000-000000000003') <> 'USD' THEN
    RAISE EXCEPTION 'New booking did not inherit the active property currency';
  END IF;
  IF (SELECT currency FROM public.bookings WHERE id = '96000000-0000-4000-8000-000000000002') <> 'KES' THEN
    RAISE EXCEPTION 'Property B historical transaction was changed';
  END IF;
END
$test$;

-- A new room and booking use the newly configured operating currency; no FX conversion is applied.
INSERT INTO public.rooms (id, property_id, catalogue_type_id, slug, name, base_price, currency, status) VALUES
  ('95000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'currency-room-a-usd', 'Currency Room A USD', 100, 'USD', 'active');
INSERT INTO public.bookings
  (id, reference, room_id, property_id, check_in, check_out, nights, guest_name, guest_email, subtotal, total, currency, payment_status, guest_id)
VALUES
  ('96000000-0000-4000-8000-000000000003', 'CURR-A-002', '95000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', current_date + 35, current_date + 36, 1, 'Currency Guest A2', 'currency-a2@example.test', 100, 100, 'USD', 'paid', '97000000-0000-4000-8000-000000000001');
INSERT INTO public.payment_events (booking_id, event_type, amount, currency, idempotency_key)
VALUES ('96000000-0000-4000-8000-000000000003', 'payment_received', 25, 'USD', 'currency-test-payment-a-usd');


-- A historical booking keeps its transaction currency for downstream redemption records,
-- even after the property's future operating currency changes.
INSERT INTO public.staynas_property_promotions
  (id, property_id, code, name, discount_type, discount_value, currency, status)
VALUES
  ('98000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
   'CURR-HISTORIC', 'Historic Currency Promotion', 'fixed', 10, 'TZS', 'active');
INSERT INTO public.staynas_promotion_redemptions
  (property_id, promotion_id, booking_id, guest_key, discount_amount, currency)
VALUES
  ('92000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001',
   '96000000-0000-4000-8000-000000000001', 'currency-guest', 10, 'TZS');
DO $redemption_currency$
BEGIN
  BEGIN
    INSERT INTO public.staynas_promotion_redemptions
      (property_id, promotion_id, booking_id, guest_key, discount_amount, currency)
    VALUES
      ('92000000-0000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001',
       '96000000-0000-4000-8000-000000000003', 'currency-guest-2', 10, 'TZS');
    RAISE EXCEPTION 'Redemption with currency different from its booking unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Redemption with currency different from its booking unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$redemption_currency$;
SELECT pass('Promotion redemptions retain historical booking currency and reject mismatches');

-- Redemptions without a booking are validated against the property's current
-- operating currency using the shared trigger's optional property_id field.
INSERT INTO public.staynas_property_promotions
  (id, property_id, code, name, discount_type, discount_value, currency, status)
VALUES
  ('98000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001',
   'CURR-NO-BOOKING', 'No Booking Currency Promotion', 'fixed', 5, 'USD', 'active');
INSERT INTO public.staynas_promotion_redemptions
  (property_id, promotion_id, booking_id, guest_key, discount_amount, currency)
VALUES
  ('92000000-0000-4000-8000-000000000001',
   '98000000-0000-4000-8000-000000000002', NULL, 'currency-guest-no-booking', 5, 'USD');
SELECT pass('Unbooked promotion redemptions must match current property currency');

-- Active property switching changes the selected currency context for a multi-property owner.
SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT public.staynas_set_active_property('92000000-0000-4000-8000-000000000001');
SELECT is((SELECT currency FROM public.staynas_properties WHERE id = public.staynas_active_property_id(auth.uid())), 'USD', 'Property A context resolves USD');
SELECT is((
  SELECT lifetime_spend IS NULL
    AND lifetime_spend_currency IS NULL
    AND lifetime_spend_by_currency ? 'TZS'
    AND lifetime_spend_by_currency ? 'USD'
  FROM public.guest_directory WHERE id = '97000000-0000-4000-8000-000000000001'
), true, 'Guest lifetime spend remains separated by transaction currency within Property A');
SELECT is((
  SELECT avg_spend IS NULL
    AND avg_spend_currency IS NULL
    AND avg_spend_by_currency ? 'TZS'
    AND avg_spend_by_currency ? 'USD'
  FROM public.guest_metrics WHERE guest_id = '97000000-0000-4000-8000-000000000001'
), true, 'Guest average spend remains separated by transaction currency within Property A');
SELECT public.staynas_set_active_property('92000000-0000-4000-8000-000000000002');
SELECT is((SELECT currency FROM public.staynas_properties WHERE id = public.staynas_active_property_id(auth.uid())), 'KES', 'Property B context resolves KES');
SELECT is((
  SELECT lifetime_spend_currency = 'KES'
    AND lifetime_spend = 2000
    AND lifetime_spend_by_currency ? 'KES'
    AND NOT (lifetime_spend_by_currency ? 'TZS')
  FROM public.guest_directory WHERE id = '97000000-0000-4000-8000-000000000001'
), true, 'Guest spend is isolated to Property B and retains KES currency');
RESET ROLE;

-- A reception-only user cannot change property currency.
SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.staynas_update_property_currency('USD');
    RAISE EXCEPTION 'Unauthorised currency update unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Unauthorised currency update unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- Property A user cannot read Property B's bookings through RLS.
SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.bookings WHERE id = '96000000-0000-4000-8000-000000000002'), 0, 'Cross-property booking access is denied');
RESET ROLE;

SELECT pass('Property operating currency, transaction currency inheritance, history immutability, audit, switching, authorisation and RLS contracts pass');
SELECT * FROM finish();
ROLLBACK;
