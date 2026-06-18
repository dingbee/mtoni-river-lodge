import { Stars } from "./Stars";
import { useReviewAggregates, getAggregate } from "./useReviewData";
import { TRIPADVISOR_URL, GOOGLE_REVIEWS_URL, formatReviewCount } from "@/lib/reviews";

type Variant = "light" | "dark" | "subtle";

const variantClasses: Record<Variant, string> = {
  light: "bg-ivory text-charcoal border-charcoal/10",
  dark: "bg-charcoal/85 text-ivory border-ivory/15 backdrop-blur",
  subtle: "bg-bone text-charcoal border-charcoal/10",
};

export function TrustBar({ variant = "subtle", compact = false }: { variant?: Variant; compact?: boolean }) {
  const { data } = useReviewAggregates();
  const google = getAggregate(data, "google");
  const ta = getAggregate(data, "tripadvisor");

  // Don't render an empty shell on first paint with no data — still show static labels.
  const items: { label: string; url: string; agg: typeof google; source: "google" | "tripadvisor" }[] = [
    { label: "Google", url: GOOGLE_REVIEWS_URL, agg: google, source: "google" },
    { label: "Tripadvisor", url: TRIPADVISOR_URL, agg: ta, source: "tripadvisor" },
  ];

  return (
    <div
      className={`flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-3 border-y px-6 ${
        compact ? "py-3" : "py-4"
      } text-sm ${variantClasses[variant]}`}
    >
      {items.map((it) => (
        <a
          key={it.label}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Stars rating={it.agg?.average_rating ?? 5} size="sm" />
          <span className="font-display text-base leading-none">
            {it.agg ? it.agg.average_rating.toFixed(1) : "—"}
          </span>
          <span className="text-[0.65rem] uppercase tracking-[0.22em] opacity-75">
            {it.label}
            {it.agg ? ` · ${formatReviewCount(it.agg.review_count, it.source)} reviews` : ""}
          </span>
        </a>
      ))}
    </div>
  );
}