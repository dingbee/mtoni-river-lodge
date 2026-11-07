import { createFileRoute } from "@tanstack/react-router";
import { ProductInfoPage } from "@/components/site/StayNasProductSite";
export const Route = createFileRoute("/platform")({
  head: () => ({ meta: [{ title: "Platform Capabilities | StayNas" }, { name: "description", content: "Explore the StayNas Hospitality Operating System: reservations, guest experience, property operations, finance and intelligence." }] }),
  component: () => <ProductInfoPage page="platform" />,
});
