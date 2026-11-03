import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { HeroCinematic } from "@/components/site/HeroCinematic";
import { GuestReviews } from "@/components/site/GuestReviews";
import { LocationMap } from "@/components/site/LocationMap";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TrustedByGuestsSection } from "@/components/site/TrustedByGuestsSection";
import { WlhaAwarenessBanner } from "@/components/site/WlhaAwarenessBanner";
import { WhyMtoni } from "@/components/site/WhyMtoni";
import heroPoster from "@/assets/hero-forest-cottage-1600w.webp";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  // Keep auth callback payloads on the root URL working while allowing the
  // anonymous root route to render the public property homepage.
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
  },
  component: PublicHomePage,
});

function PublicHomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    // Staff landing behaviour is retained, but anonymous visitors now stay
    // on "/" and receive the actual public homepage.
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!cancelled && !error && data.user) {
        void navigate({ to: "/admin", replace: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-ivory text-charcoal">
      <SiteHeader />
      <main>
        <HeroCinematic
          poster={heroPoster}
          posterAlt="Forest cottage at Mtoni River Lodge in Arusha, Tanzania"
        />
        <WlhaAwarenessBanner />
        <WhyMtoni />
        <TrustedByGuestsSection />
        <GuestReviews />
        <LocationMap />
      </main>
      <SiteFooter />
    </div>
  );
}
