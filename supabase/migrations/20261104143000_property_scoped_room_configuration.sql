-- Store guest-facing room content on the existing property-owned rooms table.
-- Existing room, category, inventory, pricing and booking records are preserved.
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS room_number_label text,
  ADD COLUMN IF NOT EXISTS description text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_line text,
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS rooms_property_sort_idx
  ON public.rooms(property_id, status, sort_order, name);


DROP POLICY IF EXISTS "Platform admins upload room images" ON storage.objects;
DROP POLICY IF EXISTS "Platform admins update room images" ON storage.objects;
DROP POLICY IF EXISTS "Platform admins delete room images" ON storage.objects;
DROP POLICY IF EXISTS "Property room managers upload room images" ON storage.objects;
DROP POLICY IF EXISTS "Property room managers update room images" ON storage.objects;
DROP POLICY IF EXISTS "Property room managers delete room images" ON storage.objects;
CREATE POLICY "Property room managers upload room images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id='room-images' AND EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id=(storage.foldername(name))[1]::uuid
        AND pm.user_id=auth.uid() AND pm.status='active'
        AND pm.role IN ('owner','admin','manager')
    )
  );
CREATE POLICY "Property room managers update room images" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id='room-images' AND EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id=(storage.foldername(name))[1]::uuid
        AND pm.user_id=auth.uid() AND pm.status='active'
        AND pm.role IN ('owner','admin','manager')
    )
  ) WITH CHECK (
    bucket_id='room-images' AND EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id=(storage.foldername(name))[1]::uuid
        AND pm.user_id=auth.uid() AND pm.status='active'
        AND pm.role IN ('owner','admin','manager')
    )
  );
CREATE POLICY "Property room managers delete room images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id='room-images' AND EXISTS (
      SELECT 1 FROM public.staynas_property_members pm
      WHERE pm.property_id=(storage.foldername(name))[1]::uuid
        AND pm.user_id=auth.uid() AND pm.status='active'
        AND pm.role IN ('owner','admin','manager')
    )
  );
