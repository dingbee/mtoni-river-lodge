
-- 1) Extend reviews table
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS original_review text,
  ADD COLUMN IF NOT EXISTS short_summary text,
  ADD COLUMN IF NOT EXISTS medium_summary text,
  ADD COLUMN IF NOT EXISTS imported_from text,
  ADD COLUMN IF NOT EXISTS review_url text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz;

-- 2) review_statistics table (single-row-per-source config)
CREATE TABLE IF NOT EXISTS public.review_statistics (
  source public.review_source PRIMARY KEY,
  overall_rating numeric(3,2) NOT NULL CHECK (overall_rating >= 0 AND overall_rating <= 5),
  total_reviews integer NOT NULL CHECK (total_reviews >= 0),
  profile_url text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.review_statistics TO anon, authenticated;
GRANT ALL ON public.review_statistics TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.review_statistics TO authenticated;

ALTER TABLE public.review_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view review statistics"
  ON public.review_statistics FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Staff can manage review statistics"
  ON public.review_statistics FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER review_statistics_set_updated_at
  BEFORE UPDATE ON public.review_statistics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults reflecting current hardcoded values
INSERT INTO public.review_statistics (source, overall_rating, total_reviews, profile_url) VALUES
  ('google', 4.8, 90, 'https://www.google.com/search?q=Mtoni+River+Lodge+Arusha+reviews'),
  ('tripadvisor', 4.9, 140, 'https://www.tripadvisor.com/Hotel_Review-g297913-d27185811-Reviews-Mtoni_River_Lodge-Arusha_Arusha_Region.html'),
  ('direct', 5.0, 0, NULL)
ON CONFLICT (source) DO NOTHING;

-- 3) activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON public.activity_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs (action);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view activity logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can insert activity logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND actor_id = auth.uid());
