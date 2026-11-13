import { createFileRoute } from "@tanstack/react-router";
import { ProductSiteHeader, ProductSiteFooter } from "@/components/site/StayNasProductSite";
import { StayNasModulesPage } from "@/components/site/StayNasWebsiteEnhancements";
export const Route = createFileRoute("/modules")({
  head: () => ({ meta: [{ title: "StayNas Modules | Hospitality Operating System" }, { name: "description", content: "Explore StayNas modules for reservations, rooms, front desk, housekeeping, guests, finance, revenue, AI, automation and multi-property management." }] }),
  component: () => <div className="staynas-public-site min-h-screen bg-[#F6F2F1] text-[#2A2725]"><ProductSiteHeader/><StayNasModulesPage/><ProductSiteFooter/></div>,
});
