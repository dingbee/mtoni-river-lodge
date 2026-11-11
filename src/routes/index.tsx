import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProductHomePage } from "@/components/site/StayNasProductSite";
import { supabase } from "@/integrations/supabase/client";

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

    // The StayNas marketing website and the property PBN are separate
    // host experiences. The app host is the staff/admin entry point.
    const isMarketingHost =
      hostname === "staynas.com" ||
      hostname === "www.staynas.com" ||
      hostname.startsWith("staynas-website-") ||
      query.get("staynas-site") === "preview";
    if (isMarketingHost) return;

    // Admin root: authenticated users go to their authorised workspace;
    // unauthenticated users go to the staff sign-in screen.
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });

      let isFounder = false;
      try {
        const result = await (supabase as any).rpc(
          "commercial_is_founder_admin",
          { _principal_id: data.user.id },
        );
        isFounder = !result.error && result.data === true;
      } catch {
        // Founder elevation fails closed; normal staff routing remains.
      }
      throw redirect({ to: isFounder ? "/founder" : "/admin/bookings" });
    } catch (error) {
      // Preserve intentional router redirects; authentication/network failures
      // must return the visitor to the sign-in screen, not the global error page.
      if (error && typeof error === "object" && "options" in error) throw error;
      throw redirect({ to: "/auth" });
    }
  },
  component: ProductHomePage,
});
