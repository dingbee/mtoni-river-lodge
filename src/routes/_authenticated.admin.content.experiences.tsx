import { createFileRoute } from "@tanstack/react-router";
import { SlugPageRedirector } from "@/components/os/content/SlugPageRedirector";

export const Route = createFileRoute("/_authenticated/admin/content/experiences")({
  head: () => ({ meta: [{ title: "Experiences — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <SlugPageRedirector slug="experiences-landing" title="Experiences" route_path="/experiences" description="Experiences landing page." />
  ),
});
