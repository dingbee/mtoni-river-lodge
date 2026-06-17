import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { ACCOMMODATION_ENTRIES, urlsetXml, xmlResponse } from "@/lib/sitemap-data";

export const Route = createFileRoute("/sitemap-accommodation.xml")({
  server: {
    handlers: {
      GET: async () => xmlResponse(urlsetXml(ACCOMMODATION_ENTRIES)),
    },
  },
});