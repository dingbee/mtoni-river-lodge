
-- Sprint 3: CRM intelligence layer
-- 1) Extend guests
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS anniversary date,
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_since timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at timestamptz;

-- 2) Guest preferences
CREATE TABLE IF NOT EXISTS public.guest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  key text NOT NULL,
  value text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guest_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_preferences TO authenticated;
GRANT ALL ON public.guest_preferences TO service_role;
ALTER TABLE public.guest_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage guest preferences" ON public.guest_preferences
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER trg_guest_preferences_updated
  BEFORE UPDATE ON public.guest_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_guest_preferences_guest ON public.guest_preferences(guest_id);

-- 3) Guest documents (stub – no uploads yet)
CREATE TABLE IF NOT EXISTS public.guest_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'placeholder',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_documents TO authenticated;
GRANT ALL ON public.guest_documents TO service_role;
ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage guest documents" ON public.guest_documents
  FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER trg_guest_documents_updated
  BEFORE UPDATE ON public.guest_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_guest_documents_guest ON public.guest_documents(guest_id);

-- 4) Relationship metrics view (SECURITY INVOKER via underlying RLS)
CREATE OR REPLACE VIEW public.guest_metrics AS
WITH b AS (
  SELECT
    guest_id,
    COUNT(*) FILTER (WHERE status <> 'cancelled') AS stays,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
    COUNT(*) AS all_bookings,
    AVG(NULLIF(nights,0))::numeric AS avg_nights,
    AVG(NULLIF(total,0))::numeric AS avg_spend,
    AVG(GREATEST(0, (check_in - created_at::date)))::numeric AS avg_lead_time_days,
    AVG(COALESCE(adults,0) + COALESCE(children,0))::numeric AS avg_party_size
  FROM public.bookings
  WHERE guest_id IS NOT NULL
  GROUP BY guest_id
),
fav_room AS (
  SELECT DISTINCT ON (guest_id) guest_id, room_id AS favourite_room_id
  FROM public.bookings
  WHERE guest_id IS NOT NULL AND room_id IS NOT NULL AND status <> 'cancelled'
  GROUP BY guest_id, room_id
  ORDER BY guest_id, COUNT(*) DESC, MAX(check_in) DESC
),
fav_exp AS (
  SELECT DISTINCT ON (bk.guest_id) bk.guest_id, e.name AS favourite_experience
  FROM public.booking_extras be
  JOIN public.bookings bk ON bk.id = be.booking_id
  JOIN public.extras e ON e.id = be.extra_id
  WHERE bk.guest_id IS NOT NULL
  GROUP BY bk.guest_id, e.name
  ORDER BY bk.guest_id, COUNT(*) DESC
)
SELECT
  g.id AS guest_id,
  COALESCE(b.stays,0) AS stays,
  COALESCE(b.cancelled,0) AS cancelled,
  CASE WHEN COALESCE(b.all_bookings,0) > 0
       THEN ROUND((b.cancelled::numeric / b.all_bookings::numeric) * 100, 1)
       ELSE 0 END AS cancellation_rate,
  ROUND(COALESCE(b.avg_nights,0), 1) AS avg_nights,
  ROUND(COALESCE(b.avg_spend,0), 2) AS avg_spend,
  ROUND(COALESCE(b.avg_lead_time_days,0), 0) AS avg_lead_time_days,
  ROUND(COALESCE(b.avg_party_size,0), 1) AS avg_party_size,
  (COALESCE(b.stays,0) >= 2) AS is_repeat,
  fr.favourite_room_id,
  fe.favourite_experience
FROM public.guests g
LEFT JOIN b ON b.guest_id = g.id
LEFT JOIN fav_room fr ON fr.guest_id = g.id
LEFT JOIN fav_exp fe ON fe.guest_id = g.id
WHERE g.is_deleted = false;

GRANT SELECT ON public.guest_metrics TO authenticated;
GRANT SELECT ON public.guest_metrics TO service_role;

-- 5) Country stats view
CREATE OR REPLACE VIEW public.guest_country_stats AS
SELECT
  COALESCE(NULLIF(TRIM(country),''),'Unknown') AS country,
  COUNT(*)::int AS guest_count,
  COUNT(*) FILTER (WHERE status = 'vip')::int AS vip_count,
  COUNT(*) FILTER (WHERE status = 'returning')::int AS returning_count
FROM public.guests
WHERE is_deleted = false
GROUP BY 1;
GRANT SELECT ON public.guest_country_stats TO authenticated;
GRANT SELECT ON public.guest_country_stats TO service_role;
