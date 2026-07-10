import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { findNavByHref } from "./nav-config";

// Derive breadcrumbs from the current match tree by matching the pathname
// against the nav registry. Falls back to path segments.
export function Breadcrumbs() {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const pathname = last?.pathname ?? "/";
  if (!pathname.startsWith("/admin")) return null;

  const parts = pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let acc = "";
  for (const part of parts) {
    acc += "/" + part;
    const hit = findNavByHref(acc);
    const label =
      hit.item?.label ??
      hit.group?.label ??
      part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, href: acc });
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
              {isLast ? (
                <span className="truncate font-medium text-foreground">{c.label}</span>
              ) : (
                <Link to={c.href} className="truncate hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}