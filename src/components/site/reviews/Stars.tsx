import { Star } from "lucide-react";

export function Stars({ rating = 5, size = "sm" }: { rating?: number; size?: "xs" | "sm" | "md" | "lg" }) {
  const px = size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : size === "md" ? "h-4 w-4" : "h-5 w-5";
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5 text-gold" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${px} ${i < rounded ? "fill-current" : "fill-none text-gold/30"}`}
          strokeWidth={i < rounded ? 0 : 1.5}
        />
      ))}
    </span>
  );
}