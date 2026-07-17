
CREATE TABLE public.ai_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('document','website_page','journal_article','experience','room','policy','other')),
  external_ref TEXT,
  title TEXT NOT NULL,
  url TEXT,
  summary TEXT,
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','approved','archived','failed')),
  last_synced_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  content_tsv TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, external_ref)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_sources TO authenticated;
GRANT ALL ON public.ai_knowledge_sources TO service_role;

ALTER TABLE public.ai_knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read approved sources"
  ON public.ai_knowledge_sources FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));

CREATE POLICY "Approvers can insert sources"
  ON public.ai_knowledge_sources FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]));

CREATE POLICY "Approvers can update sources"
  ON public.ai_knowledge_sources FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]));

CREATE POLICY "Owners can delete sources"
  ON public.ai_knowledge_sources FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE INDEX ai_knowledge_sources_type_status_idx ON public.ai_knowledge_sources (source_type, status);
CREATE INDEX ai_knowledge_sources_tsv_idx ON public.ai_knowledge_sources USING gin (content_tsv);

CREATE OR REPLACE FUNCTION public.ai_knowledge_sources_tsv_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.summary,'') || ' ' || coalesce(NEW.content,''));
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER ai_knowledge_sources_tsv_biu
BEFORE INSERT OR UPDATE ON public.ai_knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.ai_knowledge_sources_tsv_trigger();

-- Search log
CREATE TABLE public.ai_knowledge_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  result_count INT NOT NULL DEFAULT 0,
  matched_source_ids UUID[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(4,3),
  asked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_knowledge_search_log TO authenticated;
GRANT ALL ON public.ai_knowledge_search_log TO service_role;
ALTER TABLE public.ai_knowledge_search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read search log"
  ON public.ai_knowledge_search_log FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "Staff can log searches"
  ON public.ai_knowledge_search_log FOR INSERT TO authenticated
  WITH CHECK (public.is_any_staff(auth.uid()));

-- Search RPC
CREATE OR REPLACE FUNCTION public.ai_knowledge_sources_search(_query TEXT, _limit INT DEFAULT 8)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  title TEXT,
  url TEXT,
  summary TEXT,
  content TEXT,
  rank REAL
) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.id, s.source_type, s.title, s.url, s.summary, s.content,
         ts_rank(s.content_tsv, plainto_tsquery('english', _query)) AS rank
  FROM public.ai_knowledge_sources s
  WHERE s.status = 'approved'
    AND s.content_tsv @@ plainto_tsquery('english', _query)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 8), 1), 20);
$$;
