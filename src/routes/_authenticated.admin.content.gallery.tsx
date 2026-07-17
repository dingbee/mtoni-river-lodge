import { createFileRoute } from "@tanstack/react-router";
import { SlugPageRedirector } from "@/components/os/content/SlugPageRedirector";

export const Route = createFileRoute("/_authenticated/admin/content/gallery")({
  head: () => ({ meta: [{ title: "Gallery — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <SlugPageRedirector slug="gallery-landing" title="Gallery" route_path="/gallery" description="Gallery landing page." />
  ),
});
