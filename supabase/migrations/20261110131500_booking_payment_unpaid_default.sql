-- Pay-at-property reservations are accepted without collecting a deposit.
-- Keep the canonical initial payment state explicitly unpaid until a provider posts settlement.
BEGIN;
ALTER TABLE public.bookings
  ALTER COLUMN payment_status SET DEFAULT 'unpaid';
COMMIT;
