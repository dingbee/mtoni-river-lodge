
-- Review categories enum
CREATE TYPE public.review_category AS ENUM (
  'hospitality_service',
  'tranquility_nature',
  'safari_gateway',
  'rooms_comfort',
  'dining',
  'pool_family',
  'overall_experience'
);

CREATE TYPE public.review_source AS ENUM ('google', 'tripadvisor', 'direct');
CREATE TYPE public.review_status AS ENUM ('pending', 'approved', 'archived');

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.review_source NOT NULL,
  guest_name text NOT NULL,
  guest_location text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  review_text text NOT NULL,
  review_date date NOT NULL,
  categories public.review_category[] NOT NULL DEFAULT '{}',
  status public.review_status NOT NULL DEFAULT 'pending',
  featured boolean NOT NULL DEFAULT false,
  external_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_status ON public.reviews(status);
CREATE INDEX idx_reviews_source ON public.reviews(source);
CREATE INDEX idx_reviews_featured ON public.reviews(featured) WHERE featured = true;
CREATE INDEX idx_reviews_categories ON public.reviews USING gin(categories);
CREATE INDEX idx_reviews_review_date ON public.reviews(review_date DESC);

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Public can read only approved reviews
CREATE POLICY "Public can view approved reviews"
  ON public.reviews FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Staff can do anything
CREATE POLICY "Staff can manage all reviews"
  ON public.reviews FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Aggregate function: returns per-source rating averages and counts (approved only)
CREATE OR REPLACE FUNCTION public.get_review_aggregates()
RETURNS TABLE(source public.review_source, average_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.source,
         ROUND(AVG(r.rating)::numeric, 2) AS average_rating,
         COUNT(*)::bigint AS review_count
  FROM public.reviews r
  WHERE r.status = 'approved'
  GROUP BY r.source;
$$;

GRANT EXECUTE ON FUNCTION public.get_review_aggregates() TO anon, authenticated;

-- Seed a handful of starter reviews so the UI has content
INSERT INTO public.reviews (source, guest_name, guest_location, rating, title, review_text, review_date, categories, status, featured) VALUES
('google', 'Sarah M.', 'United Kingdom', 5, 'A truly magical stay', 'From the moment we arrived, the warmth of the staff and the peaceful sound of the river made us feel completely at ease. The riverfront room was beautifully designed and immaculate.', '2026-04-12', ARRAY['hospitality_service','rooms_comfort']::public.review_category[], 'approved', true),
('tripadvisor', 'Marco R.', 'Italy', 5, 'Perfect base before safari', 'We stayed two nights before flying to the Serengeti and could not have asked for a better start. Calm, green, beautifully done.', '2026-03-28', ARRAY['safari_gateway','tranquility_nature']::public.review_category[], 'approved', true),
('google', 'Aisha & James', 'Kenya', 5, 'Pure tranquility', 'The river, the birds, the way the light moves through the trees — Mtoni is a quiet kind of luxury that stays with you.', '2026-02-15', ARRAY['tranquility_nature','overall_experience']::public.review_category[], 'approved', true),
('tripadvisor', 'The Hendersons', 'United States', 5, 'Family heaven', 'Our kids loved the pool and the staff went above and beyond to make them feel at home. Dining was a daily highlight.', '2026-01-22', ARRAY['pool_family','dining','hospitality_service']::public.review_category[], 'approved', true),
('google', 'Elena P.', 'Spain', 5, 'Beautiful rooms, beautiful people', 'Our Riverfront Deluxe was stunning. Copper shower, deep bathtub, and the sound of the river through the night.', '2025-12-08', ARRAY['rooms_comfort','hospitality_service']::public.review_category[], 'approved', true),
('tripadvisor', 'David K.', 'South Africa', 5, 'Chef Amina is a treasure', 'Every meal was thoughtful, local, and beautifully presented. The orchard dinner was unforgettable.', '2025-11-30', ARRAY['dining','overall_experience']::public.review_category[], 'approved', true),
('google', 'Priya S.', 'India', 5, 'Worth every shilling', 'The most peaceful three nights of our trip. Will be back.', '2025-11-14', ARRAY['overall_experience','tranquility_nature']::public.review_category[], 'approved', false),
('tripadvisor', 'Lukas B.', 'Germany', 4, 'Lovely lodge, great gateway', 'Excellent location to recover after Kilimanjaro and prepare for safari. Rooms quiet and well-kept.', '2025-10-19', ARRAY['safari_gateway','rooms_comfort']::public.review_category[], 'approved', false);
