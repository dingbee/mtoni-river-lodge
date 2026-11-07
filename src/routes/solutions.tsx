import { createFileRoute } from "@tanstack/react-router";
import { ProductInfoPage } from "@/components/site/StayNasProductSite";
export const Route = createFileRoute("/solutions")({
  head: () => ({ meta: [{ title: "Hospitality Solutions | StayNas" }, { name: "description", content: "StayNas solutions for hotels, boutique properties, lodges, resorts and multi-property hospitality operators." }] }),
  component: () => <ProductInfoPage page="solutions" />,
});
