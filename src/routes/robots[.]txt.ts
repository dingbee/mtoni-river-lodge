import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const hostname = new URL(request.url).hostname.toLowerCase();
        const isStayNasHost = hostname === "staynas.com" || hostname === "www.staynas.com";
        const isMtoniHost = hostname === "mtoniriverlodge.com" || hostname === "www.mtoniriverlodge.com";
        const body = isStayNasHost
          ? "User-agent: *\nAllow: /\nDisallow: /guest/\n\nSitemap: https://staynas.com/sitemap.xml\n"
          : isMtoniHost
            ? "User-agent: *\nAllow: /\nDisallow: /wp-admin/\nDisallow: /wp-content/\nDisallow: /wp-includes/\nDisallow: /wp-json/\nDisallow: /category/\nDisallow: /tag/\nDisallow: /author/\nDisallow: /hello-world/\nDisallow: /?p=\nDisallow: /feed/\n\nSitemap: https://mtoniriverlodge.com/sitemap.xml\n"
            : [
              "User-agent: *",
              "Disallow: /guest/",
              "Disallow: /wp-admin/",
              "Disallow: /wp-content/",
              "Disallow: /wp-includes/",
              "Disallow: /wp-json/",
              "Disallow: /category/",
              "Disallow: /tag/",
              "Disallow: /author/",
              "Disallow: /hello-world/",
              "Disallow: /?p=",
              "Disallow: /feed/",
              "",
            ].join("\n");
        return new Response(body, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
