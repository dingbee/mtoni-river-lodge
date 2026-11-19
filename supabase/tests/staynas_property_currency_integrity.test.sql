-- StayNas property operating currency, transaction immutability and property isolation contracts.
BEGIN;
SELECT plan(1);

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

-- Both properties accept only their own operating currency at booking creation.
INSERT INTO public.bookings
  (id, reference, room_id, property_id, check_in, check_out, nights, guest_name, guest_email, subtotal, total, currency)
VALUES
  ('96000000-0000-4000-8000-000000000001', 'CURR-A-001', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', current_date + 30, current_date + 31, 1, 'Currency Guest A', 'currency-a@example.test', 1000, 1000, 'TZS'),
  ('96000000-0000-4000-8000-000000000002', 'CURR-B-001', '95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', current_date + 30, current_date + 31, 1, 'Currency Guest B', 'currency-b@example.test', 2000, 2000, 'KES');

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

-- An authorised owner changes only Property A. Historical booking amount and currency remain unchanged.
SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
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
     OR (SELECT total FROM public.bookings WHERE id = '96000000-0000-4000-8000-000000000001') <> 1000 THEN
    RAISE EXCEPTION 'Property currency update rewrote historical booking currency or amount';
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

-- A new room and booking use the newly configured operating currency; no FX conversion is applied.
INSERT INTO public.rooms (id, property_id, catalogue_type_id, slug, name, base_price, currency, status) VALUES
  ('95000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'currency-room-a-usd', 'Currency Room A USD', 100, 'USD', 'active');
INSERT INTO public.bookings
  (id, reference, room_id, property_id, check_in, check_out, nights, guest_name, guest_email, subtotal, total, currency)
VALUES
  ('96000000-0000-4000-8000-000000000003', 'CURR-A-002', '95000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', current_date + 35, current_date + 36, 1, 'Currency Guest A2', 'currency-a2@example.test', 100, 100, 'USD');

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

-- Active property switching changes the selected currency context for a multi-property owner.
SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT public.staynas_set_active_property('92000000-0000-4000-8000-000000000001');
SELECT is((SELECT currency FROM public.staynas_properties WHERE id = public.staynas_active_property_id(auth.uid())), 'USD', 'Property A context resolves USD');
SELECT public.staynas_set_active_property('92000000-0000-4000-8000-000000000002');
SELECT is((SELECT currency FROM public.staynas_properties WHERE id = public.staynas_active_property_id(auth.uid())), 'KES', 'Property B context resolves KES');
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
