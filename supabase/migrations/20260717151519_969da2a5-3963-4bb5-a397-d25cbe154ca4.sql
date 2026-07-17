
-- Extend ai_concierge_recommendations with lifecycle fields
ALTER TABLE public.ai_concierge_recommendations
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ai_concierge_recommendations_booking_idx ON public.ai_concierge_recommendations(booking_id);
CREATE INDEX IF NOT EXISTS ai_concierge_recommendations_guest_idx ON public.ai_concierge_recommendations(guest_id);
CREATE INDEX IF NOT EXISTS ai_concierge_recommendations_status_idx ON public.ai_concierge_recommendations(status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ai_concierge_recommendations_set_updated_at') THEN
    CREATE TRIGGER ai_concierge_recommendations_set_updated_at
      BEFORE UPDATE ON public.ai_concierge_recommendations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Extend staff read/write for recommendation management
DROP POLICY IF EXISTS "recs staff manage" ON public.ai_concierge_recommendations;
CREATE POLICY "recs staff manage" ON public.ai_concierge_recommendations
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));

-- ai_guest_journey_events
CREATE TABLE IF NOT EXISTS public.ai_guest_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid REFERENCES public.guests(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'system',
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_guest_journey_events TO authenticated;
GRANT ALL ON public.ai_guest_journey_events TO service_role;
ALTER TABLE public.ai_guest_journey_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journey staff read" ON public.ai_guest_journey_events
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "journey staff write" ON public.ai_guest_journey_events
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]));

CREATE INDEX IF NOT EXISTS ai_guest_journey_events_guest_idx ON public.ai_guest_journey_events(guest_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_guest_journey_events_booking_idx ON public.ai_guest_journey_events(booking_id, occurred_at DESC);

-- ai_stay_insights
CREATE TABLE IF NOT EXISTS public.ai_stay_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  content text NOT NULL,
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_stay_insights TO authenticated;
GRANT ALL ON public.ai_stay_insights TO service_role;
ALTER TABLE public.ai_stay_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stay insights staff read" ON public.ai_stay_insights
  FOR SELECT TO authenticated USING (public.is_any_staff(auth.uid()));
CREATE POLICY "stay insights staff write" ON public.ai_stay_insights
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]));

CREATE INDEX IF NOT EXISTS ai_stay_insights_booking_idx ON public.ai_stay_insights(booking_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='ai_stay_insights_set_updated_at') THEN
    CREATE TRIGGER ai_stay_insights_set_updated_at
      BEFORE UPDATE ON public.ai_stay_insights
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
