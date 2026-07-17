import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { urlsetXml, xmlResponse, type PageEntry } from "@/lib/sitemap-data";
import { listPublishedCmsSlugs } from "@/domains/content/pages/pages-public.functions";

export const Route = createFileRoute("/sitemap-cms.xml")({
  server: {
    handlers: {
      GET: async () => {
        const rows = await listPublishedCmsSlugs();
        const entries: PageEntry[] = rows.map((r) => ({
          path: `/p/${r.slug}`,
          lastmod: (r.updated_at ?? new Date().toISOString()).slice(0, 10),
          changefreq: "weekly",
          priority: "0.6",
        }));
        return xmlResponse(urlsetXml(entries));
      },
    },
  },
});