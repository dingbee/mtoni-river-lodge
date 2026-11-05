-- Enums
CREATE TYPE public.checkin_status AS ENUM (
  'not_started','in_progress','submitted','under_review','approved','rejected','expired'
);

CREATE TYPE public.checkin_document_status AS ENUM (
  'pending','uploaded','verified','rejected'
);

-- guest_checkins
CREATE TABLE public.guest_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24),'hex'),
  status public.checkin_status NOT NULL DEFAULT 'not_started',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  started_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  signature_name text,
  terms_accepted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_checkins_booking_unique UNIQUE (booking_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_checkins TO authenticated;
GRANT ALL ON public.guest_checkins TO service_role;
ALTER TABLE public.guest_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage guest checkins" ON public.guest_checkins
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));

CREATE INDEX idx_guest_checkins_booking ON public.guest_checkins(booking_id);
CREATE INDEX idx_guest_checkins_guest ON public.guest_checkins(guest_id);
CREATE INDEX idx_guest_checkins_status ON public.guest_checkins(status);
CREATE INDEX idx_guest_checkins_expires ON public.guest_checkins(expires_at);

CREATE TRIGGER trg_guest_checkins_updated BEFORE UPDATE ON public.guest_checkins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- arrival_information
CREATE TABLE public.arrival_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.guest_checkins(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  estimated_arrival_time time,
  arrival_date date,
  arrival_mode text,
  flight_number text,
  flight_arrival_time timestamptz,
  airport text,
  transfer_required boolean NOT NULL DEFAULT false,
  transfer_notes text,
  visit_purpose text,
  dietary_requirements text,
  accessibility_needs text,
  special_requests text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arrival_information_checkin_unique UNIQUE (checkin_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arrival_information TO authenticated;
GRANT ALL ON public.arrival_information TO service_role;
ALTER TABLE public.arrival_information ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage arrival information" ON public.arrival_information
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));

CREATE INDEX idx_arrival_information_booking ON public.arrival_information(booking_id);
CREATE INDEX idx_arrival_information_date ON public.arrival_information(arrival_date);

CREATE TRIGGER trg_arrival_information_updated BEFORE UPDATE ON public.arrival_information
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- extend existing guest_documents for check-in uploads
ALTER TABLE public.guest_documents
  ADD COLUMN IF NOT EXISTS checkin_id uuid REFERENCES public.guest_checkins(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_size integer,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_expiry date,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.guest_documents ALTER COLUMN guest_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guest_documents_checkin ON public.guest_documents(checkin_id);
CREATE INDEX IF NOT EXISTS idx_guest_documents_booking ON public.guest_documents(booking_id);