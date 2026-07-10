import type { ComponentType } from "react";
import { Calendar, MessageSquare, Newspaper, Bed, Star, Settings as SettingsIcon } from "lucide-react";

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
  // TODO(sprint-2): implement real Supabase-backed search per provider
  search: (query: string) => Promise<SearchResult[]>;
};

const stub = (
  id: string,
  label: string,
  icon: ComponentType<{ className?: string }>,
  href: string,
): SearchProvider => ({
  id,
  label,
  icon,
  search: async (q: string) =>
    q.length < 2
      ? []
      : [
          {
            id: `${id}:open`,
            title: `Open ${label}`,
            subtitle: `Go to ${label.toLowerCase()} — full search in Sprint 2`,
            href,
            icon,
            providerId: id,
          },
        ],
});

export const searchProviders: SearchProvider[] = [
  stub("bookings", "Reservations", Calendar, "/admin/bookings"),
  stub("guests", "Guests", MessageSquare, "/admin/guests/crm"),
  stub("reviews", "Reviews", Star, "/admin/reviews"),
  stub("journal", "Journal", Newspaper, "/admin/content/journal"),
  stub("rooms", "Rooms", Bed, "/admin/content/rooms"),
  stub("settings", "Settings", SettingsIcon, "/admin/settings"),
];

export async function runSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const results = await Promise.all(searchProviders.map((p) => p.search(q)));
  return results.flat();
}