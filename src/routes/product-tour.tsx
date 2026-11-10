import { createFileRoute } from "@tanstack/react-router";
import { ProductSiteHeader, ProductSiteFooter } from "@/components/site/StayNasProductSite";
import { StayNasProductTourPage } from "@/components/site/StayNasWebsiteEnhancements";
export const Route = createFileRoute("/product-tour")({
  head: () => ({ meta: [{ title: "Product Walkthrough | StayNas" }, { name: "description", content: "Follow the StayNas guest journey from discovery and booking through arrival, operations, service and departure." }] }),
  component: () => <div className="staynas-public-site min-h-screen bg-[#f6f5ef] text-[#15251f]"><ProductSiteHeader/><StayNasProductTourPage/><ProductSiteFooter/></div>,
});
