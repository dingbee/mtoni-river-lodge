CREATE TABLE IF NOT EXISTS public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  allowed_roles public.app_role[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_categories_parent_idx ON public.knowledge_categories(parent_id);

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  source_type text NOT NULL DEFAULT 'markdown' CHECK (source_type IN ('markdown','text','pdf','docx','url','html')),
  source_url text,
  storage_path text,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  allowed_roles public.app_role[],
  current_version int NOT NULL DEFAULT 1,
  byte_size int,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_documents_category_idx ON public.knowledge_documents(category_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON public.knowledge_documents(status);

CREATE TABLE IF NOT EXISTS public.knowledge_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  version int NOT NULL,
  content_text text NOT NULL,
  byte_size int,
  checksum text,
  change_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
CREATE INDEX IF NOT EXISTS knowledge_document_versions_doc_idx ON public.knowledge_document_versions(document_id);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  version int NOT NULL,
  chunk_index int NOT NULL,
  content text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx ON public.knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_tsv_idx ON public.knowledge_chunks USING gin(tsv);

GRANT SELECT ON public.knowledge_categories TO authenticated;
GRANT ALL ON public.knowledge_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT ALL ON public.knowledge_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_document_versions TO authenticated;
GRANT ALL ON public.knowledge_document_versions TO service_role;
GRANT SELECT, INSERT, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;

ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.knowledge_can_read_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_documents d
    LEFT JOIN public.knowledge_categories c ON c.id = d.category_id
    WHERE d.id = _doc_id
      AND public.is_any_staff(auth.uid())
      AND (
        public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
        OR d.status = 'published'
      )
      AND (
        d.allowed_roles IS NULL
        OR array_length(d.allowed_roles, 1) IS NULL
        OR public.has_any_role(auth.uid(), d.allowed_roles)
        OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
      )
      AND (
        c.id IS NULL
        OR array_length(c.allowed_roles, 1) IS NULL
        OR public.has_any_role(auth.uid(), c.allowed_roles)
        OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.knowledge_can_read_document(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.knowledge_can_read_document(uuid) TO authenticated, service_role;

CREATE POLICY "kb_categories_staff_read" ON public.knowledge_categories
  FOR SELECT TO authenticated
  USING (public.is_any_staff(auth.uid()));
CREATE POLICY "kb_categories_admin_write" ON public.knowledge_categories
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "kb_documents_read" ON public.knowledge_documents
  FOR SELECT TO authenticated
  USING (
    public.is_any_staff(auth.uid())
    AND (
      public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
      OR status = 'published'
    )
    AND (
      allowed_roles IS NULL
      OR array_length(allowed_roles, 1) IS NULL
      OR public.has_any_role(auth.uid(), allowed_roles)
      OR public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
    )
  );
CREATE POLICY "kb_documents_admin_write" ON public.knowledge_documents
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "kb_versions_read" ON public.knowledge_document_versions
  FOR SELECT TO authenticated
  USING (public.knowledge_can_read_document(document_id));
CREATE POLICY "kb_versions_admin_write" ON public.knowledge_document_versions
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE POLICY "kb_chunks_read" ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING (public.knowledge_can_read_document(document_id));
CREATE POLICY "kb_chunks_admin_write" ON public.knowledge_chunks
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.knowledge_search(_query text, _limit int DEFAULT 6)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_slug text,
  category_slug text,
  chunk_index int,
  content text,
  rank real
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    k.id AS chunk_id,
    k.document_id,
    d.title AS document_title,
    d.slug AS document_slug,
    c.slug AS category_slug,
    k.chunk_index,
    k.content,
    ts_rank(k.tsv, plainto_tsquery('english', _query)) AS rank
  FROM public.knowledge_chunks k
  JOIN public.knowledge_documents d ON d.id = k.document_id
  LEFT JOIN public.knowledge_categories c ON c.id = d.category_id
  WHERE k.tsv @@ plainto_tsquery('english', _query)
    AND k.version = d.current_version
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 6), 1), 20);
$$;
REVOKE EXECUTE ON FUNCTION public.knowledge_search(text, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.knowledge_search(text, int) TO authenticated, service_role;

CREATE TRIGGER kb_categories_touch BEFORE UPDATE ON public.knowledge_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER kb_documents_touch BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.knowledge_categories (slug, name, description, sort_order) VALUES
  ('operations','Operations','Front desk, check-in, check-out and daily SOPs',10),
  ('hospitality','Hospitality','Welcome standards, VIP handling and guest recovery',20),
  ('experiences','Experiences','Activities, pricing, and transport information',30),
  ('property','Property','Rooms, facilities, and property policies',40),
  ('brand','Brand','Tone of voice and marketing guidelines',50)
ON CONFLICT (slug) DO NOTHING;