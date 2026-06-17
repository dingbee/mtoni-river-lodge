import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://mtoniriverlodge.com";

interface SitemapEntry {
  path: string;
  changefreq?: "weekly" | "monthly" | "yearly";
  priority?: string;
}

// Only canonical destinations — legacy/redirected URLs are intentionally excluded.
const ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/lodge", changefreq: "monthly", priority: "0.8" },
  { path: "/rooms", changefreq: "monthly", priority: "0.9" },
  { path: "/rooms/standard-river", changefreq: "monthly", priority: "0.7" },
  { path: "/rooms/riverfront-deluxe", changefreq: "monthly", priority: "0.7" },
  { path: "/rooms/family-room", changefreq: "monthly", priority: "0.7" },
  { path: "/suites", changefreq: "monthly", priority: "0.7" },
  { path: "/experiences", changefreq: "monthly", priority: "0.8" },
  { path: "/dining", changefreq: "monthly", priority: "0.8" },
  { path: "/pricing", changefreq: "monthly", priority: "0.7" },
  { path: "/plan", changefreq: "monthly", priority: "0.7" },
  { path: "/book", changefreq: "monthly", priority: "0.9" },
  { path: "/contact", changefreq: "monthly", priority: "0.7" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/journal", changefreq: "weekly", priority: "0.8" },
  { path: "/journal/perfect-arusha-stay-for-safari-travelers-2026", changefreq: "monthly", priority: "0.7" },
  { path: "/journal/discovering-arusha-through-nature-and-authentic-hospitality", changefreq: "monthly", priority: "0.7" },
  { path: "/journal/what-the-river-has-taught-us-about-time", changefreq: "monthly", priority: "0.7" },
  { path: "/journal/life-along-the-nduruma-river", changefreq: "monthly", priority: "0.7" },
  { path: "/journal/building-with-the-community", changefreq: "monthly", priority: "0.7" },
  { path: "/journal/the-architecture-of-disappearing", changefreq: "monthly", priority: "0.7" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = ENTRIES.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});