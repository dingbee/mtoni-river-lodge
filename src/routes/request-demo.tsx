import { createFileRoute } from "@tanstack/react-router";
import { ProductInfoPage } from "@/components/site/StayNasProductSite";
export const Route = createFileRoute("/request-demo")({
  head: () => ({ meta: [{ title: "Request a StayNas Demonstration" }, { name: "description", content: "Arrange a StayNas product walkthrough for your hospitality property or group." }] }),
  component: () => <ProductInfoPage page="demo" />,
});
