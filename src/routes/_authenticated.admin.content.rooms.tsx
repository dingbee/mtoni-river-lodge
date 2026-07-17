import { createFileRoute } from "@tanstack/react-router";
import { SlugPageRedirector } from "@/components/os/content/SlugPageRedirector";

export const Route = createFileRoute("/_authenticated/admin/content/rooms")({
  head: () => ({ meta: [{ title: "Rooms content — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <SlugPageRedirector slug="rooms-landing" title="Rooms" route_path="/rooms" description="Rooms landing page." />
  ),
});
