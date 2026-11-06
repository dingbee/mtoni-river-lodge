ALTER TABLE public.journal_articles ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.journal_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.journal_articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_article_versions TO authenticated;
GRANT ALL ON public.journal_article_versions TO service_role;

ALTER TABLE public.journal_article_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_article_versions staff all"
  ON public.journal_article_versions
  FOR ALL
  TO authenticated
  USING (public.is_any_staff(auth.uid()))
  WITH CHECK (public.is_any_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_journal_article_versions_article_id ON public.journal_article_versions(article_id, version DESC);