import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  ACCOMMODATION_ENTRIES,
  PAGE_ENTRIES,
  getJournalEntriesAsync,
  urlsetXml,
  xmlResponse,
} from "@/lib/sitemap-data";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [
          ...PAGE_ENTRIES,
          ...ACCOMMODATION_ENTRIES,
          ...(await getJournalEntriesAsync()),
        ];
        return xmlResponse(urlsetXml(entries));
      },
    },
  },
});