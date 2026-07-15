
-- ============================================================
-- Sprint 5 · CMIS Phase 1 — Content & Marketing foundations
-- ============================================================

-- Reuse existing set_updated_at() trigger fn (already defined in project).

-- Staff-check helper: any staff role can manage CMIS content.
-- (public.is_any_staff already exists — we use it in every policy.)

-- ---------- CMS pages ------------------------------------------------
CREATE TYPE public.cms_page_status AS ENUM ('draft','review','scheduled','published','archived');

CREATE TABLE public.cms_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status public.cms_page_status NOT NULL DEFAULT 'draft',
  route_path TEXT,
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_pages TO authenticated;
GRANT ALL ON public.cms_pages TO service_role;
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cms_pages_staff_all" ON public.cms_pages FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER cms_pages_updated_at BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- CMS page versions ---------------------------------------
CREATE TABLE public.cms_page_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_page_versions TO authenticated;
GRANT ALL ON public.cms_page_versions TO service_role;
ALTER TABLE public.cms_page_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cms_page_versions_staff_all" ON public.cms_page_versions FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

-- ---------- CMS blocks ----------------------------------------------
CREATE TYPE public.cms_block_kind AS ENUM (
  'hero','rich_text','image_gallery','cta','reviews','rooms','experiences',
  'faq','video','statistics','contact','map'
);

CREATE TABLE public.cms_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  kind public.cms_block_kind NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cms_blocks_page_idx ON public.cms_blocks(page_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_blocks TO authenticated;
GRANT ALL ON public.cms_blocks TO service_role;
ALTER TABLE public.cms_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cms_blocks_staff_all" ON public.cms_blocks FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER cms_blocks_updated_at BEFORE UPDATE ON public.cms_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- SEO overrides (keyed by route path) ---------------------
CREATE TABLE public.seo_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_path TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  keywords TEXT[],
  canonical_url TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  twitter_title TEXT,
  twitter_description TEXT,
  twitter_image TEXT,
  twitter_card TEXT DEFAULT 'summary_large_image',
  robots TEXT DEFAULT 'index,follow',
  index_status BOOLEAN NOT NULL DEFAULT true,
  schema_type TEXT,
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_overrides TO authenticated;
GRANT ALL ON public.seo_overrides TO service_role;
ALTER TABLE public.seo_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seo_overrides_staff_all" ON public.seo_overrides FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER seo_overrides_updated_at BEFORE UPDATE ON public.seo_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Media library --------------------------------------------
CREATE TABLE public.media_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES public.media_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders TO authenticated;
GRANT ALL ON public.media_folders TO service_role;
ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_folders_staff_all" ON public.media_folders FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER media_folders_updated_at BEFORE UPDATE ON public.media_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID REFERENCES public.media_folders(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  caption TEXT,
  content_hash TEXT,
  tags TEXT[],
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_hash_idx ON public.media_assets(content_hash);
CREATE INDEX media_assets_folder_idx ON public.media_assets(folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_assets_staff_all" ON public.media_assets FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER media_assets_updated_at BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.media_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  used_in_type TEXT NOT NULL,       -- e.g. 'cms_page','cms_block','journal_article','room','experience'
  used_in_id TEXT NOT NULL,
  field TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, used_in_type, used_in_id, field)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_usage TO authenticated;
GRANT ALL ON public.media_usage TO service_role;
ALTER TABLE public.media_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_usage_staff_all" ON public.media_usage FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));

-- ---------- Brand tokens --------------------------------------------
CREATE TABLE public.brand_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,          -- 'palette.primary','font.display','tone.voice','photo.guidelines','copy.guidelines','logo.primary'
  category TEXT NOT NULL,            -- 'color','font','logo','tone','photography','copywriting'
  label TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_tokens TO authenticated;
GRANT ALL ON public.brand_tokens TO service_role;
ALTER TABLE public.brand_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_tokens_staff_all" ON public.brand_tokens FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER brand_tokens_updated_at BEFORE UPDATE ON public.brand_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Campaigns ------------------------------------------------
CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','running','paused','completed','archived');

CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT,
  audience TEXT,
  landing_page TEXT,
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  status public.campaign_status NOT NULL DEFAULT 'draft',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  associated_content JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_staff_all" ON public.campaigns FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Content calendar ----------------------------------------
CREATE TYPE public.calendar_entry_type AS ENUM ('journal','homepage','campaign','promotion','social','other');

CREATE TABLE public.content_calendar_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_type public.calendar_entry_type NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  linked_type TEXT,     -- 'cms_page','journal_article','campaign', ...
  linked_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX calendar_entries_time_idx ON public.content_calendar_entries(scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_calendar_entries TO authenticated;
GRANT ALL ON public.content_calendar_entries TO service_role;
ALTER TABLE public.content_calendar_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_entries_staff_all" ON public.content_calendar_entries FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER calendar_entries_updated_at BEFORE UPDATE ON public.content_calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- AI suggestions queue ------------------------------------
CREATE TYPE public.ai_suggestion_status AS ENUM ('pending','approved','rejected','applied');
CREATE TYPE public.ai_suggestion_kind AS ENUM (
  'seo_title','seo_meta','seo_keywords','internal_links','faq',
  'alt_text','testimonial_summary','related_articles','other'
);

CREATE TABLE public.ai_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind public.ai_suggestion_kind NOT NULL,
  target_type TEXT NOT NULL,           -- 'cms_page','journal_article','media_asset','route'
  target_id TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggestion JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.ai_suggestion_status NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_suggestions_target_idx ON public.ai_suggestions(target_type, target_id);
CREATE INDEX ai_suggestions_status_idx ON public.ai_suggestions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_suggestions TO authenticated;
GRANT ALL ON public.ai_suggestions TO service_role;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_suggestions_staff_all" ON public.ai_suggestions FOR ALL
  USING (public.is_any_staff(auth.uid())) WITH CHECK (public.is_any_staff(auth.uid()));
CREATE TRIGGER ai_suggestions_updated_at BEFORE UPDATE ON public.ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
