CREATE TABLE public.respad_migration_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_batch_id uuid REFERENCES public.respad_migration_batches(id) ON DELETE SET NULL,
  source_system text NOT NULL DEFAULT 'ResPad',
  original_filename text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  content_hash text NOT NULL,
  intake_kind text NOT NULL DEFAULT 'structured',
  processing_status text NOT NULL DEFAULT 'uploaded',
  detected_row_count integer NOT NULL DEFAULT 0,
  detected_field_count integer NOT NULL DEFAULT 0,
  mapped_field_count integer NOT NULL DEFAULT 0,
  review_field_count integer NOT NULL DEFAULT 0,
  staged_record_count integer NOT NULL DEFAULT 0,
  field_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraction_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT respad_migration_files_hash_unique UNIQUE (source_system, content_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.respad_migration_files TO authenticated;
GRANT ALL ON public.respad_migration_files TO service_role;

ALTER TABLE public.respad_migration_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers manage respad migration files"
ON public.respad_migration_files
FOR ALL
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['owner','manager']::app_role[]));

CREATE INDEX respad_migration_files_batch_idx ON public.respad_migration_files (migration_batch_id);
CREATE INDEX respad_migration_files_uploaded_idx ON public.respad_migration_files (uploaded_at DESC);

CREATE TRIGGER update_respad_migration_files_updated_at
BEFORE UPDATE ON public.respad_migration_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();