CREATE POLICY "kb_docs_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-docs' AND public.is_any_staff(auth.uid()));
CREATE POLICY "kb_docs_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-docs' AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE POLICY "kb_docs_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'knowledge-docs' AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]))
  WITH CHECK (bucket_id = 'knowledge-docs' AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));
CREATE POLICY "kb_docs_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-docs' AND public.has_any_role(auth.uid(), ARRAY['owner','manager','admin']::public.app_role[]));