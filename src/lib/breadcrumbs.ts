import { useRouterState } from "@tanstack/react-router";
import { getJournalPosts } from "@/lib/journal";

export type Crumb = {
  name: string;
  /** Omit on the current (last) page so it renders as non-clickable. */
  to?: string;
};

/**
 * Explicit label overrides for known paths. Anything not listed here is
 * derived automatically from the URL slug (title-cased), so new pages and
 * journal articles inherit breadcrumbs without manual setup.
 */
const PATH_LABELS: Record<string, string> = {
  "/lodge": "About Mtoni",
  "/rooms": "Accommodation",
  "/rooms/standard-river": "Standard River Room",
  "/rooms/riverfront-deluxe": "Riverfront Deluxe",
  "/rooms/family-room": "Family Room",
  "/experiences": "Experiences",
  "/dining": "Dining",
  "/journal": "Journal",
  "/contact": "Contact",
  "/book": "Book",
  "/plan": "Plan Your Stay",
  "/pricing": "Pricing",
  "/terms": "Terms",
  "/faq": "FAQ",
  "/vote": "Vote",
};

function titleCase(seg: string): string {
  return seg
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

function labelFor(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  if (path.startsWith("/journal/")) {
    const post = getJournalPosts().find((p) => p.href === path);
    if (post) return post.title;
  }
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  return titleCase(seg);
}

/** Build a Home > … > Current trail from any pathname. */
export function buildTrail(pathname: string): Crumb[] {
  const clean = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  if (clean === "/" || clean === "") return [{ name: "Home" }];
  const segs = clean.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ name: "Home", to: "/" }];
  let acc = "";
  for (let i = 0; i < segs.length; i++) {
    acc += "/" + segs[i];
    const isLast = i === segs.length - 1;
    crumbs.push({ name: labelFor(acc), to: isLast ? undefined : acc });
  }
  return crumbs;
}

/** Reactive trail for the current route. */
export function useBreadcrumbTrail(): Crumb[] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return buildTrail(pathname);
}
