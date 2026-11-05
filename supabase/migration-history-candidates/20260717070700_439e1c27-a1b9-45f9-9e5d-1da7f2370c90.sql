
-- RLS policies for the private `media` bucket on storage.objects.
CREATE POLICY "media read staff"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'media' AND public.is_any_staff(auth.uid()));

CREATE POLICY "media insert staff"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media' AND public.is_any_staff(auth.uid()));

CREATE POLICY "media update staff"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media' AND public.is_any_staff(auth.uid()))
WITH CHECK (bucket_id = 'media' AND public.is_any_staff(auth.uid()));

CREATE POLICY "media delete staff"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media' AND public.is_any_staff(auth.uid()));

-- Unique path index to keep folder tree consistent.
CREATE UNIQUE INDEX IF NOT EXISTS media_folders_path_key ON public.media_folders (path);
CREATE INDEX IF NOT EXISTS media_assets_folder_idx ON public.media_assets (folder_id);
CREATE INDEX IF NOT EXISTS media_assets_hash_idx ON public.media_assets (content_hash);
CREATE INDEX IF NOT EXISTS media_usage_asset_idx ON public.media_usage (asset_id);
