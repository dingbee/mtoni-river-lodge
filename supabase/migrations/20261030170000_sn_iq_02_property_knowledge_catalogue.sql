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
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz,
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_versions_property_required' AND conrelid = 'public.knowledge_document_versions'::regclass) THEN
    ALTER TABLE public.knowledge_document_versions ADD CONSTRAINT knowledge_versions_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_chunks_property_required' AND conrelid = 'public.knowledge_chunks'::regclass) THEN
    ALTER TABLE public.knowledge_chunks ADD CONSTRAINT knowledge_chunks_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_knowledge_search_log_property_required' AND conrelid = 'public.ai_knowledge_search_log'::regclass) THEN
    ALTER TABLE public.ai_knowledge_search_log ADD CONSTRAINT ai_knowledge_search_log_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_knowledge_sync_runs_property_required' AND conrelid = 'public.ai_knowledge_sync_runs'::regclass) THEN
    ALTER TABLE public.ai_knowledge_sync_runs ADD CONSTRAINT ai_knowledge_sync_runs_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_knowledge_notifications_property_required' AND conrelid = 'public.ai_knowledge_notifications'::regclass) THEN
    ALTER TABLE public.ai_knowledge_notifications ADD CONSTRAINT ai_knowledge_notifications_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
END
$sn_iq_02$;

-- Replace global slug/source uniqueness with tenant-local uniqueness.
ALTER TABLE public.knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_slug_key;
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_slug_key;
ALTER TABLE public.ai_knowledge_sources DROP CONSTRAINT IF EXISTS ai_knowledge_sources_source_type_external_ref_key;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_categories_property_slug_uidx
  ON public.knowledge_categories(property_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_property_slug_uidx
  ON public.knowledge_documents(property_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_sources_property_source_ref_uidx
  ON public.ai_knowledge_sources(property_id, source_type, external_ref);

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
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_guest_review_idx
  ON public.ai_knowledge_sources(property_id, review_due_at)
  WHERE is_guest_visible = true;
CREATE INDEX IF NOT EXISTS ai_knowledge_search_log_property_created_idx
  ON public.ai_knowledge_search_log(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_knowledge_sync_runs_property_started_idx
  ON public.ai_knowledge_sync_runs(property_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ai_knowledge_notifications_property_status_idx
  ON public.ai_knowledge_notifications(property_id, status, created_at DESC);

-- Seed neutral catalogue categories independently for every active property.
INSERT INTO public.knowledge_categories (property_id, slug, name, description, sort_order)
SELECT property.id, category.slug, category.name, category.description, category.sort_order
FROM public.staynas_properties property
CROSS JOIN (VALUES
  ('property', 'Property', 'Property overview and guest information', 10),
  ('rooms', 'Rooms', 'Room types, occupancy and configured rates', 20),
  ('facilities', 'Facilities', 'Facilities, amenities and accessibility', 30),
  ('dining', 'Dining', 'Restaurants, menus and dining arrangements', 40),
  ('policies', 'Policies', 'Guest policies, terms and service rules', 50),
  ('experiences', 'Experiences', 'Activities, excursions and experiences', 60),
  ('guest-services', 'Guest Services', 'Transfers, concierge and guest services', 70)
) AS category(slug, name, description, sort_order)
WHERE property.status = 'active'
ON CONFLICT (property_id, slug) DO NOTHING;

-- Table privileges are separate from RLS policies. The original catalogue
-- migration granted SELECT-only on categories and scheduler configuration;
-- grant the minimum DML required by their new property-scoped manager flows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_categories TO authenticated;
GRANT UPDATE ON public.ai_knowledge_scheduler_config TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. RLS: every tenant catalogue and intelligence record follows active scope.
-- Requires the SN-IQ-01 staynas_ai_property_in_active_context helper.
-- ---------------------------------------------------------------------------
-- Document-level role and publication check shared by documents, versions,
-- chunks and retrieval. SECURITY DEFINER avoids recursive RLS evaluation;
-- every authorization predicate is re-applied explicitly here.
CREATE OR REPLACE FUNCTION public.staynas_knowledge_document_readable(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $sn_iq_02$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_documents document
    LEFT JOIN public.knowledge_categories category
      ON category.id = document.category_id
     AND category.property_id = document.property_id
    WHERE document.id = _document_id
      AND document.property_id IS NOT NULL
      AND public.staynas_ai_property_in_active_context(
        document.property_id,
        ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
      )
      AND (
        public.staynas_ai_property_in_active_context(
          document.property_id, ARRAY['owner','manager','admin']::public.app_role[]
        )
        OR document.status = 'published'
      )
      AND (
        document.allowed_roles IS NULL
        OR cardinality(document.allowed_roles) = 0
        OR public.staynas_ai_property_in_active_context(document.property_id, document.allowed_roles)
        OR public.staynas_ai_property_in_active_context(
          document.property_id, ARRAY['owner','manager','admin']::public.app_role[]
        )
      )
      AND (
        category.id IS NULL
        OR cardinality(category.allowed_roles) = 0
        OR public.staynas_ai_property_in_active_context(document.property_id, category.allowed_roles)
        OR public.staynas_ai_property_in_active_context(
          document.property_id, ARRAY['owner','manager','admin']::public.app_role[]
        )
      )
  );
$sn_iq_02$;
REVOKE ALL ON FUNCTION public.staynas_knowledge_document_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_knowledge_document_readable(uuid) TO authenticated;

DROP POLICY IF EXISTS "kb_categories_staff_read" ON public.knowledge_categories;
DROP POLICY IF EXISTS "kb_categories_admin_write" ON public.knowledge_categories;
CREATE POLICY "Knowledge categories read in active property"
  ON public.knowledge_categories FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
  ));
CREATE POLICY "Knowledge categories manage in active property"
  ON public.knowledge_categories FOR ALL TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ))
  WITH CHECK (
    property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin']::public.app_role[]
    )
    AND (parent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_categories parent
      WHERE parent.id = public.knowledge_categories.parent_id
        AND parent.property_id = public.knowledge_categories.property_id
    ))
  );

DROP POLICY IF EXISTS "kb_documents_read" ON public.knowledge_documents;
DROP POLICY IF EXISTS "kb_documents_admin_write" ON public.knowledge_documents;
CREATE POLICY "Knowledge documents read in active property"
  ON public.knowledge_documents FOR SELECT TO authenticated
  USING (public.staynas_knowledge_document_readable(id));
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
      WHERE category.id = public.knowledge_documents.category_id AND category.property_id = public.knowledge_documents.property_id
    ))
  );

DROP POLICY IF EXISTS "kb_versions_read" ON public.knowledge_document_versions;
DROP POLICY IF EXISTS "kb_versions_admin_write" ON public.knowledge_document_versions;
CREATE POLICY "Knowledge versions read in active property"
  ON public.knowledge_document_versions FOR SELECT TO authenticated
  USING (public.staynas_knowledge_document_readable(document_id));
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
      WHERE document.id = public.knowledge_document_versions.document_id AND document.property_id = public.knowledge_document_versions.property_id
    )
  );

DROP POLICY IF EXISTS "kb_chunks_read" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_admin_write" ON public.knowledge_chunks;
CREATE POLICY "Knowledge chunks read in active property"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (public.staynas_knowledge_document_readable(document_id));
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
      WHERE document.id = public.knowledge_chunks.document_id AND document.property_id = public.knowledge_chunks.property_id
    )
  );

DROP POLICY IF EXISTS "Staff can read approved sources" ON public.ai_knowledge_sources;
DROP POLICY IF EXISTS "Approvers can insert sources" ON public.ai_knowledge_sources;
DROP POLICY IF EXISTS "Approvers can update sources" ON public.ai_knowledge_sources;
DROP POLICY IF EXISTS "Owners can delete sources" ON public.ai_knowledge_sources;
CREATE POLICY "AI knowledge sources read in active property"
  ON public.ai_knowledge_sources FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
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
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
  ));
CREATE POLICY "Knowledge search logs insert in active property"
  ON public.ai_knowledge_search_log FOR INSERT TO authenticated
  WITH CHECK (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
  ));

DROP POLICY IF EXISTS "staff read sync runs" ON public.ai_knowledge_sync_runs;
CREATE POLICY "Knowledge sync runs read in active property"
  ON public.ai_knowledge_sync_runs FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
  ));

DROP POLICY IF EXISTS "staff read notifications" ON public.ai_knowledge_notifications;
DROP POLICY IF EXISTS "managers manage notifications" ON public.ai_knowledge_notifications;
CREATE POLICY "Knowledge notifications read in active property"
  ON public.ai_knowledge_notifications FOR SELECT TO authenticated
  USING (property_id IS NOT NULL AND public.staynas_ai_property_in_active_context(
    property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
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
    AND (
      NOT _guest_visible_only
      OR (document.is_guest_visible = true AND document.review_due_at IS NOT NULL AND document.review_due_at >= now())
    )
    AND public.staynas_ai_property_in_active_context(
      _property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
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
    AND (
      NOT _guest_visible_only
      OR (source.is_guest_visible = true AND source.review_due_at IS NOT NULL AND source.review_due_at >= now())
    )
    AND public.staynas_ai_property_in_active_context(
      _property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
    )
    AND (
      source.content_tsv @@ plainto_tsquery('english', _query)
      OR source.simple_tsv @@ plainto_tsquery('simple', _query)
    )
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 8), 1), 20);
$$;


-- Canonical unified retrieval across manually curated documents and
-- property-synchronised sources. One contract supplies grounded citations.
CREATE OR REPLACE FUNCTION public.staynas_property_knowledge_search(
  _property_id uuid,
  _query text,
  _limit integer DEFAULT 8,
  _guest_visible_only boolean DEFAULT false
)
RETURNS TABLE (
  source_id uuid,
  source_kind text,
  source_type text,
  title text,
  slug text,
  category_slug text,
  chunk_index integer,
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
AS $sn_iq_02$
  WITH document_hits AS (
    SELECT
      document.id AS source_id,
      'document'::text AS source_kind,
      document.source_type,
      document.title,
      document.slug,
      category.slug AS category_slug,
      chunk.chunk_index,
      document.source_url AS url,
      document.summary,
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
    WHERE document.property_id = _property_id
      AND chunk.property_id = _property_id
      AND chunk.version = document.current_version
      AND document.status = 'published'
      AND (
      NOT _guest_visible_only
      OR (document.is_guest_visible = true AND document.review_due_at IS NOT NULL AND document.review_due_at >= now())
    )
      AND (document.review_due_at IS NULL OR document.review_due_at >= now())
      AND public.staynas_knowledge_document_readable(document.id)
      AND (
        chunk.tsv @@ plainto_tsquery('english', _query)
        OR chunk.simple_tsv @@ plainto_tsquery('simple', _query)
      )
  ),
  source_hits AS (
    SELECT
      source.id AS source_id,
      'synced_source'::text AS source_kind,
      source.source_type,
      source.title,
      coalesce(source.metadata->>'slug', source.external_ref) AS slug,
      NULL::text AS category_slug,
      NULL::integer AS chunk_index,
      source.url,
      source.summary,
      left(source.content, 4000) AS content,
      source.language_code,
      source.source_updated_at,
      (
        ts_rank(source.content_tsv, plainto_tsquery('english', _query))
        + ts_rank(source.simple_tsv, plainto_tsquery('simple', _query))
      )::real AS rank
    FROM public.ai_knowledge_sources source
    WHERE source.property_id = _property_id
      AND source.status = 'approved'
      AND (
      NOT _guest_visible_only
      OR (source.is_guest_visible = true AND source.review_due_at IS NOT NULL AND source.review_due_at >= now())
    )
      AND (source.review_due_at IS NULL OR source.review_due_at >= now())
      AND public.staynas_ai_property_in_active_context(
        _property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
      )
      AND (
        source.content_tsv @@ plainto_tsquery('english', _query)
        OR source.simple_tsv @@ plainto_tsquery('simple', _query)
      )
  )
  SELECT * FROM (
    SELECT * FROM document_hits
    UNION ALL
    SELECT * FROM source_hits
  ) matches
  WHERE _query IS NOT NULL AND length(trim(_query)) > 0
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 8), 1), 20);
$sn_iq_02$;

REVOKE ALL ON FUNCTION public.staynas_knowledge_search(uuid, text, integer, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.staynas_ai_knowledge_search(uuid, text, integer, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.staynas_property_knowledge_search(uuid, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_property_knowledge_search(uuid, text, integer, boolean) TO authenticated;
COMMENT ON FUNCTION public.staynas_property_knowledge_search(uuid, text, integer, boolean) IS
  'Unified bilingual, property-scoped retrieval. Guest visibility is an additional filter; public guest execution remains disabled pending isolation verification.';

-- Public concierge retrieval is a separate, service-role-only contract.
-- It returns only published/approved guest-visible content for the explicitly
-- configured property. It does not depend on auth.uid() or bypass these
-- property, publication and visibility predicates.
CREATE OR REPLACE FUNCTION public.staynas_public_property_knowledge_search(
  _property_id uuid,
  _query text,
  _limit integer DEFAULT 6
)
RETURNS TABLE (
  source_id uuid,
  source_kind text,
  source_type text,
  title text,
  slug text,
  category_slug text,
  chunk_index integer,
  url text,
  summary text,
  content text,
  language_code text,
  source_updated_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $sn_iq_02$
  WITH active_property AS (
    SELECT id FROM public.staynas_properties
    WHERE id = _property_id AND status = 'active'
  ),
  document_hits AS (
    SELECT
      document.id AS source_id,
      'document'::text AS source_kind,
      document.source_type,
      document.title,
      document.slug,
      category.slug AS category_slug,
      chunk.chunk_index,
      document.source_url AS url,
      document.summary,
      chunk.content,
      document.language_code,
      document.source_updated_at,
      (
        ts_rank(chunk.tsv, plainto_tsquery('english', _query))
        + ts_rank(chunk.simple_tsv, plainto_tsquery('simple', _query))
      )::real AS rank
    FROM active_property property
    JOIN public.knowledge_documents document ON document.property_id = property.id
    JOIN public.knowledge_chunks chunk
      ON chunk.document_id = document.id
     AND chunk.property_id = property.id
     AND chunk.version = document.current_version
    LEFT JOIN public.knowledge_categories category
      ON category.id = document.category_id
     AND category.property_id = property.id
    WHERE document.status = 'published'
      AND document.is_guest_visible = true
      AND document.review_due_at IS NOT NULL AND document.review_due_at >= now()
      AND (
        chunk.tsv @@ plainto_tsquery('english', _query)
        OR chunk.simple_tsv @@ plainto_tsquery('simple', _query)
      )
  ),
  source_hits AS (
    SELECT
      source.id AS source_id,
      'synced_source'::text AS source_kind,
      source.source_type,
      source.title,
      coalesce(source.metadata->>'slug', source.external_ref) AS slug,
      NULL::text AS category_slug,
      NULL::integer AS chunk_index,
      source.url,
      source.summary,
      left(source.content, 4000) AS content,
      source.language_code,
      source.source_updated_at,
      (
        ts_rank(source.content_tsv, plainto_tsquery('english', _query))
        + ts_rank(source.simple_tsv, plainto_tsquery('simple', _query))
      )::real AS rank
    FROM active_property property
    JOIN public.ai_knowledge_sources source ON source.property_id = property.id
    WHERE source.status = 'approved'
      AND source.is_guest_visible = true
      AND source.review_due_at IS NOT NULL AND source.review_due_at >= now()
      AND (
        source.content_tsv @@ plainto_tsquery('english', _query)
        OR source.simple_tsv @@ plainto_tsquery('simple', _query)
      )
  )
  SELECT * FROM (
    SELECT * FROM document_hits
    UNION ALL
    SELECT * FROM source_hits
  ) matches
  WHERE _query IS NOT NULL AND length(trim(_query)) > 0
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 6), 1), 12);
$sn_iq_02$;

REVOKE ALL ON FUNCTION public.staynas_public_property_knowledge_search(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staynas_public_property_knowledge_search(uuid, text, integer) TO service_role;
COMMENT ON FUNCTION public.staynas_public_property_knowledge_search(uuid, text, integer) IS
  'Service-role-only guest retrieval. Explicitly restricted to active property and published/approved guest-visible knowledge.';


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

-- ---------------------------------------------------------------------------
-- 4. Copilot history is property-bound because it contains knowledge excerpts
-- and citations. A user's own sessions must not cross active properties.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_copilot_sessions
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.staynas_properties(id) ON DELETE CASCADE;

DO $sn_iq_02_copilot$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_copilot_sessions_property_required' AND conrelid = 'public.ai_copilot_sessions'::regclass) THEN
    ALTER TABLE public.ai_copilot_sessions
      ADD CONSTRAINT ai_copilot_sessions_property_required CHECK (property_id IS NOT NULL) NOT VALID;
  END IF;
END
$sn_iq_02_copilot$;

CREATE INDEX IF NOT EXISTS ai_copilot_sessions_property_user_idx
  ON public.ai_copilot_sessions(property_id, user_id, updated_at DESC);

DROP POLICY IF EXISTS "own copilot sessions" ON public.ai_copilot_sessions;
CREATE POLICY "Copilot sessions read and manage in active property"
  ON public.ai_copilot_sessions FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND property_id IS NOT NULL
    AND public.staynas_ai_property_in_active_context(
      property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
    )
  );

DROP POLICY IF EXISTS "own copilot messages" ON public.ai_copilot_messages;
CREATE POLICY "Copilot messages read and manage in active property"
  ON public.ai_copilot_messages FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ai_copilot_sessions session
      WHERE session.id = ai_copilot_messages.session_id
        AND session.user_id = auth.uid()
        AND public.staynas_ai_property_in_active_context(
          session.property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
        )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ai_copilot_sessions session
      WHERE session.id = ai_copilot_messages.session_id
        AND session.user_id = auth.uid()
        AND public.staynas_ai_property_in_active_context(
          session.property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
        )
    )
  );

DROP POLICY IF EXISTS "own copilot feedback" ON public.ai_copilot_feedback;
CREATE POLICY "Copilot feedback read and manage in active property"
  ON public.ai_copilot_feedback FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.ai_copilot_messages message
      JOIN public.ai_copilot_sessions session ON session.id = message.session_id
      WHERE message.id = ai_copilot_feedback.message_id
        AND session.user_id = auth.uid()
        AND public.staynas_ai_property_in_active_context(
          session.property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
        )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.ai_copilot_messages message
      JOIN public.ai_copilot_sessions session ON session.id = message.session_id
      WHERE message.id = ai_copilot_feedback.message_id
        AND session.user_id = auth.uid()
        AND public.staynas_ai_property_in_active_context(
          session.property_id, ARRAY['owner','manager','admin','reservations','reception','marketing','finance','housekeeping']::public.app_role[]
        )
    )
  );


-- Atomic version replacement for existing documents. The caller supplies the
-- version it read; row locking and the expected-version check prevent concurrent
-- editors from silently overwriting one another. SECURITY INVOKER preserves RLS.
CREATE OR REPLACE FUNCTION public.staynas_commit_knowledge_document_version(
  _property_id uuid,
  _document_id uuid,
  _expected_version integer,
  _metadata jsonb,
  _content_text text,
  _language_code text,
  _chunks jsonb,
  _change_note text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $sn_iq_02_atomic$
DECLARE
  _current_version integer;
  _next_version integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _property_id IS NULL OR _document_id IS NULL OR _content_text IS NULL THEN
    RAISE EXCEPTION 'Property, document and content are required';
  END IF;
  IF length(_content_text) > 500000 THEN
    RAISE EXCEPTION 'Document content exceeds 500 KB';
  END IF;
  IF _language_code NOT IN ('en','sw') THEN
    RAISE EXCEPTION 'Unsupported knowledge language';
  END IF;
  IF NOT public.staynas_ai_property_in_active_context(
    _property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Property knowledge management access required';
  END IF;

  SELECT current_version INTO _current_version
  FROM public.knowledge_documents
  WHERE id = _document_id AND property_id = _property_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found in active property';
  END IF;
  IF _current_version IS DISTINCT FROM _expected_version THEN
    RAISE EXCEPTION 'Document version conflict; reload before saving';
  END IF;
  _next_version := _current_version + 1;

  UPDATE public.knowledge_documents SET
    title = COALESCE(NULLIF(_metadata->>'title',''), title),
    summary = CASE WHEN _metadata ? 'summary' THEN _metadata->>'summary' ELSE summary END,
    category_id = CASE WHEN _metadata ? 'category_id' THEN NULLIF(_metadata->>'category_id','')::uuid ELSE category_id END,
    source_type = COALESCE(_metadata->>'source_type', source_type),
    source_url = CASE WHEN _metadata ? 'source_url' THEN _metadata->>'source_url' ELSE source_url END,
    storage_path = CASE WHEN _metadata ? 'storage_path' THEN _metadata->>'storage_path' ELSE storage_path END,
    tags = CASE WHEN jsonb_typeof(_metadata->'tags') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(_metadata->'tags')) ELSE tags END,
    status = COALESCE(_metadata->>'status', status),
    allowed_roles = CASE WHEN jsonb_typeof(_metadata->'allowed_roles') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(_metadata->'allowed_roles'))
      WHEN _metadata ? 'allowed_roles' THEN NULL ELSE allowed_roles END,
    language_code = _language_code,
    is_guest_visible = COALESCE((_metadata->>'is_guest_visible')::boolean, is_guest_visible),
    source_updated_at = now(),
    review_due_at = COALESCE(NULLIF(_metadata->>'review_due_at','')::timestamptz, review_due_at),
    reviewed_by = CASE WHEN _metadata ? 'reviewed_by' THEN NULLIF(_metadata->>'reviewed_by','')::uuid ELSE reviewed_by END,
    reviewed_at = CASE WHEN _metadata ? 'reviewed_at' THEN NULLIF(_metadata->>'reviewed_at','')::timestamptz ELSE reviewed_at END,
    current_version = _next_version,
    byte_size = length(_content_text),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = _document_id AND property_id = _property_id;

  INSERT INTO public.knowledge_document_versions
    (document_id, property_id, version, content_text, byte_size, change_note, created_by)
  VALUES
    (_document_id, _property_id, _next_version, _content_text, length(_content_text), _change_note, auth.uid());

  DELETE FROM public.knowledge_chunks
  WHERE document_id = _document_id AND property_id = _property_id;

  INSERT INTO public.knowledge_chunks
    (document_id, property_id, language_code, version, chunk_index, content)
  SELECT _document_id, _property_id, _language_code, _next_version,
         (item.ordinality - 1)::integer, item.content
  FROM jsonb_array_elements_text(COALESCE(_chunks, '[]'::jsonb))
       WITH ORDINALITY AS item(content, ordinality);

  RETURN _next_version;
END;
$sn_iq_02_atomic$;

REVOKE ALL ON FUNCTION public.staynas_commit_knowledge_document_version(uuid,uuid,integer,jsonb,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_commit_knowledge_document_version(uuid,uuid,integer,jsonb,text,text,jsonb,text) TO authenticated;



-- Atomic initial creation: the document row, version 1 and all search chunks
-- are committed together. SECURITY INVOKER keeps table grants and RLS active.
CREATE OR REPLACE FUNCTION public.staynas_create_knowledge_document(
  _property_id uuid,
  _metadata jsonb,
  _content_text text,
  _language_code text,
  _chunks jsonb,
  _change_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $sn_iq_02_create$
DECLARE
  _document_id uuid;
  _title text;
  _slug text;
  _status text;
  _source_type text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _property_id IS NULL OR _content_text IS NULL THEN
    RAISE EXCEPTION 'Property and document content are required';
  END IF;
  IF length(_content_text) > 500000 THEN
    RAISE EXCEPTION 'Document content exceeds 500 KB';
  END IF;
  IF _language_code NOT IN ('en','sw') THEN
    RAISE EXCEPTION 'Unsupported knowledge language';
  END IF;
  IF NOT public.staynas_ai_property_in_active_context(
    _property_id, ARRAY['owner','manager','admin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Property knowledge management access required';
  END IF;

  _title := NULLIF(trim(_metadata->>'title'), '');
  _slug := NULLIF(trim(_metadata->>'slug'), '');
  _status := COALESCE(_metadata->>'status', 'draft');
  _source_type := COALESCE(_metadata->>'source_type', 'markdown');
  IF _title IS NULL OR _slug IS NULL THEN
    RAISE EXCEPTION 'Document title and slug are required';
  END IF;
  IF _status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'Invalid document status';
  END IF;

  INSERT INTO public.knowledge_documents (
    property_id, slug, title, summary, category_id, source_type, source_url,
    storage_path, tags, status, allowed_roles, language_code,
    is_guest_visible, source_updated_at, review_due_at, reviewed_by,
    reviewed_at, current_version, byte_size, created_by, updated_by
  ) VALUES (
    _property_id, _slug, _title, _metadata->>'summary',
    NULLIF(_metadata->>'category_id','')::uuid, _source_type,
    _metadata->>'source_url', _metadata->>'storage_path',
    CASE WHEN jsonb_typeof(_metadata->'tags') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(_metadata->'tags')) ELSE '{}'::text[] END,
    _status,
    CASE WHEN jsonb_typeof(_metadata->'allowed_roles') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(_metadata->'allowed_roles')) ELSE NULL END,
    _language_code,
    COALESCE((_metadata->>'is_guest_visible')::boolean, false),
    now(), NULLIF(_metadata->>'review_due_at','')::timestamptz,
    CASE WHEN _status = 'published' THEN auth.uid() ELSE NULL END,
    CASE WHEN _status = 'published' THEN now() ELSE NULL END,
    1, length(_content_text), auth.uid(), auth.uid()
  )
  RETURNING id INTO _document_id;

  INSERT INTO public.knowledge_document_versions
    (document_id, property_id, version, content_text, byte_size, change_note, created_by)
  VALUES
    (_document_id, _property_id, 1, _content_text, length(_content_text), _change_note, auth.uid());

  INSERT INTO public.knowledge_chunks
    (document_id, property_id, language_code, version, chunk_index, content)
  SELECT _document_id, _property_id, _language_code, 1,
         (item.ordinality - 1)::integer, item.content
  FROM jsonb_array_elements_text(COALESCE(_chunks, '[]'::jsonb))
       WITH ORDINALITY AS item(content, ordinality);

  RETURN _document_id;
END;
$sn_iq_02_create$;

REVOKE ALL ON FUNCTION public.staynas_create_knowledge_document(uuid,jsonb,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staynas_create_knowledge_document(uuid,jsonb,text,text,jsonb,text) TO authenticated;
