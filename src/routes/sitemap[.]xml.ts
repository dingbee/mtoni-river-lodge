import { createFileRoute } from "@tanstack/react-router";

const urls = [
  "/",
  "/platform",
  "/modules",
  "/product-tour",
  "/solutions",
  "/integrations",
  "/architecture",
  "/security",
  "/pricing",
  "/request-demo",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const hostname = new URL(request.url).hostname.toLowerCase();
        if (hostname !== "staynas.com" && hostname !== "www.staynas.com") {
          return new Response("Not found", { status: 404 });
        }
        const entries = urls.map((path) => `  <url><loc>https://staynas.com${path}</loc></url>`).join("\n");
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
        return new Response(body, {
          headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
