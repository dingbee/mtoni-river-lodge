ALTER TABLE public.guest_documents
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS uploaded_by_guest boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_guest_documents_kind ON public.guest_documents (kind);

CREATE POLICY "guest docs staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'guest-documents' AND public.is_any_staff(auth.uid()));

CREATE POLICY "guest docs staff write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guest-documents' AND public.is_any_staff(auth.uid()));

CREATE POLICY "guest docs staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'guest-documents' AND public.is_any_staff(auth.uid()))
  WITH CHECK (bucket_id = 'guest-documents' AND public.is_any_staff(auth.uid()));

CREATE POLICY "guest docs staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'guest-documents' AND public.is_any_staff(auth.uid()));