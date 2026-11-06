
-- Public read of published CMS pages
GRANT SELECT ON public.cms_pages TO anon;
CREATE POLICY "cms_pages public read published" ON public.cms_pages
  FOR SELECT TO anon USING (status = 'published');

-- Public read of blocks belonging to published pages
GRANT SELECT ON public.cms_blocks TO anon;
CREATE POLICY "cms_blocks public read published" ON public.cms_blocks
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.cms_pages p WHERE p.id = cms_blocks.page_id AND p.status = 'published')
  );

-- Public read of SEO overrides (safe metadata, no PII)
GRANT SELECT ON public.seo_overrides TO anon;
CREATE POLICY "seo_overrides public read" ON public.seo_overrides
  FOR SELECT TO anon USING (true);
