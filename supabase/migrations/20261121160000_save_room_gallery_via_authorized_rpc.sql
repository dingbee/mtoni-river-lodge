-- Save room gallery images through a narrowly scoped, manager-authorized RPC.
-- The authenticated role intentionally has no direct UPDATE grant on public.rooms.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_platform_room_gallery(
  _property_id uuid,
  _room_id uuid,
  _image_url text,
  _gallery_urls text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  _updated_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.staynas_user_has_property_access(auth.uid(), _property_id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.staynas_property_members pm
       WHERE pm.user_id = auth.uid()
         AND pm.property_id = _property_id
         AND pm.status = 'active'
         AND pm.role IN ('owner','manager','admin')
     )
  THEN
    RAISE EXCEPTION 'Room gallery updates require property manager access'
      USING ERRCODE = '42501';
  END IF;

  IF _image_url IS NOT NULL AND _image_url !~ '^https://' THEN
    RAISE EXCEPTION 'Room cover image must use HTTPS' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(array_length(_gallery_urls, 1), 0) > 20
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(_gallery_urls, '{}'::text[])) AS image_url
       WHERE image_url !~ '^https://'
     )
  THEN
    RAISE EXCEPTION 'Room gallery must contain at most 20 HTTPS image URLs'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.rooms
  SET image_url = NULLIF(_image_url, ''),
      gallery_urls = COALESCE(_gallery_urls, '{}'::text[]),
      configuration_source = 'tenant_configured',
      configured_by = auth.uid(),
      configured_at = now()
  WHERE id = _room_id
    AND property_id = _property_id
  RETURNING id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RAISE EXCEPTION 'Room type not found in selected property'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN _updated_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.save_platform_room_gallery(uuid,uuid,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_room_gallery(uuid,uuid,text,text[]) TO authenticated, service_role;

COMMIT;
