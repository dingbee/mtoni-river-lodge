-- Phase 4 security hardening: property-scope guest identity document objects.
-- Guest uploads and previews remain token/session-authorised server operations.
-- Authenticated staff may read only objects linked to guest_documents rows in a
-- property they can access. Direct client writes are intentionally not granted.

DROP POLICY IF EXISTS "guest docs staff read" ON storage.objects;
DROP POLICY IF EXISTS "guest docs staff write" ON storage.objects;
DROP POLICY IF EXISTS "guest docs staff update" ON storage.objects;
DROP POLICY IF EXISTS "guest docs staff delete" ON storage.objects;

DROP POLICY IF EXISTS "guest documents property staff read" ON storage.objects;
CREATE POLICY "guest documents property staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'guest-documents'
    AND public.is_any_staff(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.guest_documents d
      WHERE d.storage_path = storage.objects.name
        AND d.property_id IS NOT NULL
        AND public.staynas_user_has_property_access(auth.uid(), d.property_id)
    )
  );

COMMENT ON POLICY "guest documents property staff read" ON storage.objects IS
  'Staff can read guest identity documents only when the linked document belongs to an accessible StayNas property. Upload/delete remains server-only.';
