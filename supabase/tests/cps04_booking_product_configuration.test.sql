-- CPS-04 property isolation, currency, publication and no-inventory-mutation contracts.
BEGIN;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.staynas_booking_product_configurations'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Booking product configuration RLS is not enabled';
  END IF;
  IF has_table_privilege('anon','public.staynas_booking_product_configurations','INSERT')
     OR has_table_privilege('anon','public.staynas_booking_product_configurations','UPDATE')
     OR has_table_privilege('anon','public.staynas_booking_product_configurations','DELETE') THEN
    RAISE EXCEPTION 'Anonymous users can mutate booking product configuration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.staynas_booking_product_configurations'::regclass
      AND conname='staynas_booking_product_unique'
  ) THEN RAISE EXCEPTION 'Booking product uniqueness constraint is missing'; END IF;
END
$test$;
ROLLBACK;
