import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { getJournalEntriesAsync, urlsetXml, xmlResponse } from "@/lib/sitemap-data";

export const Route = createFileRoute("/sitemap-journal.xml")({
  server: {
    handlers: {
      GET: async () => xmlResponse(urlsetXml(await getJournalEntriesAsync())),
    },
  },
});