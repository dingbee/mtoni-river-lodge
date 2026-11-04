-- Property-scoped visual identity for StayNas Direct.
-- UAT-safe: additive table, no changes to existing property or booking records.

CREATE TABLE IF NOT EXISTS public.staynas_property_branding (
  property_id uuid PRIMARY KEY REFERENCES public.staynas_properties(id) ON DELETE CASCADE,
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text NOT NULL DEFAULT '#1e352a',
  secondary_color text NOT NULL DEFAULT '#c6a878',
  background_color text NOT NULL DEFAULT '#f5f4ef',
  text_color text NOT NULL DEFAULT '#202820',
  tagline text,
  description text,
  hero_image_url text,
  gallery_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  show_staynas_attribution boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.staynas_property_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staynas_property_branding_read_member"
ON public.staynas_property_branding
FOR SELECT TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "staynas_property_branding_insert_member"
ON public.staynas_property_branding
FOR INSERT TO authenticated
WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id));

CREATE POLICY "staynas_property_branding_update_member"
ON public.staynas_property_branding
FOR UPDATE TO authenticated
USING (public.staynas_user_has_property_access(auth.uid(), property_id))
WITH CHECK (public.staynas_user_has_property_access(auth.uid(), property_id));

GRANT SELECT, INSERT, UPDATE ON public.staynas_property_branding TO authenticated;
GRANT SELECT ON public.staynas_property_branding TO service_role;

CREATE INDEX IF NOT EXISTS staynas_property_branding_updated_at_idx
ON public.staynas_property_branding(updated_at DESC);
