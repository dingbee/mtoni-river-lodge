import { getJournalPosts, type JournalPost, type JournalPostHref } from "@/lib/journal";
import fallbackCover from "@/assets/nduruma-river-flow.jpg";

export interface DbJournalRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  read_minutes: number | null;
  featured?: boolean | null;
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function toJournalPost(row: DbJournalRow): JournalPost {
  const published = row.published_at ?? new Date().toISOString();
  const iso = new Date(published);
  return {
    publishedAt: published.slice(0, 10),
    createdAt: published,
    date: MONTH_FMT.format(iso),
    read: `${row.read_minutes ?? 5} min`,
    title: row.title,
    excerpt: row.excerpt ?? "",
    img: row.cover_image_url || fallbackCover,
    // Cast: static href union is closed, but the JournalPost consumers only
    // use it as a plain string for <Link to={...}>.
    href: (`/journal/${row.slug}`) as JournalPostHref,
  };
}

/**
 * Merge DB-published journal articles with the static fallback list.
 * DB rows take precedence when the href matches a static entry.
 * Sorted newest-first by publishedAt (createdAt tiebreaker).
 */
export function mergeJournalPosts(dbRows: DbJournalRow[] | null | undefined): JournalPost[] {
  const staticPosts = getJournalPosts();
  const dbPosts = (dbRows ?? []).map(toJournalPost);
  const byHref = new Map<string, JournalPost>();
  for (const p of staticPosts) byHref.set(p.href, p);
  for (const p of dbPosts) byHref.set(p.href, p); // DB wins on collision
  return Array.from(byHref.values()).sort((a, b) => {
    const pub = b.publishedAt.localeCompare(a.publishedAt);
    if (pub !== 0) return pub;
    return b.createdAt.localeCompare(a.createdAt);
  });
}