import type { ComponentType } from "react";
import { Calendar, MessageSquare, Newspaper, Bed, Star, Settings as SettingsIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
  providerId: string;
};

export type SearchProvider = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  search: (query: string) => Promise<SearchResult[]>;
};

const LIMIT = 6;

// PostgREST `ilike` needs `%` wildcards escaped for special chars.
function like(q: string) {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

const bookingsProvider: SearchProvider = {
  id: "bookings",
  label: "Reservations",
  icon: Calendar,
  async search(q) {
    const pattern = like(q);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, reference, guest_name, guest_email, check_in, check_out")
      .or(
        `reference.ilike.${pattern},guest_name.ilike.${pattern},guest_email.ilike.${pattern}`,
      )
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (error) return [];
    return (data ?? []).map((b) => ({
      id: `booking:${b.id}`,
      title: `${b.reference} — ${b.guest_name}`,
      subtitle: `${b.check_in} → ${b.check_out}`,
      href: `/admin/bookings/${b.id}`,
      icon: Calendar,
      providerId: "bookings",
    }));
  },
};

const guestsProvider: SearchProvider = {
  id: "guests",
  label: "Guests",
  icon: MessageSquare,
  async search(q) {
    const pattern = like(q);
    const { data, error } = await supabase
      .from("guests")
      .select("id, full_name, email, phone_e164, country")
      .or(
        `full_name.ilike.${pattern},email.ilike.${pattern},phone_e164.ilike.${pattern}`,
      )
      .eq("is_deleted", false)
      .limit(LIMIT);
    if (error) return [];
    return (data ?? []).map((g) => ({
      id: `guest:${g.id}`,
      title: g.full_name,
      subtitle: g.email ?? g.phone_e164 ?? g.country ?? undefined,
      href: `/admin/guests/${g.id}`,
      icon: MessageSquare,
      providerId: "guests",
    }));
  },
};

const reviewsProvider: SearchProvider = {
  id: "reviews",
  label: "Reviews",
  icon: Star,
  async search(q) {
    const pattern = like(q);
    const { data, error } = await supabase
      .from("reviews")
      .select("id, guest_name, title, rating, review_date")
      .or(`guest_name.ilike.${pattern},title.ilike.${pattern},review_text.ilike.${pattern}`)
      .order("review_date", { ascending: false })
      .limit(LIMIT);
    if (error) return [];
    return (data ?? []).map((r) => ({
      id: `review:${r.id}`,
      title: r.title ?? `Review from ${r.guest_name}`,
      subtitle: `${r.rating}★ · ${r.review_date}`,
      href: `/admin/reviews`,
      icon: Star,
      providerId: "reviews",
    }));
  },
};

const journalProvider: SearchProvider = {
  id: "journal",
  label: "Journal",
  icon: Newspaper,
  async search(q) {
    const pattern = like(q);
    const { data, error } = await supabase
      .from("journal_articles")
      .select("id, title, slug, status, published_at")
      .or(`title.ilike.${pattern},slug.ilike.${pattern},excerpt.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(LIMIT);
    if (error) return [];
    return (data ?? []).map((a) => ({
      id: `journal:${a.id}`,
      title: a.title,
      subtitle: `${a.status}${a.published_at ? ` · ${a.published_at.slice(0, 10)}` : ""}`,
      href: `/admin/content/journal/${a.id}`,
      icon: Newspaper,
      providerId: "journal",
    }));
  },
};

const roomsProvider: SearchProvider = {
  id: "rooms",
  label: "Rooms",
  icon: Bed,
  async search(q) {
    const pattern = like(q);
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, slug, base_price, currency")
      .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
      .order("sort_order", { ascending: true })
      .limit(LIMIT);
    if (error) return [];
    return (data ?? []).map((r) => ({
      id: `room:${r.id}`,
      title: r.name,
      subtitle: `${r.currency} ${r.base_price}`,
      href: `/admin/content/rooms/${r.id}`,
      icon: Bed,
      providerId: "rooms",
    }));
  },
};

const pagesProvider: SearchProvider = {
  id: "pages",
  label: "Pages",
  icon: SettingsIcon,
  async search(q) {
    const pattern = like(q);
    const { data, error } = await supabase
      .from("cms_pages")
      .select("id, title, slug, status")
      .or(`title.ilike.${pattern},slug.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(LIMIT);
    if (error) return [];
    return (data ?? []).map((p) => ({
      id: `page:${p.id}`,
      title: p.title,
      subtitle: `/${p.slug} · ${p.status}`,
      href: `/admin/content/pages/${p.id}`,
      icon: SettingsIcon,
      providerId: "pages",
    }));
  },
};

export const searchProviders: SearchProvider[] = [
  bookingsProvider,
  guestsProvider,
  reviewsProvider,
  journalProvider,
  roomsProvider,
  pagesProvider,
];

export async function runSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = await Promise.all(
    searchProviders.map((p) => p.search(q).catch(() => [] as SearchResult[])),
  );
  return results.flat();
}