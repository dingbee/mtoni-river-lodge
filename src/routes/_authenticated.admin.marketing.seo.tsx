import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/marketing/seo")({
  head: () => ({ meta: [{ title: "SEO — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="SEO" description="Metadata, schema, sitemaps and search health." />,
});
