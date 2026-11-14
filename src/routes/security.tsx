import { createFileRoute } from "@tanstack/react-router";
import { ProductSiteHeader, ProductSiteFooter } from "@/components/site/StayNasProductSite";
import { StayNasSecurityPage } from "@/components/site/StayNasWebsiteEnhancements";
export const Route = createFileRoute("/security")({
  head: () => ({ meta: [{ title: "Trust & Security | StayNas" }, { name: "description", content: "Explore StayNas security principles: property-scoped access, role-aware permissions, server-side secrets and integration governance." }] }),
  component: () => <div className="staynas-public-site min-h-screen bg-[#F6F2F1] text-[#2A2725]"><ProductSiteHeader/><StayNasSecurityPage/><ProductSiteFooter/></div>,
});
