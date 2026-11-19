-- Property-scoped CRM spend views. Historical booking totals remain in their original currencies.
BEGIN;

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
    AND gta.property_id = public.staynas_active_property_id(auth.uid())
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
    count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) FILTER (
      WHERE bookings.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) AS spend_currency_count,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) FILTER (
      WHERE bookings.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) <= 1 THEN avg(NULLIF(bookings.total, 0::numeric)) FILTER (
      WHERE bookings.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) ELSE NULL::numeric END AS avg_spend,
    CASE WHEN count(DISTINCT upper(COALESCE(bookings.currency, 'UNKNOWN'))) FILTER (
      WHERE bookings.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) = 1 THEN min(upper(COALESCE(bookings.currency, 'UNKNOWN'))) FILTER (
      WHERE bookings.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
    ) ELSE NULL END AS avg_spend_currency,
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
    WHERE bookings.guest_id IS NOT NULL
      AND bookings.property_id = active_property.property_id
      AND bookings.payment_status = ANY (ARRAY['paid'::public.payment_status, 'deposit_paid'::public.payment_status])
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

COMMIT;
