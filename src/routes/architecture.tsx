import { createFileRoute } from "@tanstack/react-router";
import { ProductSiteHeader, ProductSiteFooter } from "@/components/site/StayNasProductSite";
import { StayNasArchitecturePage } from "@/components/site/StayNasWebsiteEnhancements";
export const Route = createFileRoute("/architecture")({
  head: () => ({ meta: [{ title: "Platform Architecture | StayNas" }, { name: "description", content: "Understand the StayNas multi-tenant hospitality architecture, organisational model, property boundaries and connected services." }] }),
  component: () => <div className="staynas-public-site min-h-screen bg-[#f6f5ef] text-[#15251f]"><ProductSiteHeader/><StayNasArchitecturePage/><ProductSiteFooter/></div>,
});
