-- Phase 1 Performance: rewrite hot aggregate function + add composite index

-- 1) get_review_aggregates: read from precomputed review_statistics instead of scanning reviews on every call.
CREATE OR REPLACE FUNCTION public.get_review_aggregates()
RETURNS TABLE(source review_source, average_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT rs.source,
         ROUND(rs.overall_rating::numeric, 2) AS average_rating,
         rs.total_reviews::bigint AS review_count
  FROM public.review_statistics rs
$$;

-- 2) Composite index matching the hot public reviews query (status filter, featured DESC, review_date DESC).
CREATE INDEX IF NOT EXISTS idx_reviews_status_featured_date
  ON public.reviews (status, featured DESC, review_date DESC);
