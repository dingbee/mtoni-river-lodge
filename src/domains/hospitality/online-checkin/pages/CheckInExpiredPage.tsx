import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { CheckInPlaceholder } from "../components/CheckInPlaceholder";

export function CheckInExpiredPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <CheckInPlaceholder
          eyebrow="Online check-in"
          title="This check-in link has expired"
          description="For your security, online check-in links are time limited. Please contact reception and we will send you a fresh link."
        >
          <Link
            to="/contact"
            className="rounded-full border border-border px-5 py-2 text-xs uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-muted"
          >
            Contact reception
          </Link>
        </CheckInPlaceholder>
      </main>
      <SiteFooterMinimal />
    </>
  );
}