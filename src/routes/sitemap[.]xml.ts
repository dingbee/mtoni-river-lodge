import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { BASE_URL, xmlResponse } from "@/lib/sitemap-data";

const SITEMAPS = [
  "sitemap-pages.xml",
  "sitemap-accommodation.xml",
  "sitemap-journal.xml",
  "sitemap-images.xml",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const lastmod = new Date().toISOString();
        const items = SITEMAPS.map(
          (s) =>
            `  <sitemap>\n    <loc>${BASE_URL}/${s}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
        );
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...items,
          `</sitemapindex>`,
        ].join("\n");
        return xmlResponse(xml);
      },
    },
  },
});