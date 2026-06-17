import { Stars } from "./Stars";
import { SOURCE_LABELS, type Review } from "@/lib/reviews";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function ReviewCard({ review, compact = false }: { review: Review; compact?: boolean }) {
  return (
    <article
      className={`group relative flex h-full flex-col justify-between rounded-2xl border border-charcoal/10 bg-ivory/90 ${
        compact ? "p-6" : "p-8 lg:p-9"
      } backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-charcoal/20`}
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 50px -36px rgba(60,50,30,0.32), 0 8px 22px -16px rgba(60,50,30,0.16)",
      }}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <Stars rating={review.rating} size="sm" />
          <span className="text-[0.6rem] uppercase tracking-[0.24em] text-charcoal/50">
            {SOURCE_LABELS[review.source]}
          </span>
        </div>
        {review.title && (
          <p className={`mt-4 font-display ${compact ? "text-base" : "text-lg lg:text-xl"} font-medium leading-snug text-charcoal/90`}>
            {review.title}
          </p>
        )}
        <p className={`mt-3 ${compact ? "text-[0.82rem]" : "text-sm"} leading-relaxed text-charcoal/75`}>
          &ldquo;{review.review_text}&rdquo;
        </p>
      </div>
      <div className="mt-7 border-t border-charcoal/10 pt-4">
        <p className="font-display text-base">{review.guest_name}</p>
        <p className="mt-1 text-[0.65rem] uppercase tracking-[0.26em] text-charcoal/55">
          {review.guest_location ? `${review.guest_location} · ` : ""}
          {formatDate(review.review_date)}
        </p>
      </div>
    </article>
  );
}