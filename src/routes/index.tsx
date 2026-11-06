import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  // Auth state is persisted in browser storage; resolve the staff destination on
  // the client so public visitors and authenticated staff receive different roots.
  ssr: false,
  beforeLoad: async ({ location }) => {
    // The Nolmark PBN hostname is a property guest entry point, not the StayNas OS home.
    // Keep the branded host and enter the published property booking experience.
    if (typeof window !== "undefined" && window.location.hostname === "nolmarkcdma.staynas.com") {
      throw redirect({ href: "/nolmark-cdma-staynas" });
    }
    // Supabase email templates may return auth payloads to the configured Site URL
    // ("/") instead of the explicit redirectTo URL. Preserve credentials first.
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

    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      throw redirect({ to: "/admin" });
    }

    throw redirect({ to: "/rooms" });
  },
});
