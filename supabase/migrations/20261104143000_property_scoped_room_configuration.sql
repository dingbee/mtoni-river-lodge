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

CREATE INDEX IF NOT EXISTS rooms_property_sort_idx
  ON public.rooms(property_id, status, sort_order, name);

CREATE OR REPLACE FUNCTION public.enforce_room_category_property()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_categories c
    WHERE c.id = NEW.category_id AND c.property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'Room category must belong to the same property';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rooms_category_property_guard ON public.rooms;
CREATE TRIGGER rooms_category_property_guard
  BEFORE INSERT OR UPDATE OF category_id, property_id ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_category_property();

DROP POLICY IF EXISTS "Platform admins upload room images" ON storage.objects;
DROP POLICY IF EXISTS "Platform admins update room images" ON storage.objects;
DROP POLICY IF EXISTS "Platform admins delete room images" ON storage.objects;
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
