import { createFileRoute } from "@tanstack/react-router";
import { ProductSiteHeader, ProductSiteFooter } from "@/components/site/StayNasProductSite";
import { StayNasSecurityPage } from "@/components/site/StayNasWebsiteEnhancements";
export const Route = createFileRoute("/security")({
  head: () => ({ meta: [{ title: "Trust & Security | StayNas" }, { name: "description", content: "Explore StayNas security principles: property-scoped access, role-aware permissions, server-side secrets and integration governance." }] }),
  component: () => <div className="staynas-public-site min-h-screen bg-[#f6f5ef] text-[#15251f]"><ProductSiteHeader/><StayNasSecurityPage/><ProductSiteFooter/></div>,
});
