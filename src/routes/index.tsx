import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProductHomePage } from "@/components/site/StayNasProductSite";

export const Route = createFileRoute("/")({
  // staynas.com is the product website. The application and property hosts
  // retain their existing root routing behaviour.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const query = new URLSearchParams(location.searchStr);
    const hash = new URLSearchParams(
      location.hash.startsWith("#") ? location.hash.slice(1) : location.hash,
    );
    const hasAuthPayload =
      query.has("code") ||
      query.has("token_hash") ||
      (query.get("type") === "recovery" &&
        (query.has("error") || query.has("error_description"))) ||
      (hash.has("access_token") && hash.has("refresh_token")) ||
      hash.has("error") ||
      hash.has("error_description");

    if (hasAuthPayload) {
      throw redirect({
        href: `/auth/callback${location.searchStr}${location.hash}`,
      });
    }

    const hostname =
      typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
    const isProductWebsiteHost =
      hostname === "staynas.com" ||
      hostname === "www.staynas.com" ||
      hostname.startsWith("staynas-website-") ||
      query.get("staynas-site") === "preview";

    if (isProductWebsiteHost) return;

    // Product website hosts render the marketing homepage. The application
    // host has a deterministic public landing route and must not depend on
    // Supabase auth availability merely to open the site.
    throw redirect({ to: "/rooms" });
  },
  component: ProductHomePage,
});
