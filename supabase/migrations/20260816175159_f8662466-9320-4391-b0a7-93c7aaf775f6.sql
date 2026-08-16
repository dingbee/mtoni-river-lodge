ALTER TABLE public.respad_normalized_accounts
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS merged_into_account_id uuid REFERENCES public.respad_normalized_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canonical_name text,
  ADD COLUMN IF NOT EXISTS canonical_account_type text,
  ADD COLUMN IF NOT EXISTS canonical_email text,
  ADD COLUMN IF NOT EXISTS canonical_phone text,
  ADD COLUMN IF NOT EXISTS canonical_mobile text,
  ADD COLUMN IF NOT EXISTS canonical_address text,
  ADD COLUMN IF NOT EXISTS canonical_website text,
  ADD COLUMN IF NOT EXISTS canonical_tin text,
  ADD COLUMN IF NOT EXISTS canonical_vrn text,
  ADD COLUMN IF NOT EXISTS canonical_notes text,
  ADD COLUMN IF NOT EXISTS canonical_contacts jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.respad_normalized_accounts ALTER COLUMN review_status SET DEFAULT 'needs_review';
UPDATE public.respad_normalized_accounts SET review_status = 'needs_review'
  WHERE review_status NOT IN ('needs_review','pending','approved','rejected','merged');

ALTER TABLE public.respad_normalized_accounts
  DROP CONSTRAINT IF EXISTS respad_normalized_accounts_review_status_chk;
ALTER TABLE public.respad_normalized_accounts
  ADD CONSTRAINT respad_normalized_accounts_review_status_chk
  CHECK (review_status IN ('needs_review','pending','approved','rejected','merged'));

CREATE INDEX IF NOT EXISTS respad_normalized_accounts_review_idx
  ON public.respad_normalized_accounts (migration_batch_id, review_status);

ALTER TABLE public.respad_duplicate_candidates
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS canonical_account_id uuid REFERENCES public.respad_normalized_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.respad_migration_audit_log
  ADD COLUMN IF NOT EXISTS target_table text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS previous_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS notes text;