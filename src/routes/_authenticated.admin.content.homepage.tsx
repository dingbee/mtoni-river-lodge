import { createFileRoute } from "@tanstack/react-router";
import { SlugPageRedirector } from "@/components/os/content/SlugPageRedirector";

export const Route = createFileRoute("/_authenticated/admin/content/homepage")({
  head: () => ({ meta: [{ title: "Homepage — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <SlugPageRedirector slug="homepage" title="Homepage" route_path="/" description="Marketing homepage sections." />
  ),
});
