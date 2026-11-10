-- HK-23: private, property-scoped housekeeping photographic evidence.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('housekeeping-evidence', 'housekeeping-evidence', false, 8388608,
        ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 8388608,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS housekeeping_evidence_property_read ON storage.objects;
CREATE POLICY housekeeping_evidence_property_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'housekeeping-evidence'
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
  AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.room_states rs
    WHERE rs.id = split_part(name, '/', 2)::uuid
      AND rs.property_id = split_part(name, '/', 1)::uuid
      AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
  )
);

DROP POLICY IF EXISTS housekeeping_evidence_property_insert ON storage.objects;
CREATE POLICY housekeeping_evidence_property_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'housekeeping-evidence'
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
  AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.room_states rs
    WHERE rs.id = split_part(name, '/', 2)::uuid
      AND rs.property_id = split_part(name, '/', 1)::uuid
      AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
  )
);

DROP POLICY IF EXISTS housekeeping_evidence_property_delete ON storage.objects;
CREATE POLICY housekeeping_evidence_property_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'housekeeping-evidence'
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
  AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  AND split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.room_states rs
    WHERE rs.id = split_part(name, '/', 2)::uuid
      AND rs.property_id = split_part(name, '/', 1)::uuid
      AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
  )
);

COMMIT;
