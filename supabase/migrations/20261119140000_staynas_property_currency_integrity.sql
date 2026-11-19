-- StayNas property currency integrity.
-- Adds property/currency identity to AI and finance alerts and makes CRM monetary
-- aggregates property-scoped and currency-safe. No booking, invoice, payment or
-- historical financial row is rewritten or backfilled.

BEGIN;

ALTER TABLE public.ai_revenue_forecasts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_revenue_opportunities
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_revenue_alerts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_pricing_recommendations
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.financial_alerts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_revenue_forecasts'::regclass AND conname = 'ai_revenue_forecasts_currency_iso3_chk') THEN
    ALTER TABLE public.ai_revenue_forecasts ADD CONSTRAINT ai_revenue_forecasts_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_revenue_opportunities'::regclass AND conname = 'ai_revenue_opportunities_currency_iso3_chk') THEN
    ALTER TABLE public.ai_revenue_opportunities ADD CONSTRAINT ai_revenue_opportunities_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_revenue_alerts'::regclass AND conname = 'ai_revenue_alerts_currency_iso3_chk') THEN
    ALTER TABLE public.ai_revenue_alerts ADD CONSTRAINT ai_revenue_alerts_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_pricing_recommendations'::regclass AND conname = 'ai_pricing_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_pricing_recommendations ADD CONSTRAINT ai_pricing_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}

CREATE INDEX IF NOT EXISTS ai_revenue_forecasts_property_created_idx ON public.ai_revenue_forecasts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_opportunities_property_created_idx ON public.ai_revenue_opportunities(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_alerts_property_created_idx ON public.ai_revenue_alerts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_alerts_property_created_idx ON public.financial_alerts(property_id, created_at DESC);

-- AI forecast artifacts are visible only within the active property context.
ALTER TABLE public.ai_revenue_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revenue_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revenue_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_forecasts ON public.ai_revenue_forecasts;
CREATE POLICY staynas_property_read_ai_revenue_forecasts ON public.ai_revenue_forecasts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_forecasts ON public.ai_revenue_forecasts;
CREATE POLICY staynas_property_create_ai_revenue_forecasts ON public.ai_revenue_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_read_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_create_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_update_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_read_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_create_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_update_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

-- Restrict existing AI pricing recommendations to the active property as well.
DROP POLICY IF EXISTS "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations;
CREATE POLICY "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));
CREATE POLICY "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));
CREATE POLICY "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));

-- Financial alerts are property-owned, not a cross-property shared queue.
DROP POLICY IF EXISTS "Finance manage financial alerts" ON public.financial_alerts;
CREATE POLICY "Finance manage financial alerts" ON public.financial_alerts
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));

GRANT SELECT, INSERT ON public.ai_revenue_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_revenue_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_revenue_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_alerts TO authenticated;

-- Property-scoped CRM spend summary. Existing spend values are not converted or rewritten.
CREATE OR REPLACE VIEW public.guest_directory WITH (security_invoker = true) AS
SELECT
  g.id, g.email, g.phone_e164, g.full_name, g.country, g.preferred_language,
  g.nationality, g.time_zone, g.communication_preference, g.avatar_url, g.status,
  g.internal_notes, g.created_at, g.updated_at,
  COALESCE(s.total_stays, 0) AS total_stays,
  COALESCE(s.total_nights, 0) AS total_nights,
  CASE WHEN COALESCE(s.spend_currency_count, 0) > 1 THEN NULL::numeric
       ELSE COALESCE(s.lifetime_spend, 0::numeric) END AS lifetime_spend,
  s.first_stay, s.last_stay, COALESCE(s.cancelled_count, 0) AS cancelled_count,
  COALESCE(t.tag_ids, ARRAY[]::uuid[]) AS tag_ids,
  s.lifetime_spend_currency,
  COALESCE(spend.lifetime_spend_by_currency, '{}'::jsonb) AS lifetime_spend_by_currency
FROM public.guests g
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE b.status <> 'cancelled'::public.booking_status)::integer AS total_stays,
    sum(b.nights) FILTER (WHERE b.status <> 'cancelled'::public.booking_status)::integer AS total_nights,
    sum(b.total) FILTER (WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])) AS lifetime_spend,
    count(DISTINCT upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) = 1 THEN min(upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) ELSE NULL END AS lifetime_spend_currency,
    min(b.check_in) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS first_stay,
    max(b.check_in) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS last_stay,
    count(*) FILTER (WHERE b.status = 'cancelled'::public.booking_status)::integer AS cancelled_count
  FROM public.bookings b
  WHERE b.guest_id = g.id
    AND b.property_id = public.staynas_active_property_id(auth.uid())
) s ON true
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg(currency, amount) AS lifetime_spend_by_currency
  FROM (
    SELECT upper(COALESCE(b.currency, 'UNKNOWN')) AS currency, sum(b.total) AS amount
    FROM public.bookings b
    WHERE b.guest_id = g.id
      AND b.property_id = public.staynas_active_property_id(auth.uid())
      AND b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    GROUP BY upper(COALESCE(b.currency, 'UNKNOWN'))
  ) grouped_spend
) spend ON true
LEFT JOIN LATERAL (
  SELECT array_agg(gta.tag_id) AS tag_ids
  FROM public.guest_tag_assignments gta
  WHERE gta.guest_id = g.id
) t ON true
WHERE g.is_deleted = false;

CREATE OR REPLACE VIEW public.guest_metrics WITH (security_invoker = true) AS
WITH active_property AS (
  SELECT public.staynas_active_property_id(auth.uid()) AS property_id
),
b AS (
  SELECT
    bookings.guest_id,
    count(*) FILTER (WHERE bookings.status <> 'cancelled'::public.booking_status) AS stays,
    count(*) FILTER (WHERE bookings.status = 'cancelled'::public.booking_status) AS cancelled,
    count(*) AS all_bookings,
    avg(NULLIF(bookings.nights, 0)) AS avg_nights,
    count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) <= 1
      THEN avg(NULLIF(bookings.total, 0::numeric)) ELSE NULL::numeric END AS avg_spend,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) = 1
      THEN min(upper(COALESCE(bookings.currency, 'UNKNOWN'))) ELSE NULL END AS avg_spend_currency,
    avg(GREATEST(0, bookings.check_in - bookings.created_at::date)) AS avg_lead_time_days,
    avg(COALESCE(bookings.adults, 0) + COALESCE(bookings.children, 0)) AS avg_party_size
  FROM public.bookings bookings
  CROSS JOIN active_property
  WHERE bookings.guest_id IS NOT NULL AND bookings.property_id = active_property.property_id
  GROUP BY bookings.guest_id
),
spend_by_currency AS (
  SELECT guest_id, jsonb_object_agg(currency, average_spend) AS avg_spend_by_currency
  FROM (
    SELECT bookings.guest_id, upper(COALESCE(bookings.currency, 'UNKNOWN')) AS currency,
      avg(NULLIF(bookings.total, 0::numeric)) AS average_spend
    FROM public.bookings bookings
    CROSS JOIN active_property
    WHERE bookings.guest_id IS NOT NULL AND bookings.property_id = active_property.property_id
    GROUP BY bookings.guest_id, upper(COALESCE(bookings.currency, 'UNKNOWN'))
  ) grouped
  GROUP BY guest_id
),
fav_room AS (
  SELECT DISTINCT ON (bookings.guest_id) bookings.guest_id, bookings.room_id AS favourite_room_id
  FROM public.bookings bookings
  CROSS JOIN active_property
  WHERE bookings.guest_id IS NOT NULL AND bookings.room_id IS NOT NULL
    AND bookings.status <> 'cancelled'::public.booking_status
    AND bookings.property_id = active_property.property_id
  GROUP BY bookings.guest_id, bookings.room_id
  ORDER BY bookings.guest_id, count(*) DESC, max(bookings.check_in) DESC
),
fav_exp AS (
  SELECT DISTINCT ON (bk.guest_id) bk.guest_id, e.name AS favourite_experience
  FROM public.booking_extras be
  JOIN public.bookings bk ON bk.id = be.booking_id
  JOIN public.extras e ON e.id = be.extra_id
  CROSS JOIN active_property
  WHERE bk.guest_id IS NOT NULL AND bk.property_id = active_property.property_id
  GROUP BY bk.guest_id, e.name
  ORDER BY bk.guest_id, count(*) DESC
)
SELECT
  g.id AS guest_id,
  COALESCE(b.stays, 0::bigint) AS stays,
  COALESCE(b.cancelled, 0::bigint) AS cancelled,
  CASE WHEN COALESCE(b.all_bookings, 0::bigint) > 0
    THEN round(b.cancelled::numeric / b.all_bookings::numeric * 100::numeric, 1)
    ELSE 0::numeric END AS cancellation_rate,
  round(COALESCE(b.avg_nights, 0::numeric), 1) AS avg_nights,
  CASE WHEN COALESCE(b.spend_currency_count, 0) > 1 THEN NULL::numeric
       ELSE round(COALESCE(b.avg_spend, 0::numeric), 2) END AS avg_spend,
  round(COALESCE(b.avg_lead_time_days, 0::numeric), 0) AS avg_lead_time_days,
  round(COALESCE(b.avg_party_size, 0::numeric), 1) AS avg_party_size,
  COALESCE(b.stays, 0::bigint) >= 2 AS is_repeat,
  fr.favourite_room_id, fe.favourite_experience,
  b.avg_spend_currency,
  COALESCE(spend_by_currency.avg_spend_by_currency, '{}'::jsonb) AS avg_spend_by_currency
FROM public.guests g
LEFT JOIN b ON b.guest_id = g.id
LEFT JOIN spend_by_currency ON spend_by_currency.guest_id = g.id
LEFT JOIN fav_room fr ON fr.guest_id = g.id
LEFT JOIN fav_exp fe ON fe.guest_id = g.id
WHERE g.is_deleted = false;


-- Other monetary AI outputs and generated reports also retain property/currency identity.
ALTER TABLE public.ai_guest_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_guest_alerts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.analytics_reports
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_trend_snapshots
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;

DO $more_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_guest_recommendations'::regclass AND conname = 'ai_guest_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_guest_recommendations ADD CONSTRAINT ai_guest_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_reports'::regclass AND conname = 'analytics_reports_currency_iso3_chk') THEN
    ALTER TABLE public.analytics_reports ADD CONSTRAINT analytics_reports_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_trend_snapshots'::regclass AND conname = 'ai_trend_snapshots_currency_iso3_chk') THEN
    ALTER TABLE public.ai_trend_snapshots ADD CONSTRAINT ai_trend_snapshots_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$more_constraints$;

CREATE INDEX IF NOT EXISTS ai_guest_recommendations_property_created_idx ON public.ai_guest_recommendations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_guest_alerts_property_created_idx ON public.ai_guest_alerts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_reports_property_created_idx ON public.analytics_reports(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_trend_snapshots_property_created_idx ON public.ai_trend_snapshots(property_id, created_at DESC);

ALTER TABLE public.ai_guest_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guest_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trend_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_property_read_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_read_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_create_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_create_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_update_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_read_ai_guest_alerts ON public.ai_guest_alerts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_create_ai_guest_alerts ON public.ai_guest_alerts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_update_ai_guest_alerts ON public.ai_guest_alerts
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]));

DROP POLICY IF EXISTS "Managers write reports" ON public.analytics_reports;
CREATE POLICY "Managers write reports" ON public.analytics_reports
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Managers write trend_snapshots" ON public.ai_trend_snapshots;
CREATE POLICY "Managers write trend_snapshots" ON public.ai_trend_snapshots
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE ON public.ai_guest_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_guest_alerts TO authenticated;
GRANT SELECT, INSERT ON public.analytics_reports TO authenticated;
GRANT SELECT, INSERT ON public.ai_trend_snapshots TO authenticated;


-- Executive analytics recommendations inherit the source property's currency.
ALTER TABLE public.ai_analytics_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
DO $analytics_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_analytics_recommendations'::regclass AND conname = 'ai_analytics_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_analytics_recommendations ADD CONSTRAINT ai_analytics_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3});
  END IF;
END
$analytics_constraints$;
CREATE INDEX IF NOT EXISTS ai_analytics_recommendations_property_created_idx
  ON public.ai_analytics_recommendations(property_id, created_at DESC);
DROP POLICY IF EXISTS "Managers write analytics_recs" ON public.ai_analytics_recommendations;
CREATE POLICY "Managers write analytics_recs" ON public.ai_analytics_recommendations
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE ON public.ai_analytics_recommendations TO authenticated;


-- Executive and marketing intelligence artifacts are isolated by active property.
ALTER TABLE public.ai_executive_briefings
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_priorities
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_reputation_insights
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_strategic_risks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;

DO $executive_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_executive_briefings'::regclass AND conname = 'ai_executive_briefings_currency_iso3_chk') THEN
    ALTER TABLE public.ai_executive_briefings ADD CONSTRAINT ai_executive_briefings_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_marketing_recommendations'::regclass AND conname = 'ai_marketing_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_marketing_recommendations ADD CONSTRAINT ai_marketing_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_marketing_priorities'::regclass AND conname = 'ai_marketing_priorities_currency_iso3_chk') THEN
    ALTER TABLE public.ai_marketing_priorities ADD CONSTRAINT ai_marketing_priorities_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$executive_constraints$;

DROP INDEX IF EXISTS public.ai_executive_briefings_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_executive_briefings_property_date_uidx
  ON public.ai_executive_briefings(property_id, briefing_date);
CREATE INDEX IF NOT EXISTS ai_marketing_recommendations_property_created_idx
  ON public.ai_marketing_recommendations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_marketing_priorities_property_created_idx
  ON public.ai_marketing_priorities(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_reputation_insights_property_created_idx
  ON public.ai_reputation_insights(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_strategic_risks_property_created_idx
  ON public.ai_strategic_risks(property_id, created_at DESC);

ALTER TABLE public.ai_executive_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reputation_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_strategic_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY staynas_property_ai_executive_briefings ON public.ai_executive_briefings
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY staynas_property_ai_marketing_recommendations ON public.ai_marketing_recommendations
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_marketing_priorities ON public.ai_marketing_priorities
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_reputation_insights ON public.ai_reputation_insights
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_strategic_risks ON public.ai_strategic_risks
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE ON public.ai_executive_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_marketing_recommendations TO authenticated;
GRANT SELECT, INSERT ON public.ai_marketing_priorities TO authenticated;
GRANT SELECT, INSERT ON public.ai_reputation_insights TO authenticated;
GRANT SELECT ON public.ai_strategic_risks TO authenticated;


-- Campaign budgets are property operating spend. Legacy unassigned campaigns remain
-- readable with their stored currency; editing them assigns them only when currency matches.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
DO $campaign_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.campaigns'::regclass AND conname = 'campaigns_currency_iso3_chk') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$campaign_constraints$;
CREATE INDEX IF NOT EXISTS campaigns_property_updated_idx ON public.campaigns(property_id, updated_at DESC);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY staynas_campaigns_read_property_or_legacy ON public.campaigns
  FOR SELECT TO authenticated
  USING (property_id IS NULL OR (
    property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
  ));
CREATE POLICY staynas_campaigns_create_property ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY staynas_campaigns_update_property ON public.campaigns
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY staynas_campaigns_delete_property ON public.campaigns
  FOR DELETE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;


-- Database-enforced transaction currency inheritance and historical immutability.
CREATE OR REPLACE FUNCTION public.staynas_guard_booking_transaction_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.property_id IS DISTINCT FROM NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Booking property and transaction currency are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
    SELECT upper(p.currency) INTO v_property_currency
    FROM public.staynas_properties p
    WHERE p.id = NEW.property_id AND p.status IN ('active','setup');
    IF v_property_currency IS NULL
       OR v_property_currency !~ '^[A-Z]{3}$'
       OR upper(COALESCE(NEW.currency,'')) IS DISTINCT FROM v_property_currency THEN
      RAISE EXCEPTION 'New booking currency must match the authoritative property operating currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_guard_child_transaction_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_booking_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
  ) THEN
    RAISE EXCEPTION 'Historical transaction currency and booking association are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
  END IF;
  IF NEW.currency IS NULL OR upper(NEW.currency) !~ '^[A-Z]{3}
    RAISE EXCEPTION 'Transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency) INTO v_booking_currency
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR upper(NEW.currency) IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency
  BEFORE INSERT OR UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency
  BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC, anon, authenticated;

COMMIT;
 THEN
    RAISE EXCEPTION 'Transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency) INTO v_booking_currency
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR upper(NEW.currency) IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency
  BEFORE INSERT OR UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency
  BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC, anon, authenticated;

COMMIT;
);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.financial_alerts'::regclass AND conname = 'financial_alerts_currency_iso3_chk') THEN
    ALTER TABLE public.financial_alerts ADD CONSTRAINT financial_alerts_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}

CREATE INDEX IF NOT EXISTS ai_revenue_forecasts_property_created_idx ON public.ai_revenue_forecasts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_opportunities_property_created_idx ON public.ai_revenue_opportunities(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_alerts_property_created_idx ON public.ai_revenue_alerts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_alerts_property_created_idx ON public.financial_alerts(property_id, created_at DESC);

-- AI forecast artifacts are visible only within the active property context.
ALTER TABLE public.ai_revenue_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revenue_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revenue_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_forecasts ON public.ai_revenue_forecasts;
CREATE POLICY staynas_property_read_ai_revenue_forecasts ON public.ai_revenue_forecasts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_forecasts ON public.ai_revenue_forecasts;
CREATE POLICY staynas_property_create_ai_revenue_forecasts ON public.ai_revenue_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_read_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_create_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_update_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_read_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_create_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_update_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

-- Restrict existing AI pricing recommendations to the active property as well.
DROP POLICY IF EXISTS "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations;
CREATE POLICY "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));
CREATE POLICY "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));
CREATE POLICY "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));

-- Financial alerts are property-owned, not a cross-property shared queue.
DROP POLICY IF EXISTS "Finance manage financial alerts" ON public.financial_alerts;
CREATE POLICY "Finance manage financial alerts" ON public.financial_alerts
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));

GRANT SELECT, INSERT ON public.ai_revenue_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_revenue_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_revenue_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_alerts TO authenticated;

-- Property-scoped CRM spend summary. Existing spend values are not converted or rewritten.
CREATE OR REPLACE VIEW public.guest_directory WITH (security_invoker = true) AS
SELECT
  g.id, g.email, g.phone_e164, g.full_name, g.country, g.preferred_language,
  g.nationality, g.time_zone, g.communication_preference, g.avatar_url, g.status,
  g.internal_notes, g.created_at, g.updated_at,
  COALESCE(s.total_stays, 0) AS total_stays,
  COALESCE(s.total_nights, 0) AS total_nights,
  CASE WHEN COALESCE(s.spend_currency_count, 0) > 1 THEN NULL::numeric
       ELSE COALESCE(s.lifetime_spend, 0::numeric) END AS lifetime_spend,
  s.first_stay, s.last_stay, COALESCE(s.cancelled_count, 0) AS cancelled_count,
  COALESCE(t.tag_ids, ARRAY[]::uuid[]) AS tag_ids,
  s.lifetime_spend_currency,
  COALESCE(spend.lifetime_spend_by_currency, '{}'::jsonb) AS lifetime_spend_by_currency
FROM public.guests g
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE b.status <> 'cancelled'::public.booking_status)::integer AS total_stays,
    sum(b.nights) FILTER (WHERE b.status <> 'cancelled'::public.booking_status)::integer AS total_nights,
    sum(b.total) FILTER (WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])) AS lifetime_spend,
    count(DISTINCT upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) = 1 THEN min(upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) ELSE NULL END AS lifetime_spend_currency,
    min(b.check_in) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS first_stay,
    max(b.check_in) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS last_stay,
    count(*) FILTER (WHERE b.status = 'cancelled'::public.booking_status)::integer AS cancelled_count
  FROM public.bookings b
  WHERE b.guest_id = g.id
    AND b.property_id = public.staynas_active_property_id(auth.uid())
) s ON true
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg(currency, amount) AS lifetime_spend_by_currency
  FROM (
    SELECT upper(COALESCE(b.currency, 'UNKNOWN')) AS currency, sum(b.total) AS amount
    FROM public.bookings b
    WHERE b.guest_id = g.id
      AND b.property_id = public.staynas_active_property_id(auth.uid())
      AND b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    GROUP BY upper(COALESCE(b.currency, 'UNKNOWN'))
  ) grouped_spend
) spend ON true
LEFT JOIN LATERAL (
  SELECT array_agg(gta.tag_id) AS tag_ids
  FROM public.guest_tag_assignments gta
  WHERE gta.guest_id = g.id
) t ON true
WHERE g.is_deleted = false;

CREATE OR REPLACE VIEW public.guest_metrics WITH (security_invoker = true) AS
WITH active_property AS (
  SELECT public.staynas_active_property_id(auth.uid()) AS property_id
),
b AS (
  SELECT
    bookings.guest_id,
    count(*) FILTER (WHERE bookings.status <> 'cancelled'::public.booking_status) AS stays,
    count(*) FILTER (WHERE bookings.status = 'cancelled'::public.booking_status) AS cancelled,
    count(*) AS all_bookings,
    avg(NULLIF(bookings.nights, 0)) AS avg_nights,
    count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) <= 1
      THEN avg(NULLIF(bookings.total, 0::numeric)) ELSE NULL::numeric END AS avg_spend,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) = 1
      THEN min(upper(COALESCE(bookings.currency, 'UNKNOWN'))) ELSE NULL END AS avg_spend_currency,
    avg(GREATEST(0, bookings.check_in - bookings.created_at::date)) AS avg_lead_time_days,
    avg(COALESCE(bookings.adults, 0) + COALESCE(bookings.children, 0)) AS avg_party_size
  FROM public.bookings bookings
  CROSS JOIN active_property
  WHERE bookings.guest_id IS NOT NULL AND bookings.property_id = active_property.property_id
  GROUP BY bookings.guest_id
),
spend_by_currency AS (
  SELECT guest_id, jsonb_object_agg(currency, average_spend) AS avg_spend_by_currency
  FROM (
    SELECT bookings.guest_id, upper(COALESCE(bookings.currency, 'UNKNOWN')) AS currency,
      avg(NULLIF(bookings.total, 0::numeric)) AS average_spend
    FROM public.bookings bookings
    CROSS JOIN active_property
    WHERE bookings.guest_id IS NOT NULL AND bookings.property_id = active_property.property_id
    GROUP BY bookings.guest_id, upper(COALESCE(bookings.currency, 'UNKNOWN'))
  ) grouped
  GROUP BY guest_id
),
fav_room AS (
  SELECT DISTINCT ON (bookings.guest_id) bookings.guest_id, bookings.room_id AS favourite_room_id
  FROM public.bookings bookings
  CROSS JOIN active_property
  WHERE bookings.guest_id IS NOT NULL AND bookings.room_id IS NOT NULL
    AND bookings.status <> 'cancelled'::public.booking_status
    AND bookings.property_id = active_property.property_id
  GROUP BY bookings.guest_id, bookings.room_id
  ORDER BY bookings.guest_id, count(*) DESC, max(bookings.check_in) DESC
),
fav_exp AS (
  SELECT DISTINCT ON (bk.guest_id) bk.guest_id, e.name AS favourite_experience
  FROM public.booking_extras be
  JOIN public.bookings bk ON bk.id = be.booking_id
  JOIN public.extras e ON e.id = be.extra_id
  CROSS JOIN active_property
  WHERE bk.guest_id IS NOT NULL AND bk.property_id = active_property.property_id
  GROUP BY bk.guest_id, e.name
  ORDER BY bk.guest_id, count(*) DESC
)
SELECT
  g.id AS guest_id,
  COALESCE(b.stays, 0::bigint) AS stays,
  COALESCE(b.cancelled, 0::bigint) AS cancelled,
  CASE WHEN COALESCE(b.all_bookings, 0::bigint) > 0
    THEN round(b.cancelled::numeric / b.all_bookings::numeric * 100::numeric, 1)
    ELSE 0::numeric END AS cancellation_rate,
  round(COALESCE(b.avg_nights, 0::numeric), 1) AS avg_nights,
  CASE WHEN COALESCE(b.spend_currency_count, 0) > 1 THEN NULL::numeric
       ELSE round(COALESCE(b.avg_spend, 0::numeric), 2) END AS avg_spend,
  round(COALESCE(b.avg_lead_time_days, 0::numeric), 0) AS avg_lead_time_days,
  round(COALESCE(b.avg_party_size, 0::numeric), 1) AS avg_party_size,
  COALESCE(b.stays, 0::bigint) >= 2 AS is_repeat,
  fr.favourite_room_id, fe.favourite_experience,
  b.avg_spend_currency,
  COALESCE(spend_by_currency.avg_spend_by_currency, '{}'::jsonb) AS avg_spend_by_currency
FROM public.guests g
LEFT JOIN b ON b.guest_id = g.id
LEFT JOIN spend_by_currency ON spend_by_currency.guest_id = g.id
LEFT JOIN fav_room fr ON fr.guest_id = g.id
LEFT JOIN fav_exp fe ON fe.guest_id = g.id
WHERE g.is_deleted = false;


-- Other monetary AI outputs and generated reports also retain property/currency identity.
ALTER TABLE public.ai_guest_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_guest_alerts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.analytics_reports
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_trend_snapshots
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;

DO $more_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_guest_recommendations'::regclass AND conname = 'ai_guest_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_guest_recommendations ADD CONSTRAINT ai_guest_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_reports'::regclass AND conname = 'analytics_reports_currency_iso3_chk') THEN
    ALTER TABLE public.analytics_reports ADD CONSTRAINT analytics_reports_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_trend_snapshots'::regclass AND conname = 'ai_trend_snapshots_currency_iso3_chk') THEN
    ALTER TABLE public.ai_trend_snapshots ADD CONSTRAINT ai_trend_snapshots_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$more_constraints$;

CREATE INDEX IF NOT EXISTS ai_guest_recommendations_property_created_idx ON public.ai_guest_recommendations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_guest_alerts_property_created_idx ON public.ai_guest_alerts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_reports_property_created_idx ON public.analytics_reports(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_trend_snapshots_property_created_idx ON public.ai_trend_snapshots(property_id, created_at DESC);

ALTER TABLE public.ai_guest_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guest_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trend_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_property_read_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_read_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_create_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_create_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_update_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_read_ai_guest_alerts ON public.ai_guest_alerts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_create_ai_guest_alerts ON public.ai_guest_alerts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_update_ai_guest_alerts ON public.ai_guest_alerts
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]));

DROP POLICY IF EXISTS "Managers write reports" ON public.analytics_reports;
CREATE POLICY "Managers write reports" ON public.analytics_reports
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Managers write trend_snapshots" ON public.ai_trend_snapshots;
CREATE POLICY "Managers write trend_snapshots" ON public.ai_trend_snapshots
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE ON public.ai_guest_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_guest_alerts TO authenticated;
GRANT SELECT, INSERT ON public.analytics_reports TO authenticated;
GRANT SELECT, INSERT ON public.ai_trend_snapshots TO authenticated;


-- Executive analytics recommendations inherit the source property's currency.
ALTER TABLE public.ai_analytics_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
DO $analytics_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_analytics_recommendations'::regclass AND conname = 'ai_analytics_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_analytics_recommendations ADD CONSTRAINT ai_analytics_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3});
  END IF;
END
$analytics_constraints$;
CREATE INDEX IF NOT EXISTS ai_analytics_recommendations_property_created_idx
  ON public.ai_analytics_recommendations(property_id, created_at DESC);
DROP POLICY IF EXISTS "Managers write analytics_recs" ON public.ai_analytics_recommendations;
CREATE POLICY "Managers write analytics_recs" ON public.ai_analytics_recommendations
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE ON public.ai_analytics_recommendations TO authenticated;


-- Executive and marketing intelligence artifacts are isolated by active property.
ALTER TABLE public.ai_executive_briefings
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_priorities
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_reputation_insights
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_strategic_risks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;

DO $executive_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_executive_briefings'::regclass AND conname = 'ai_executive_briefings_currency_iso3_chk') THEN
    ALTER TABLE public.ai_executive_briefings ADD CONSTRAINT ai_executive_briefings_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_marketing_recommendations'::regclass AND conname = 'ai_marketing_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_marketing_recommendations ADD CONSTRAINT ai_marketing_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_marketing_priorities'::regclass AND conname = 'ai_marketing_priorities_currency_iso3_chk') THEN
    ALTER TABLE public.ai_marketing_priorities ADD CONSTRAINT ai_marketing_priorities_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$executive_constraints$;

DROP INDEX IF EXISTS public.ai_executive_briefings_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_executive_briefings_property_date_uidx
  ON public.ai_executive_briefings(property_id, briefing_date);
CREATE INDEX IF NOT EXISTS ai_marketing_recommendations_property_created_idx
  ON public.ai_marketing_recommendations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_marketing_priorities_property_created_idx
  ON public.ai_marketing_priorities(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_reputation_insights_property_created_idx
  ON public.ai_reputation_insights(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_strategic_risks_property_created_idx
  ON public.ai_strategic_risks(property_id, created_at DESC);

ALTER TABLE public.ai_executive_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reputation_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_strategic_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY staynas_property_ai_executive_briefings ON public.ai_executive_briefings
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY staynas_property_ai_marketing_recommendations ON public.ai_marketing_recommendations
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_marketing_priorities ON public.ai_marketing_priorities
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_reputation_insights ON public.ai_reputation_insights
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_strategic_risks ON public.ai_strategic_risks
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE ON public.ai_executive_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_marketing_recommendations TO authenticated;
GRANT SELECT, INSERT ON public.ai_marketing_priorities TO authenticated;
GRANT SELECT, INSERT ON public.ai_reputation_insights TO authenticated;
GRANT SELECT ON public.ai_strategic_risks TO authenticated;


-- Campaign budgets are property operating spend. Legacy unassigned campaigns remain
-- readable with their stored currency; editing them assigns them only when currency matches.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
DO $campaign_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.campaigns'::regclass AND conname = 'campaigns_currency_iso3_chk') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$campaign_constraints$;
CREATE INDEX IF NOT EXISTS campaigns_property_updated_idx ON public.campaigns(property_id, updated_at DESC);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY staynas_campaigns_read_property_or_legacy ON public.campaigns
  FOR SELECT TO authenticated
  USING (property_id IS NULL OR (
    property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
  ));
CREATE POLICY staynas_campaigns_create_property ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY staynas_campaigns_update_property ON public.campaigns
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY staynas_campaigns_delete_property ON public.campaigns
  FOR DELETE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;


-- Database-enforced transaction currency inheritance and historical immutability.
CREATE OR REPLACE FUNCTION public.staynas_guard_booking_transaction_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.property_id IS DISTINCT FROM NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Booking property and transaction currency are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
    SELECT upper(p.currency) INTO v_property_currency
    FROM public.staynas_properties p
    WHERE p.id = NEW.property_id AND p.status IN ('active','setup');
    IF v_property_currency IS NULL
       OR v_property_currency !~ '^[A-Z]{3}$'
       OR upper(COALESCE(NEW.currency,'')) IS DISTINCT FROM v_property_currency THEN
      RAISE EXCEPTION 'New booking currency must match the authoritative property operating currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_guard_child_transaction_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_booking_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
  ) THEN
    RAISE EXCEPTION 'Historical transaction currency and booking association are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
  END IF;
  IF NEW.currency IS NULL OR upper(NEW.currency) !~ '^[A-Z]{3}
    RAISE EXCEPTION 'Transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency) INTO v_booking_currency
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR upper(NEW.currency) IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency
  BEFORE INSERT OR UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency
  BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC, anon, authenticated;

COMMIT;
 THEN
    RAISE EXCEPTION 'Transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency) INTO v_booking_currency
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR upper(NEW.currency) IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency
  BEFORE INSERT OR UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency
  BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC, anon, authenticated;

COMMIT;
);
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS ai_revenue_forecasts_property_created_idx ON public.ai_revenue_forecasts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_opportunities_property_created_idx ON public.ai_revenue_opportunities(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_alerts_property_created_idx ON public.ai_revenue_alerts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_alerts_property_created_idx ON public.financial_alerts(property_id, created_at DESC);

-- AI forecast artifacts are visible only within the active property context.
ALTER TABLE public.ai_revenue_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revenue_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_revenue_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_forecasts ON public.ai_revenue_forecasts;
CREATE POLICY staynas_property_read_ai_revenue_forecasts ON public.ai_revenue_forecasts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_forecasts ON public.ai_revenue_forecasts;
CREATE POLICY staynas_property_create_ai_revenue_forecasts ON public.ai_revenue_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_read_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_create_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_revenue_opportunities ON public.ai_revenue_opportunities;
CREATE POLICY staynas_property_update_ai_revenue_opportunities ON public.ai_revenue_opportunities
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_read_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_create_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_revenue_alerts ON public.ai_revenue_alerts;
CREATE POLICY staynas_property_update_ai_revenue_alerts ON public.ai_revenue_alerts
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

-- Restrict existing AI pricing recommendations to the active property as well.
DROP POLICY IF EXISTS "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations;
DROP POLICY IF EXISTS "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations;
CREATE POLICY "Property staff read AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));
CREATE POLICY "Property staff create AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));
CREATE POLICY "Property staff action AI pricing recommendations" ON public.ai_pricing_recommendations
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));

-- Financial alerts are property-owned, not a cross-property shared queue.
DROP POLICY IF EXISTS "Finance manage financial alerts" ON public.financial_alerts;
CREATE POLICY "Finance manage financial alerts" ON public.financial_alerts
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','finance','admin']::public.app_role[]));

GRANT SELECT, INSERT ON public.ai_revenue_forecasts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_revenue_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_revenue_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_alerts TO authenticated;

-- Property-scoped CRM spend summary. Existing spend values are not converted or rewritten.
CREATE OR REPLACE VIEW public.guest_directory WITH (security_invoker = true) AS
SELECT
  g.id, g.email, g.phone_e164, g.full_name, g.country, g.preferred_language,
  g.nationality, g.time_zone, g.communication_preference, g.avatar_url, g.status,
  g.internal_notes, g.created_at, g.updated_at,
  COALESCE(s.total_stays, 0) AS total_stays,
  COALESCE(s.total_nights, 0) AS total_nights,
  CASE WHEN COALESCE(s.spend_currency_count, 0) > 1 THEN NULL::numeric
       ELSE COALESCE(s.lifetime_spend, 0::numeric) END AS lifetime_spend,
  s.first_stay, s.last_stay, COALESCE(s.cancelled_count, 0) AS cancelled_count,
  COALESCE(t.tag_ids, ARRAY[]::uuid[]) AS tag_ids,
  s.lifetime_spend_currency,
  COALESCE(spend.lifetime_spend_by_currency, '{}'::jsonb) AS lifetime_spend_by_currency
FROM public.guests g
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE b.status <> 'cancelled'::public.booking_status)::integer AS total_stays,
    sum(b.nights) FILTER (WHERE b.status <> 'cancelled'::public.booking_status)::integer AS total_nights,
    sum(b.total) FILTER (WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])) AS lifetime_spend,
    count(DISTINCT upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) = 1 THEN min(upper(COALESCE(b.currency, 'UNKNOWN'))) FILTER (
      WHERE b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) ELSE NULL END AS lifetime_spend_currency,
    min(b.check_in) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS first_stay,
    max(b.check_in) FILTER (WHERE b.status <> 'cancelled'::public.booking_status) AS last_stay,
    count(*) FILTER (WHERE b.status = 'cancelled'::public.booking_status)::integer AS cancelled_count
  FROM public.bookings b
  WHERE b.guest_id = g.id
    AND b.property_id = public.staynas_active_property_id(auth.uid())
) s ON true
LEFT JOIN LATERAL (
  SELECT jsonb_object_agg(currency, amount) AS lifetime_spend_by_currency
  FROM (
    SELECT upper(COALESCE(b.currency, 'UNKNOWN')) AS currency, sum(b.total) AS amount
    FROM public.bookings b
    WHERE b.guest_id = g.id
      AND b.property_id = public.staynas_active_property_id(auth.uid())
      AND b.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    GROUP BY upper(COALESCE(b.currency, 'UNKNOWN'))
  ) grouped_spend
) spend ON true
LEFT JOIN LATERAL (
  SELECT array_agg(gta.tag_id) AS tag_ids
  FROM public.guest_tag_assignments gta
  WHERE gta.guest_id = g.id
) t ON true
WHERE g.is_deleted = false;

CREATE OR REPLACE VIEW public.guest_metrics WITH (security_invoker = true) AS
WITH active_property AS (
  SELECT public.staynas_active_property_id(auth.uid()) AS property_id
),
b AS (
  SELECT
    bookings.guest_id,
    count(*) FILTER (WHERE bookings.status <> 'cancelled'::public.booking_status) AS stays,
    count(*) FILTER (WHERE bookings.status = 'cancelled'::public.booking_status) AS cancelled,
    count(*) AS all_bookings,
    avg(NULLIF(bookings.nights, 0)) AS avg_nights,
    count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) <= 1
      THEN avg(NULLIF(bookings.total, 0::numeric)) ELSE NULL::numeric END AS avg_spend,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) = 1
      THEN min(upper(COALESCE(bookings.currency, 'UNKNOWN'))) ELSE NULL END AS avg_spend_currency,
    avg(GREATEST(0, bookings.check_in - bookings.created_at::date)) AS avg_lead_time_days,
    avg(COALESCE(bookings.adults, 0) + COALESCE(bookings.children, 0)) AS avg_party_size
  FROM public.bookings bookings
  CROSS JOIN active_property
  WHERE bookings.guest_id IS NOT NULL AND bookings.property_id = active_property.property_id
  GROUP BY bookings.guest_id
),
spend_by_currency AS (
  SELECT guest_id, jsonb_object_agg(currency, average_spend) AS avg_spend_by_currency
  FROM (
    SELECT bookings.guest_id, upper(COALESCE(bookings.currency, 'UNKNOWN')) AS currency,
      avg(NULLIF(bookings.total, 0::numeric)) AS average_spend
    FROM public.bookings bookings
    CROSS JOIN active_property
    WHERE bookings.guest_id IS NOT NULL AND bookings.property_id = active_property.property_id
    GROUP BY bookings.guest_id, upper(COALESCE(bookings.currency, 'UNKNOWN'))
  ) grouped
  GROUP BY guest_id
),
fav_room AS (
  SELECT DISTINCT ON (bookings.guest_id) bookings.guest_id, bookings.room_id AS favourite_room_id
  FROM public.bookings bookings
  CROSS JOIN active_property
  WHERE bookings.guest_id IS NOT NULL AND bookings.room_id IS NOT NULL
    AND bookings.status <> 'cancelled'::public.booking_status
    AND bookings.property_id = active_property.property_id
  GROUP BY bookings.guest_id, bookings.room_id
  ORDER BY bookings.guest_id, count(*) DESC, max(bookings.check_in) DESC
),
fav_exp AS (
  SELECT DISTINCT ON (bk.guest_id) bk.guest_id, e.name AS favourite_experience
  FROM public.booking_extras be
  JOIN public.bookings bk ON bk.id = be.booking_id
  JOIN public.extras e ON e.id = be.extra_id
  CROSS JOIN active_property
  WHERE bk.guest_id IS NOT NULL AND bk.property_id = active_property.property_id
  GROUP BY bk.guest_id, e.name
  ORDER BY bk.guest_id, count(*) DESC
)
SELECT
  g.id AS guest_id,
  COALESCE(b.stays, 0::bigint) AS stays,
  COALESCE(b.cancelled, 0::bigint) AS cancelled,
  CASE WHEN COALESCE(b.all_bookings, 0::bigint) > 0
    THEN round(b.cancelled::numeric / b.all_bookings::numeric * 100::numeric, 1)
    ELSE 0::numeric END AS cancellation_rate,
  round(COALESCE(b.avg_nights, 0::numeric), 1) AS avg_nights,
  CASE WHEN COALESCE(b.spend_currency_count, 0) > 1 THEN NULL::numeric
       ELSE round(COALESCE(b.avg_spend, 0::numeric), 2) END AS avg_spend,
  round(COALESCE(b.avg_lead_time_days, 0::numeric), 0) AS avg_lead_time_days,
  round(COALESCE(b.avg_party_size, 0::numeric), 1) AS avg_party_size,
  COALESCE(b.stays, 0::bigint) >= 2 AS is_repeat,
  fr.favourite_room_id, fe.favourite_experience,
  b.avg_spend_currency,
  COALESCE(spend_by_currency.avg_spend_by_currency, '{}'::jsonb) AS avg_spend_by_currency
FROM public.guests g
LEFT JOIN b ON b.guest_id = g.id
LEFT JOIN spend_by_currency ON spend_by_currency.guest_id = g.id
LEFT JOIN fav_room fr ON fr.guest_id = g.id
LEFT JOIN fav_exp fe ON fe.guest_id = g.id
WHERE g.is_deleted = false;


-- Other monetary AI outputs and generated reports also retain property/currency identity.
ALTER TABLE public.ai_guest_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_guest_alerts
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.analytics_reports
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_trend_snapshots
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;

DO $more_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_guest_recommendations'::regclass AND conname = 'ai_guest_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_guest_recommendations ADD CONSTRAINT ai_guest_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.analytics_reports'::regclass AND conname = 'analytics_reports_currency_iso3_chk') THEN
    ALTER TABLE public.analytics_reports ADD CONSTRAINT analytics_reports_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_trend_snapshots'::regclass AND conname = 'ai_trend_snapshots_currency_iso3_chk') THEN
    ALTER TABLE public.ai_trend_snapshots ADD CONSTRAINT ai_trend_snapshots_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$more_constraints$;

CREATE INDEX IF NOT EXISTS ai_guest_recommendations_property_created_idx ON public.ai_guest_recommendations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_guest_alerts_property_created_idx ON public.ai_guest_alerts(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_reports_property_created_idx ON public.analytics_reports(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_trend_snapshots_property_created_idx ON public.ai_trend_snapshots(property_id, created_at DESC);

ALTER TABLE public.ai_guest_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_guest_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trend_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staynas_property_read_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_read_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_create_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_create_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_guest_recommendations ON public.ai_guest_recommendations;
CREATE POLICY staynas_property_update_ai_guest_recommendations ON public.ai_guest_recommendations
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception','marketing','finance']::public.app_role[]));

DROP POLICY IF EXISTS staynas_property_read_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_read_ai_guest_alerts ON public.ai_guest_alerts
  FOR SELECT TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id));
DROP POLICY IF EXISTS staynas_property_create_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_create_ai_guest_alerts ON public.ai_guest_alerts
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]));
DROP POLICY IF EXISTS staynas_property_update_ai_guest_alerts ON public.ai_guest_alerts;
CREATE POLICY staynas_property_update_ai_guest_alerts ON public.ai_guest_alerts
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reception']::public.app_role[]));

DROP POLICY IF EXISTS "Managers write reports" ON public.analytics_reports;
CREATE POLICY "Managers write reports" ON public.analytics_reports
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

DROP POLICY IF EXISTS "Managers write trend_snapshots" ON public.ai_trend_snapshots;
CREATE POLICY "Managers write trend_snapshots" ON public.ai_trend_snapshots
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE ON public.ai_guest_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_guest_alerts TO authenticated;
GRANT SELECT, INSERT ON public.analytics_reports TO authenticated;
GRANT SELECT, INSERT ON public.ai_trend_snapshots TO authenticated;


-- Executive analytics recommendations inherit the source property's currency.
ALTER TABLE public.ai_analytics_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
DO $analytics_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_analytics_recommendations'::regclass AND conname = 'ai_analytics_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_analytics_recommendations ADD CONSTRAINT ai_analytics_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3});
  END IF;
END
$analytics_constraints$;
CREATE INDEX IF NOT EXISTS ai_analytics_recommendations_property_created_idx
  ON public.ai_analytics_recommendations(property_id, created_at DESC);
DROP POLICY IF EXISTS "Managers write analytics_recs" ON public.ai_analytics_recommendations;
CREATE POLICY "Managers write analytics_recs" ON public.ai_analytics_recommendations
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE ON public.ai_analytics_recommendations TO authenticated;


-- Executive and marketing intelligence artifacts are isolated by active property.
ALTER TABLE public.ai_executive_briefings
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_recommendations
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_marketing_priorities
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.ai_reputation_insights
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_strategic_risks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;

DO $executive_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_executive_briefings'::regclass AND conname = 'ai_executive_briefings_currency_iso3_chk') THEN
    ALTER TABLE public.ai_executive_briefings ADD CONSTRAINT ai_executive_briefings_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_marketing_recommendations'::regclass AND conname = 'ai_marketing_recommendations_currency_iso3_chk') THEN
    ALTER TABLE public.ai_marketing_recommendations ADD CONSTRAINT ai_marketing_recommendations_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ai_marketing_priorities'::regclass AND conname = 'ai_marketing_priorities_currency_iso3_chk') THEN
    ALTER TABLE public.ai_marketing_priorities ADD CONSTRAINT ai_marketing_priorities_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$executive_constraints$;

DROP INDEX IF EXISTS public.ai_executive_briefings_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_executive_briefings_property_date_uidx
  ON public.ai_executive_briefings(property_id, briefing_date);
CREATE INDEX IF NOT EXISTS ai_marketing_recommendations_property_created_idx
  ON public.ai_marketing_recommendations(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_marketing_priorities_property_created_idx
  ON public.ai_marketing_priorities(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_reputation_insights_property_created_idx
  ON public.ai_reputation_insights(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_strategic_risks_property_created_idx
  ON public.ai_strategic_risks(property_id, created_at DESC);

ALTER TABLE public.ai_executive_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_marketing_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reputation_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_strategic_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY staynas_property_ai_executive_briefings ON public.ai_executive_briefings
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY staynas_property_ai_marketing_recommendations ON public.ai_marketing_recommendations
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_marketing_priorities ON public.ai_marketing_priorities
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_reputation_insights ON public.ai_reputation_insights
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));

CREATE POLICY staynas_property_ai_strategic_risks ON public.ai_strategic_risks
  FOR ALL TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','finance']::public.app_role[]));

GRANT SELECT, INSERT, UPDATE ON public.ai_executive_briefings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_marketing_recommendations TO authenticated;
GRANT SELECT, INSERT ON public.ai_marketing_priorities TO authenticated;
GRANT SELECT, INSERT ON public.ai_reputation_insights TO authenticated;
GRANT SELECT ON public.ai_strategic_risks TO authenticated;


-- Campaign budgets are property operating spend. Legacy unassigned campaigns remain
-- readable with their stored currency; editing them assigns them only when currency matches.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE RESTRICT;
DO $campaign_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.campaigns'::regclass AND conname = 'campaigns_currency_iso3_chk') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_currency_iso3_chk CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;
END
$campaign_constraints$;
CREATE INDEX IF NOT EXISTS campaigns_property_updated_idx ON public.campaigns(property_id, updated_at DESC);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY staynas_campaigns_read_property_or_legacy ON public.campaigns
  FOR SELECT TO authenticated
  USING (property_id IS NULL OR (
    property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
  ));
CREATE POLICY staynas_campaigns_create_property ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY staynas_campaigns_update_property ON public.campaigns
  FOR UPDATE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]))
  WITH CHECK (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
CREATE POLICY staynas_campaigns_delete_property ON public.campaigns
  FOR DELETE TO authenticated
  USING (property_id = public.staynas_active_property_id(auth.uid())
    AND public.staynas_user_has_property_access(auth.uid(), property_id)
    AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','marketing']::public.app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;


-- Database-enforced transaction currency inheritance and historical immutability.
CREATE OR REPLACE FUNCTION public.staynas_guard_booking_transaction_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_property_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.property_id IS DISTINCT FROM NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Booking property and transaction currency are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
    SELECT upper(p.currency) INTO v_property_currency
    FROM public.staynas_properties p
    WHERE p.id = NEW.property_id AND p.status IN ('active','setup');
    IF v_property_currency IS NULL
       OR v_property_currency !~ '^[A-Z]{3}$'
       OR upper(COALESCE(NEW.currency,'')) IS DISTINCT FROM v_property_currency THEN
      RAISE EXCEPTION 'New booking currency must match the authoritative property operating currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staynas_guard_child_transaction_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_booking_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.booking_id IS DISTINCT FROM NEW.booking_id
  ) THEN
    RAISE EXCEPTION 'Historical transaction currency and booking association are immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.currency := upper(btrim(COALESCE(NEW.currency, '')));
  END IF;
  IF NEW.currency IS NULL OR upper(NEW.currency) !~ '^[A-Z]{3}
    RAISE EXCEPTION 'Transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency) INTO v_booking_currency
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR upper(NEW.currency) IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency
  BEFORE INSERT OR UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency
  BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC, anon, authenticated;

COMMIT;
 THEN
    RAISE EXCEPTION 'Transaction currency must be a valid three-letter ISO 4217 code';
  END IF;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT upper(b.currency) INTO v_booking_currency
    FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF v_booking_currency IS NULL OR upper(NEW.currency) IS DISTINCT FROM v_booking_currency THEN
      RAISE EXCEPTION 'Transaction currency must match its booking transaction currency';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staynas_guard_booking_transaction_currency ON public.bookings;
CREATE TRIGGER trg_staynas_guard_booking_transaction_currency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_booking_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_payment_event_currency ON public.payment_events;
CREATE TRIGGER trg_staynas_guard_payment_event_currency
  BEFORE INSERT OR UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_posting_currency ON public.pms_folio_postings;
CREATE TRIGGER trg_staynas_guard_folio_posting_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_postings
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_folio_adjustment_currency ON public.pms_folio_adjustments;
CREATE TRIGGER trg_staynas_guard_folio_adjustment_currency
  BEFORE INSERT OR UPDATE ON public.pms_folio_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

DROP TRIGGER IF EXISTS trg_staynas_guard_promotion_redemption_currency ON public.staynas_promotion_redemptions;
CREATE TRIGGER trg_staynas_guard_promotion_redemption_currency
  BEFORE INSERT OR UPDATE ON public.staynas_promotion_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.staynas_guard_child_transaction_currency();

REVOKE ALL ON FUNCTION public.staynas_guard_booking_transaction_currency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staynas_guard_child_transaction_currency() FROM PUBLIC, anon, authenticated;

COMMIT;
