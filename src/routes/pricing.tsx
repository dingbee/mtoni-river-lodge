import { createFileRoute } from "@tanstack/react-router";
import { ProductSiteHeader, ProductSiteFooter } from "@/components/site/StayNasProductSite";
import { StayNasCommercialPage } from "@/components/site/StayNasWebsiteEnhancements";
export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Plans & Pricing | StayNas" }, { name: "description", content: "Explore StayNas Essential, Professional and Enterprise commercial plans, hybrid property pricing, add-ons and trial options." }] }),
  component: () => <div className="staynas-public-site min-h-screen bg-[#F6F2F1] text-[#2A2725]"><ProductSiteHeader/><StayNasCommercialPage/><ProductSiteFooter/></div>,
});
