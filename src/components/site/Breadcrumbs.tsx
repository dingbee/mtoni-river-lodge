import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useBreadcrumbTrail, type Crumb } from "@/lib/breadcrumbs";

type Variant = "light" | "dark";

type Props = {
  /** "light" for placement over dark hero imagery, "dark" for ivory pages. */
  variant?: Variant;
  className?: string;
  /** Optional override for the auto-derived trail. */
  items?: Crumb[];
};

/**
 * SEO-friendly breadcrumb navigation.
 *
 * - Renders a visible <nav aria-label="Breadcrumb"> with semantic <ol>/<li>.
 * - Emits Schema.org BreadcrumbList JSON-LD inline.
 * - Auto-derives the trail from the current pathname; future pages and
 *   journal articles inherit breadcrumbs with no per-route wiring.
 * - The last item represents the current page and is rendered as a
 *   non-clickable <span aria-current="page">.
 */
export function Breadcrumbs({ variant = "dark", className = "", items }: Props) {
  const auto = useBreadcrumbTrail();
  const trail = items ?? auto;

  // Hide on the homepage — a single-item "Home" breadcrumb adds no value.
  if (trail.length < 2) return null;

  const base =
    variant === "light" ? "text-ivory/75" : "text-charcoal/55";
  const active =
    variant === "light" ? "text-ivory" : "text-charcoal";
  const hover =
    variant === "light" ? "hover:text-ivory" : "hover:text-[var(--gold)]";

  return (
    <nav
        aria-label="Breadcrumb"
        className={`text-[0.68rem] uppercase tracking-[0.22em] ${base} ${className}`}
      >
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {trail.map((c, i) => {
            const isLast = i === trail.length - 1;
            return (
              <li key={`${c.name}-${i}`} className="flex items-center gap-2">
                {c.to && !isLast ? (
                  <Link to={c.to} className={`transition-colors ${hover}`}>
                    {c.name}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={active}
                  >
                    {c.name}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight
                    className="h-3 w-3 opacity-50"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
    </nav>
  );
}

/**
 * Standalone breadcrumb bar for pages that don't use PageHero / ArticleLayout.
 * Sits below the fixed site header with consistent spacing.
 */
export function BreadcrumbsBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`border-b border-border bg-ivory px-6 pt-28 pb-5 lg:px-12 lg:pt-32 ${className}`}
    >
      <div className="mx-auto max-w-[1500px]">
        <Breadcrumbs variant="dark" />
      </div>
    </div>
  );
}
