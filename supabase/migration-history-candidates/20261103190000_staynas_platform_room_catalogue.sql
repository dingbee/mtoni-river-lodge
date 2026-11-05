-- Restore StayNas platform-owned room catalogue while preserving property operations.
-- Room quantities, rates, currency, availability, room states and bookings remain property-owned.

CREATE TABLE IF NOT EXISTS public.staynas_platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Bootstrap only the existing Nolmark founder-property owner. No property membership
-- or operational data is changed by this migration.
INSERT INTO public.staynas_platform_admins (user_id)
SELECT pm.user_id
FROM public.staynas_property_members pm
WHERE pm.property_id = 'f44ff48a-5449-4464-b0cb-83295fadb468'::uuid
  AND pm.role = 'owner'
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.staynas_room_catalogue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL,
  description text,
  features text[] NOT NULL DEFAULT '{}',
  specifications jsonb NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staynas_room_catalogue_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.staynas_room_catalogue_categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL,
  short_description text,
  capacity_adults integer NOT NULL DEFAULT 2 CHECK (capacity_adults > 0),
  capacity_children integer NOT NULL DEFAULT 0 CHECK (capacity_children >= 0),
  max_occupancy integer NOT NULL DEFAULT 2 CHECK (max_occupancy >= capacity_adults),
  hero_line text,
  image_url text,
  gallery_urls text[] NOT NULL DEFAULT '{}',
  size_label text,
  view_label text,
  bed_label text,
  bathroom_label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS catalogue_type_id uuid
  REFERENCES public.staynas_room_catalogue_types(id) ON DELETE SET NULL;

-- Copy the existing property-defined room metadata into the shared catalogue.
-- Existing operational room records remain untouched apart from the nullable linkage.
INSERT INTO public.staynas_room_catalogue_categories
  (slug,name,description,features,specifications,sort_order,status)
SELECT DISTINCT ON (c.slug)
  c.slug,c.name,c.description,c.features,c.specifications,c.sort_order,c.status
FROM public.room_categories c
ORDER BY c.slug,c.created_at
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.staynas_room_catalogue_types
  (category_id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,
   hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,status,sort_order)
SELECT
  cc.id,r.slug,r.name,r.short_description,r.capacity_adults,r.capacity_children,r.max_occupancy,
  r.hero_line,r.image_url,r.gallery_urls,r.size_label,r.view_label,r.bed_label,r.bathroom_label,
  CASE WHEN r.status='active' THEN 'active' ELSE 'archived' END,r.sort_order
FROM public.rooms r
LEFT JOIN public.room_categories pc ON pc.id=r.category_id
LEFT JOIN public.staynas_room_catalogue_categories cc ON cc.slug=pc.slug
ON CONFLICT (slug) DO NOTHING;

UPDATE public.rooms r
SET catalogue_type_id = ct.id
FROM public.staynas_room_catalogue_types ct
WHERE ct.slug = r.slug
  AND r.catalogue_type_id IS NULL;

CREATE INDEX IF NOT EXISTS rooms_catalogue_type_idx
  ON public.rooms(catalogue_type_id);

ALTER TABLE public.staynas_platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can verify own access" ON public.staynas_platform_admins;
CREATE POLICY "Platform admins can verify own access"
ON public.staynas_platform_admins
FOR SELECT TO authenticated
USING (user_id = auth.uid());
ALTER TABLE public.staynas_room_catalogue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staynas_room_catalogue_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins manage StayNas catalogue categories" ON public.staynas_room_catalogue_categories;
CREATE POLICY "Platform admins manage StayNas catalogue categories"
ON public.staynas_room_catalogue_categories
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staynas_platform_admins a WHERE a.user_id=auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.staynas_platform_admins a WHERE a.user_id=auth.uid()));

DROP POLICY IF EXISTS "Platform admins manage StayNas catalogue types" ON public.staynas_room_catalogue_types;
CREATE POLICY "Platform admins manage StayNas catalogue types"
ON public.staynas_room_catalogue_types
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staynas_platform_admins a WHERE a.user_id=auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.staynas_platform_admins a WHERE a.user_id=auth.uid()));

DROP POLICY IF EXISTS "Public read active StayNas catalogue categories" ON public.staynas_room_catalogue_categories;
CREATE POLICY "Public read active StayNas catalogue categories"
ON public.staynas_room_catalogue_categories
FOR SELECT TO anon,authenticated
USING (status='active');

DROP POLICY IF EXISTS "Public read active StayNas catalogue types" ON public.staynas_room_catalogue_types;
CREATE POLICY "Public read active StayNas catalogue types"
ON public.staynas_room_catalogue_types
FOR SELECT TO anon,authenticated
USING (status='active');

GRANT SELECT ON public.staynas_room_catalogue_categories, public.staynas_room_catalogue_types TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.staynas_room_catalogue_categories, public.staynas_room_catalogue_types TO authenticated;
REVOKE ALL ON public.staynas_platform_admins FROM anon,authenticated;
GRANT SELECT ON public.staynas_platform_admins TO authenticated;
