import { ClientOnly } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInWizard } from "../components/CheckInWizard";

export function GuestCheckInPage({ token }: { token: string }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <ClientOnly fallback={<Skeleton className="h-72 w-full" />}>
          <CheckInWizard token={token} />
        </ClientOnly>
      </main>
      <SiteFooterMinimal />
    </>
  );
}
