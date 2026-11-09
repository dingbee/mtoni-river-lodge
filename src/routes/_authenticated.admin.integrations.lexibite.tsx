import { createFileRoute } from "@tanstack/react-router";
import { StayNasLexiBiteIntegration } from "@/components/os/StayNasLexiBiteIntegration";

export const Route = createFileRoute("/_authenticated/admin/integrations/lexibite")({
  head: () => ({
    meta: [
      { title: "StayNas × LexiBite Integration — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StayNasLexiBiteIntegration,
});
