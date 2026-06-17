import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  BASE_URL,
  getImageGroups,
  xmlEscape,
  xmlResponse,
} from "@/lib/sitemap-data";

export const Route = createFileRoute("/sitemap-images.xml")({
  server: {
    handlers: {
      GET: async () => {
        const groups = getImageGroups();
        const urls = groups.map((g) => {
          const images = g.images
            .map(
              (img) =>
                `    <image:image>\n      <image:loc>${xmlEscape(img.loc)}</image:loc>\n      <image:caption>${xmlEscape(img.caption)}</image:caption>\n    </image:image>`,
            )
            .join("\n");
          return [
            `  <url>`,
            `    <loc>${BASE_URL}${g.path}</loc>`,
            `    <lastmod>${g.lastmod}</lastmod>`,
            images,
            `  </url>`,
          ].join("\n");
        });
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
          `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
          ...urls,
          `</urlset>`,
        ].join("\n");
        return xmlResponse(xml);
      },
    },
  },
});