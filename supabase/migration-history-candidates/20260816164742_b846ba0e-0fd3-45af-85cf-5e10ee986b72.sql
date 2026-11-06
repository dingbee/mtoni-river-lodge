
-- ============ ResPad migration staging layer (STAGING + AUDIT ONLY) ============

CREATE TABLE public.respad_migration_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'ResPad',
  batch_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  source_files text[] NOT NULL DEFAULT '{}',
  source_record_count integer NOT NULL DEFAULT 0,
  staged_record_count integer NOT NULL DEFAULT 0,
  normalized_account_count integer NOT NULL DEFAULT 0,
  relationship_count integer NOT NULL DEFAULT 0,
  duplicate_candidate_count integer NOT NULL DEFAULT 0,
  high_confidence_duplicate_count integer NOT NULL DEFAULT 0,
  review_required_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  notes text,
  imported_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respad_migration_batches TO authenticated;
GRANT ALL ON public.respad_migration_batches TO service_role;
ALTER TABLE public.respad_migration_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respad_batches_admin_all" ON public.respad_migration_batches FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

CREATE UNIQUE INDEX respad_batches_name_key ON public.respad_migration_batches (source_system, batch_name);

-- ---------------------------------------------------------------- raw records
CREATE TABLE public.respad_account_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_batch_id uuid NOT NULL REFERENCES public.respad_migration_batches(id) ON DELETE CASCADE,
  legacy_source text NOT NULL DEFAULT 'ResPad',
  source_file text NOT NULL,
  source_row_index integer NOT NULL DEFAULT 0,
  source_row_key text NOT NULL,
  legacy_company_id text,
  legacy_groupname text,
  legacy_clientname text,
  legacy_address text,
  legacy_telephone text,
  legacy_mobile text,
  legacy_email text,
  legacy_website text,
  legacy_tin text,
  legacy_vrn text,
  legacy_other text,
  legacy_payment_mode text,
  legacy_country text,
  normalized_account_name text,
  normalized_match_key text,
  normalized_email text,
  normalized_emails text[] NOT NULL DEFAULT '{}',
  normalized_phone text,
  normalized_phones text[] NOT NULL DEFAULT '{}',
  normalized_website text,
  normalized_domain text,
  normalized_tin text,
  normalized_vrn text,
  normalized_address text,
  normalized_country text,
  account_type text NOT NULL DEFAULT 'unknown',
  classification_source text NOT NULL DEFAULT 'migration_rule',
  account_status text NOT NULL DEFAULT 'staged',
  normalization_status text NOT NULL DEFAULT 'ok',
  duplicate_status text NOT NULL DEFAULT 'unchecked',
  duplicate_group_id uuid,
  review_status text NOT NULL DEFAULT 'pending',
  quality_flags text[] NOT NULL DEFAULT '{}',
  notes text,
  raw_record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respad_account_staging TO authenticated;
GRANT ALL ON public.respad_account_staging TO service_role;
ALTER TABLE public.respad_account_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respad_staging_admin_all" ON public.respad_account_staging FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

-- idempotency: same source system + file + record identity never stages twice
CREATE UNIQUE INDEX respad_staging_identity_key
  ON public.respad_account_staging (legacy_source, source_file, source_row_key);
CREATE INDEX respad_staging_batch_idx ON public.respad_account_staging (migration_batch_id);
CREATE INDEX respad_staging_matchkey_idx ON public.respad_account_staging (normalized_match_key);
CREATE INDEX respad_staging_group_idx ON public.respad_account_staging (legacy_groupname);

-- --------------------------------------------------- normalized account candidates
CREATE TABLE public.respad_normalized_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_batch_id uuid NOT NULL REFERENCES public.respad_migration_batches(id) ON DELETE CASCADE,
  legacy_source text NOT NULL DEFAULT 'ResPad',
  match_key text NOT NULL,
  account_name text NOT NULL,
  legacy_clientnames text[] NOT NULL DEFAULT '{}',
  legacy_company_ids text[] NOT NULL DEFAULT '{}',
  source_files text[] NOT NULL DEFAULT '{}',
  groupnames text[] NOT NULL DEFAULT '{}',
  emails text[] NOT NULL DEFAULT '{}',
  phones text[] NOT NULL DEFAULT '{}',
  websites text[] NOT NULL DEFAULT '{}',
  domains text[] NOT NULL DEFAULT '{}',
  tins text[] NOT NULL DEFAULT '{}',
  vrns text[] NOT NULL DEFAULT '{}',
  addresses text[] NOT NULL DEFAULT '{}',
  payment_modes text[] NOT NULL DEFAULT '{}',
  country text,
  account_type text NOT NULL DEFAULT 'unknown',
  classification_source text NOT NULL DEFAULT 'migration_rule',
  classification_evidence text,
  source_record_count integer NOT NULL DEFAULT 0,
  relationship_count integer NOT NULL DEFAULT 0,
  quality_flags text[] NOT NULL DEFAULT '{}',
  duplicate_group_id uuid,
  duplicate_confidence text,
  review_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respad_normalized_accounts TO authenticated;
GRANT ALL ON public.respad_normalized_accounts TO service_role;
ALTER TABLE public.respad_normalized_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respad_normalized_admin_all" ON public.respad_normalized_accounts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

CREATE UNIQUE INDEX respad_normalized_identity_key
  ON public.respad_normalized_accounts (migration_batch_id, match_key);

ALTER TABLE public.respad_account_staging
  ADD COLUMN normalized_account_id uuid REFERENCES public.respad_normalized_accounts(id) ON DELETE SET NULL;
CREATE INDEX respad_staging_normalized_idx ON public.respad_account_staging (normalized_account_id);

-- ------------------------------------------------ commercial group relationships
CREATE TABLE public.respad_account_relationship_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_batch_id uuid NOT NULL REFERENCES public.respad_migration_batches(id) ON DELETE CASCADE,
  staging_account_id uuid REFERENCES public.respad_account_staging(id) ON DELETE CASCADE,
  normalized_account_id uuid REFERENCES public.respad_normalized_accounts(id) ON DELETE CASCADE,
  legacy_source text NOT NULL DEFAULT 'ResPad',
  legacy_company_id text,
  legacy_groupname text NOT NULL,
  source_file text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'commercial_group',
  raw_record jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respad_account_relationship_staging TO authenticated;
GRANT ALL ON public.respad_account_relationship_staging TO service_role;
ALTER TABLE public.respad_account_relationship_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respad_rel_admin_all" ON public.respad_account_relationship_staging FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

CREATE UNIQUE INDEX respad_rel_identity_key
  ON public.respad_account_relationship_staging (normalized_account_id, legacy_groupname, source_file);

-- ------------------------------------------------------- duplicate candidates
CREATE TABLE public.respad_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_batch_id uuid NOT NULL REFERENCES public.respad_migration_batches(id) ON DELETE CASCADE,
  duplicate_group_id uuid NOT NULL,
  normalized_account_id uuid NOT NULL REFERENCES public.respad_normalized_accounts(id) ON DELETE CASCADE,
  confidence text NOT NULL,
  match_signals text[] NOT NULL DEFAULT '{}',
  match_reason text,
  is_proposed_master boolean NOT NULL DEFAULT false,
  proposed_action text NOT NULL DEFAULT 'review',
  resolution_status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respad_duplicate_candidates TO authenticated;
GRANT ALL ON public.respad_duplicate_candidates TO service_role;
ALTER TABLE public.respad_duplicate_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respad_dupe_admin_all" ON public.respad_duplicate_candidates FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

CREATE UNIQUE INDEX respad_dupe_identity_key
  ON public.respad_duplicate_candidates (migration_batch_id, duplicate_group_id, normalized_account_id);

-- --------------------------------------------------------------- audit log
CREATE TABLE public.respad_migration_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_batch_id uuid REFERENCES public.respad_migration_batches(id) ON DELETE CASCADE,
  action text NOT NULL,
  phase text NOT NULL DEFAULT 'staging',
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.respad_migration_audit_log TO authenticated;
GRANT ALL ON public.respad_migration_audit_log TO service_role;
ALTER TABLE public.respad_migration_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respad_audit_admin_read" ON public.respad_migration_audit_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));
CREATE POLICY "respad_audit_admin_insert" ON public.respad_migration_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

CREATE INDEX respad_audit_batch_idx ON public.respad_migration_audit_log (migration_batch_id, created_at DESC);

-- --------------------------------------------------------------- timestamps
CREATE TRIGGER respad_batches_updated_at BEFORE UPDATE ON public.respad_migration_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER respad_staging_updated_at BEFORE UPDATE ON public.respad_account_staging
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER respad_normalized_updated_at BEFORE UPDATE ON public.respad_normalized_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
