-- SN-IQ-02: property-scoped knowledge catalogue and retrieval contracts.
-- This migration is code-reviewed only until the deferred SN-IQ-01 database
-- isolation verification is available. It intentionally does not backfill
-- historical global records into any property.

-- ---------------------------------------------------------------------------
-- 1. Tenant ownership, language, approval and freshness metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.knowledge_categories
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz;

ALTER TABLE public.knowledge_document_versions
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS simple_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

ALTER TABLE public.ai_knowledge_sources
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS is_guest_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS simple_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple',
      coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '')
    )) STORED;

ALTER TABLE public.ai_knowledge_search_log
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.ai_knowledge_sync_runs
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

ALTER TABLE public.ai_knowledge_notifications
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

-- Historical rows intentionally remain NULL until a verified owner/property
-- association is available. New records must be property-bound by the API.
DO $sn_iq_02$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_categories_property_required' AND conrelid = 'public.knowledge_categories'::regclass) THEN
    ALTER TABLE public.knowledge_categories ADD CONSTRAINT knowledge_categories_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_documents_property_required' AND conrelid = 'public.knowledge_documents'::regclass) THEN
    ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_knowledge_sources_property_required' AND conrelid = 'public.ai_knowledge_sources'::regclass) THEN
    ALTER TABLE public.ai_knowledge_sources ADD CONSTRAINT ai_knowledge_sources_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
END
$sn_iq_02$;

-- Replace global slug/source uniqueness with tenant-local uniqueness.
ALTER TABLE public.knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_slug_key;
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_slug_key;
ALTER TABLE public.ai_knowledge_sources DROP CONSTRAINT IF EXISTS ai_knowledge_sources_source_type_external_ref_key;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_categories_property_slug_uidx
  ON public.knowledge_categories(property_id, slug) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_property_slug_uidx
  ON public.knowledge_documents(property_id, slug) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_sources_property_source_ref_uidx
  ON public.ai_knowledge_sources(property_id, source_type, external_ref)
  WHERE property_id IS NOT NULL AND external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS knowledge_documents_property_status_idx
  ON public.knowledge_documents(property_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_categories_property_idx
  ON public.knowledge_categories(property_id, sort_order);
CREATE INDEX IF NOT EXISTS knowledge_versions_property_doc_idx
  ON public.knowledge_document_versions(property_id, document_id, version DESC);
CREATE INDEX IF NOT EXISTS knowledge_chunks_property_doc_idx
  ON public.knowledge_chunks(property_id, document_id, version);
CREATE INDEX IF NOT EXISTS knowledge_chunks_simple_tsv_idx
  ON public.knowledge_chunks USING gin(simple_tsv);
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_property_status_idx
  ON public.ai_knowledge_sources(property_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_simple_tsv_idx
  ON public.ai_knowledge_sources USING gin(simple_tsv);
CREATE INDEX IF NOT EXISTS ai_knowledge_search_log_property_created_idx
  ON public.ai_knowledge_search_log(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_knowledge_sync_runs_property_started_idx
  ON public.ai_knowledge_sync_runs(property_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ai_knowledge_notifications_property_status_idx
  ON public.ai_knowledge_notifications(property_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS: every tenant catalogue and intelligence record follows active scope.
-- Requires the SN-IQ-01 staynas_ai_property_in_active_context helper.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "kb_categories_staff_read" ON public.knowledge_categories;
DROP POLICY IF EXISTS "kb_categories_admin_write" ON public.knowledge_categories;
CREATE POLICY "Knowledge categories read in active property"
  ON public.knowledge_categories FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Knowledge categories manage in active property"
  ON public.knowledge_categories FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ))
  WITH CHECK (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ));

DROP POLICY IF EXISTS "kb_documents_read" ON public.knowledge_documents;
DROP POLICY IF EXISTS "kb_documents_admin_write" ON public.knowledge_documents;
CREATE POLICY "Knowledge documents read in active property"
  ON public.knowledge_documents FOR SELECT TO authenticated
  USING (
    property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
    )
    AND (
      public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[])
      OR status = 'published'
    )
  );
CREATE POLICY "Knowledge documents manage in active property"
  ON public.knowledge_documents FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ))
  WITH CHECK (
    property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin']::public.app_role[]
    )
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_categories category
      WHERE category.id = category_id AND category.property_id = property_id
    ))
  );

DROP POLICY IF EXISTS "kb_versions_read" ON public.knowledge_document_versions;
DROP POLICY IF EXISTS "kb_versions_admin_write" ON public.knowledge_document_versions;
CREATE POLICY "Knowledge versions read in active property"
  ON public.knowledge_document_versions FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Knowledge versions manage in active property"
  ON public.knowledge_document_versions FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ))
  WITH CHECK (
    property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin']::public.app_role[]
    )
    AND EXISTS (
      SELECT 1 FROM public.knowledge_documents document
      WHERE document.id = document_id AND document.property_id = property_id
    )
  );

DROP POLICY IF EXISTS "kb_chunks_read" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_admin_write" ON public.knowledge_chunks;
CREATE POLICY "Knowledge chunks read in active property"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Knowledge chunks manage in active property"
  ON public.knowledge_chunks FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ))
  WITH CHECK (
    property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin']::public.app_role[]
    )
    AND EXISTS (
      SELECT 1 FROM public.knowledge_documents document
      WHERE document.id = document_id AND document.property_id = property_id
    )
  );

DROP POLICY IF EXISTS "Staff can read approved sources" ON public.ai_knowledge_sources;
DROP POLICY IF EXISTS "Approvers can insert sources" ON public.ai_knowledge_sources;
DROP POLICY IF EXISTS "Approvers can update sources" ON public.ai_knowledge_sources;
DROP POLICY IF EXISTS "Owners can delete sources" ON public.ai_knowledge_sources;
CREATE POLICY "AI knowledge sources read in active property"
  ON public.ai_knowledge_sources FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "AI knowledge sources insert in active property"
  ON public.ai_knowledge_sources FOR INSERT TO authenticated
  WITH CHECK (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]
  ));
CREATE POLICY "AI knowledge sources update in active property"
  ON public.ai_knowledge_sources FOR UPDATE TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]
  ))
  WITH CHECK (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception']::public.app_role[]
  ));
CREATE POLICY "AI knowledge sources delete in active property"
  ON public.ai_knowledge_sources FOR DELETE TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ));

DROP POLICY IF EXISTS "Staff can read search log" ON public.ai_knowledge_search_log;
DROP POLICY IF EXISTS "Staff can log searches" ON public.ai_knowledge_search_log;
CREATE POLICY "Knowledge search logs read in active property"
  ON public.ai_knowledge_search_log FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Knowledge search logs insert in active property"
  ON public.ai_knowledge_search_log FOR INSERT TO authenticated
  WITH CHECK (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));

DROP POLICY IF EXISTS "staff read sync runs" ON public.ai_knowledge_sync_runs;
CREATE POLICY "Knowledge sync runs read in active property"
  ON public.ai_knowledge_sync_runs FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));

DROP POLICY IF EXISTS "staff read notifications" ON public.ai_knowledge_notifications;
DROP POLICY IF EXISTS "managers manage notifications" ON public.ai_knowledge_notifications;
CREATE POLICY "Knowledge notifications read in active property"
  ON public.ai_knowledge_notifications FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
  ));
CREATE POLICY "Knowledge notifications manage in active property"
  ON public.ai_knowledge_notifications FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ))
  WITH CHECK (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ));

-- Scheduler configuration is platform-level infrastructure. It remains under
-- Nolmark founder administration, never tenant-visible or tenant-editable.
DROP POLICY IF EXISTS "staff read scheduler config" ON public.ai_knowledge_scheduler_config;
DROP POLICY IF EXISTS "managers manage scheduler config" ON public.ai_knowledge_scheduler_config;
CREATE POLICY "Founder manages global knowledge scheduler"
  ON public.ai_knowledge_scheduler_config FOR ALL TO authenticated
  USING (public.is_staynas_founder_ai_admin())
  WITH CHECK (public.is_staynas_founder_ai_admin());

-- ---------------------------------------------------------------------------
-- 3. Explicit property-scoped search contracts. Legacy global RPCs are
-- revoked so callers must migrate to a property-bound contract.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staynas_knowledge_search(
  _property_id uuid,
  _query text,
  _limit integer DEFAULT 6,
  _guest_visible_only boolean DEFAULT false
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_slug text,
  category_slug text,
  chunk_index integer,
  content text,
  language_code text,
  source_updated_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    chunk.id,
    document.id,
    document.title,
    document.slug,
    category.slug,
    chunk.chunk_index,
    chunk.content,
    document.language_code,
    document.source_updated_at,
    (
      ts_rank(chunk.tsv, plainto_tsquery('english', _query))
      + ts_rank(chunk.simple_tsv, plainto_tsquery('simple', _query))
    )::real AS rank
  FROM public.knowledge_chunks chunk
  JOIN public.knowledge_documents document
    ON document.id = chunk.document_id
   AND document.property_id = chunk.property_id
  LEFT JOIN public.knowledge_categories category
    ON category.id = document.category_id
   AND category.property_id = document.property_id
  WHERE _query IS NOT NULL
    AND length(trim(_query)) > 0
    AND document.property_id = _property_id
    AND chunk.property_id = _property_id
    AND chunk.version = document.current_version
    AND document.status = 'published'
    AND (NOT _guest_visible_only OR document.is_guest_visible = true)
    AND public.staynas_ai_property_in_active_context(
      _property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
    )
    AND (
      chunk.tsv @@ plainto_tsquery('english', _query)
      OR chunk.simple_tsv @@ plainto_tsquery('simple', _query)
    )
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 6), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.staynas_ai_knowledge_search(
  _property_id uuid,
  _query text,
  _limit integer DEFAULT 8,
  _guest_visible_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  source_type text,
  title text,
  url text,
  summary text,
  content text,
  language_code text,
  source_updated_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    source.id,
    source.source_type,
    source.title,
    source.url,
    source.summary,
    source.content,
    source.language_code,
    source.source_updated_at,
    (
      ts_rank(source.content_tsv, plainto_tsquery('english', _query))
      + ts_rank(source.simple_tsv, plainto_tsquery('simple', _query))
    )::real AS rank
  FROM public.ai_knowledge_sources source
  WHERE _query IS NOT NULL
    AND length(trim(_query)) > 0
    AND source.property_id = _property_id
    AND source.status = 'approved'
    AND (NOT _guest_visible_only OR source.is_guest_visible = true)
    AND public.staynas_ai_property_in_active_context(
      _property_id, ARRAY['owner','manager','admin','reservations','reception','marketing']::public.app_role[]
    )
    AND (
      source.content_tsv @@ plainto_tsquery('english', _query)
      OR source.simple_tsv @@ plainto_tsquery('simple', _query)
    )
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 8), 1), 20);
$$;

REVOKE EXECUTE ON FUNCTION public.knowledge_search(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ai_knowledge_sources_search(text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.staynas_knowledge_search(uuid, text, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staynas_ai_knowledge_search(uuid, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_knowledge_search(uuid, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_ai_knowledge_search(uuid, text, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.staynas_knowledge_search(uuid, text, integer, boolean) IS
  'Property-scoped bilingual knowledge search. Guest retrieval remains disabled until database isolation verification.';
COMMENT ON FUNCTION public.staynas_ai_knowledge_search(uuid, text, integer, boolean) IS
  'Property-scoped bilingual source search. Guest retrieval remains disabled until database isolation verification.';
