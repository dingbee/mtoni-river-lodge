import { createFileRoute } from "@tanstack/react-router";
import { ProductInfoPage } from "@/components/site/StayNasProductSite";
export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations & Ecosystem | StayNas" }, { name: "description", content: "Explore the StayNas connected hospitality ecosystem, including booking distribution, payment providers, property websites and specialist systems." }] }),
  component: () => <ProductInfoPage page="integrations" />,
});
