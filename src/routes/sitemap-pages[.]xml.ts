import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { PAGE_ENTRIES, urlsetXml, xmlResponse } from "@/lib/sitemap-data";

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: {
    handlers: {
      GET: async () => xmlResponse(urlsetXml(PAGE_ENTRIES)),
    },
  },
});