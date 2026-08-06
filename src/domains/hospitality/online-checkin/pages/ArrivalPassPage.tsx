import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInPlaceholder } from "../components/CheckInPlaceholder";
import { ArrivalPassCard } from "../components/ArrivalPassCard";
import { fetchArrivalPass } from "../services/arrival-pass-client";

export function ArrivalPassPage({ passToken }: { passToken: string }) {
  const query = useQuery({
    queryKey: ["arrival-pass", passToken],
    queryFn: () => fetchArrivalPass(passToken),
    retry: false,
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        {query.isLoading ? (
          <Skeleton className="mx-auto h-[520px] w-full max-w-md rounded-[20px]" />
        ) : query.isError || !query.data ? (
          <CheckInPlaceholder
            eyebrow="Arrival pass"
            title="This arrival pass is not available"
            description="The link is invalid or has been replaced. Open the most recent link from your check-in confirmation, or contact reception and we will help you on arrival."
          >
            <Link
              to="/"
              className="rounded-full border border-border px-5 py-2 text-xs uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-muted"
            >
              Back to Mtoni
            </Link>
          </CheckInPlaceholder>
        ) : (
          <>
            <ArrivalPassCard pass={query.data.pass} stay={query.data.stay} />
            <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">
              Show this screen at reception. Save the link — you can reopen your pass any time
              before arrival.
            </p>
          </>
        )}
      </main>
      <SiteFooterMinimal />
    </>
  );
}