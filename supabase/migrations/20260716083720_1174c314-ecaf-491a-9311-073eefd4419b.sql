-- Journal DB tables for Sprint 5 Phase 2

CREATE TABLE IF NOT EXISTS public.journal_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  bio text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content_html text,
  content_json jsonb,
  cover_image_url text,
  read_minutes integer,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','archived')),
  author_id uuid REFERENCES public.journal_authors(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.journal_categories(id) ON DELETE SET NULL,
  seo_title text,
  seo_description text,
  seo_og_image text,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_article_tags (
  article_id uuid NOT NULL REFERENCES public.journal_articles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.journal_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_authors TO authenticated;
GRANT SELECT ON public.journal_authors TO anon;
GRANT ALL ON public.journal_authors TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_categories TO authenticated;
GRANT SELECT ON public.journal_categories TO anon;
GRANT ALL ON public.journal_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_tags TO authenticated;
GRANT SELECT ON public.journal_tags TO anon;
GRANT ALL ON public.journal_tags TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_articles TO authenticated;
GRANT SELECT ON public.journal_articles TO anon;
GRANT ALL ON public.journal_articles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_article_tags TO authenticated;
GRANT SELECT ON public.journal_article_tags TO anon;
GRANT ALL ON public.journal_article_tags TO service_role;

ALTER TABLE public.journal_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_article_tags ENABLE ROW LEVEL SECURITY;

-- Public can read all authors/categories/tags (used by published articles)
CREATE POLICY "journal_authors public read" ON public.journal_authors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "journal_authors staff write" ON public.journal_authors FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE POLICY "journal_categories public read" ON public.journal_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "journal_categories staff write" ON public.journal_categories FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE POLICY "journal_tags public read" ON public.journal_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "journal_tags staff write" ON public.journal_tags FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

-- Anon sees only published articles; staff sees everything
CREATE POLICY "journal_articles public read published" ON public.journal_articles FOR SELECT TO anon
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());
CREATE POLICY "journal_articles authenticated read" ON public.journal_articles FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()) OR (status = 'published' AND published_at IS NOT NULL AND published_at <= now()));
CREATE POLICY "journal_articles staff write" ON public.journal_articles FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE POLICY "journal_article_tags public read" ON public.journal_article_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "journal_article_tags staff write" ON public.journal_article_tags FOR ALL TO authenticated
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

CREATE TRIGGER trg_journal_authors_updated BEFORE UPDATE ON public.journal_authors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_journal_categories_updated BEFORE UPDATE ON public.journal_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_journal_articles_updated BEFORE UPDATE ON public.journal_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_journal_articles_status ON public.journal_articles(status);
CREATE INDEX IF NOT EXISTS idx_journal_articles_published_at ON public.journal_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_articles_slug ON public.journal_articles(slug);