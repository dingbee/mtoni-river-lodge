-- Bind guest payment attempts and settlement events to the exact property provider account.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS staynas_guest_payment_provider_accounts_id_property_uidx
  ON public.staynas_guest_payment_provider_accounts(id,property_id);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_provider_account_id uuid;
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS provider_account_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bookings_payment_provider_account_property_fk') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_payment_provider_account_property_fk
      FOREIGN KEY (payment_provider_account_id,property_id)
      REFERENCES public.staynas_guest_payment_provider_accounts(id,property_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_events_provider_account_fk') THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_provider_account_fk
      FOREIGN KEY (provider_account_id)
      REFERENCES public.staynas_guest_payment_provider_accounts(id)
      ON DELETE RESTRICT;
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_pesapal_account_tracking_uidx
  ON public.bookings(payment_provider_account_id,pesapal_order_tracking_id)
  WHERE payment_provider_account_id IS NOT NULL AND pesapal_order_tracking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_pesapal_account_merchant_uidx
  ON public.bookings(payment_provider_account_id,pesapal_merchant_reference)
  WHERE payment_provider_account_id IS NOT NULL AND pesapal_merchant_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_payment_provider_account_idx
  ON public.bookings(payment_provider_account_id)
  WHERE payment_provider_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_events_provider_account_idx
  ON public.payment_events(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.payment_provider_account_id IS
  'Exact property-scoped guest payment account used to initiate and verify this booking payment; no platform credential fallback.';
COMMENT ON COLUMN public.payment_events.provider_account_id IS
  'Property-scoped guest payment account that generated this event.';

COMMIT;
