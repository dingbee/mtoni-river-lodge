INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('property-branding','property-branding',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/avif']::text[])
ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE POLICY "Public read property branding assets" ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id='property-branding');

CREATE POLICY "Property managers upload branding assets" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='property-branding'
 AND split_part(name,'/',1) ~ '^[0-9a-fA-F-]{36}$'
 AND EXISTS (SELECT 1 FROM public.staynas_property_members pm
  WHERE pm.property_id=split_part(name,'/',1)::uuid AND pm.user_id=auth.uid()
  AND pm.status='active' AND pm.role IN ('owner','admin','manager'))
);

CREATE POLICY "Property managers update branding assets" ON storage.objects
FOR UPDATE TO authenticated USING (
 bucket_id='property-branding'
 AND split_part(name,'/',1) ~ '^[0-9a-fA-F-]{36}$'
 AND EXISTS (SELECT 1 FROM public.staynas_property_members pm
  WHERE pm.property_id=split_part(name,'/',1)::uuid AND pm.user_id=auth.uid()
  AND pm.status='active' AND pm.role IN ('owner','admin','manager'))
) WITH CHECK (
 bucket_id='property-branding'
 AND split_part(name,'/',1) ~ '^[0-9a-fA-F-]{36}$'
 AND EXISTS (SELECT 1 FROM public.staynas_property_members pm
  WHERE pm.property_id=split_part(name,'/',1)::uuid AND pm.user_id=auth.uid()
  AND pm.status='active' AND pm.role IN ('owner','admin','manager'))
);

CREATE POLICY "Property managers delete branding assets" ON storage.objects
FOR DELETE TO authenticated USING (
 bucket_id='property-branding'
 AND split_part(name,'/',1) ~ '^[0-9a-fA-F-]{36}$'
 AND EXISTS (SELECT 1 FROM public.staynas_property_members pm
  WHERE pm.property_id=split_part(name,'/',1)::uuid AND pm.user_id=auth.uid()
  AND pm.status='active' AND pm.role IN ('owner','admin','manager'))
);
