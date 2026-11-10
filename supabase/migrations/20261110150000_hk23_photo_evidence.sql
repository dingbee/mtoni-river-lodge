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
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.room_states rs
    WHERE rs.id::text = split_part(name, '/', 2)
      AND rs.property_id::text = split_part(name, '/', 1)
      AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
  )
);

DROP POLICY IF EXISTS housekeeping_evidence_property_insert ON storage.objects;
CREATE POLICY housekeeping_evidence_property_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'housekeeping-evidence'
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.room_states rs
    WHERE rs.id::text = split_part(name, '/', 2)
      AND rs.property_id::text = split_part(name, '/', 1)
      AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
  )
);

DROP POLICY IF EXISTS housekeeping_evidence_property_delete ON storage.objects;
CREATE POLICY housekeeping_evidence_property_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'housekeeping-evidence'
  AND public.has_any_role(auth.uid(), ARRAY['housekeeping','owner','manager','admin']::public.app_role[])
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.room_states rs
    WHERE rs.id::text = split_part(name, '/', 2)
      AND rs.property_id::text = split_part(name, '/', 1)
      AND public.staynas_user_has_property_access(auth.uid(), rs.property_id)
  )
);

-- The exception row may reference only evidence uploaded for its own room state.
-- This prevents a valid same-tenant path from being attached to an unrelated report.
CREATE OR REPLACE FUNCTION public.housekeeping_validate_exception_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $
DECLARE
  _property_id uuid;
  _item jsonb;
  _path text;
BEGIN
  IF jsonb_typeof(COALESCE(NEW.evidence, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Housekeeping evidence must be an array';
  END IF;

  SELECT rs.property_id INTO _property_id
  FROM public.room_states rs
  WHERE rs.id = NEW.room_state_id;

  IF _property_id IS NULL THEN
    RAISE EXCEPTION 'Housekeeping room state not found';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.evidence, '[]'::jsonb))
  LOOP
    _path := _item->>'path';
    IF _path IS NULL
       OR split_part(_path, '/', 1) <> _property_id::text
       OR split_part(_path, '/', 2) <> NEW.room_state_id::text
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
         WHERE o.bucket_id = 'housekeeping-evidence' AND o.name = _path
       ) THEN
      RAISE EXCEPTION 'Housekeeping evidence does not belong to this room report';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS housekeeping_exception_evidence_validate ON public.housekeeping_exceptions;
CREATE TRIGGER housekeeping_exception_evidence_validate
BEFORE INSERT OR UPDATE OF evidence, room_state_id
ON public.housekeeping_exceptions
FOR EACH ROW EXECUTE FUNCTION public.housekeeping_validate_exception_evidence();

REVOKE ALL ON FUNCTION public.housekeeping_validate_exception_evidence() FROM PUBLIC, anon, authenticated;

COMMIT;
