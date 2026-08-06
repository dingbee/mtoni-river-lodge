import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { CheckInPlaceholder } from "../components/CheckInPlaceholder";

export function CheckInSuccessPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <CheckInPlaceholder
          eyebrow="Online check-in"
          title="Check-in received"
          description="Thank you. Our reception team will review your details and confirm everything before your arrival at Mtoni River Lodge."
        >
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