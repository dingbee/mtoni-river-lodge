import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { CheckInPlaceholder } from "../components/CheckInPlaceholder";

export function GuestCheckInPage({ token }: { token: string }) {
  return (
    <>
      <SiteHeader />
      <main>
        <CheckInPlaceholder
          eyebrow="Online check-in"
          title="Your arrival, prepared in advance"
          description="Guest check-in opens here shortly. You will confirm your details, arrival time, and any special requests before you travel."
        >
          <span className="rounded-full border border-border px-4 py-2 text-xs tracking-wide text-muted-foreground">
            Reference: {token}
          </span>
          <Link
            to="/"
            className="rounded-full border border-border px-5 py-2 text-xs uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-muted"
          >
            Back to Mtoni
          </Link>
        </CheckInPlaceholder>
      </main>
      <SiteFooterMinimal />
    </>
  );
}
