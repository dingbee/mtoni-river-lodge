export const REVIEW_CATEGORIES = [
  { value: "hospitality_service", label: "Hospitality & Service" },
  { value: "tranquility_nature", label: "Tranquility & Nature" },
  { value: "safari_gateway", label: "Safari Gateway" },
  { value: "rooms_comfort", label: "Rooms & Comfort" },
  { value: "dining", label: "Dining" },
  { value: "pool_family", label: "Pool & Family" },
  { value: "overall_experience", label: "Overall Experience" },
] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number]["value"];
export type ReviewSource = "google" | "tripadvisor" | "direct";
export type ReviewStatus = "pending" | "approved" | "archived";

export const CATEGORY_LABELS: Record<ReviewCategory, string> = REVIEW_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.value]: c.label }),
  {} as Record<ReviewCategory, string>,
);

export const SOURCE_LABELS: Record<ReviewSource, string> = {
  google: "Google",
  tripadvisor: "Tripadvisor",
  direct: "Direct Guest",
};

export type Review = {
  id: string;
  source: ReviewSource;
  guest_name: string;
  guest_location: string | null;
  rating: number;
  title: string | null;
  review_text: string;
  review_date: string;
  categories: ReviewCategory[];
  status: ReviewStatus;
  featured: boolean;
  external_url: string | null;
  created_at: string;
  updated_at: string;
  original_review?: string | null;
  short_summary?: string | null;
  medium_summary?: string | null;
  imported_from?: string | null;
  review_url?: string | null;
  imported_at?: string | null;
};

export type ReviewAggregate = {
  source: ReviewSource;
  average_rating: number;
  review_count: number;
};

export type ReviewStatistics = {
  source: ReviewSource;
  overall_rating: number;
  total_reviews: number;
  profile_url: string | null;
  updated_at: string;
};

export const TRIPADVISOR_URL =
  "https://www.tripadvisor.com/Hotel_Review-g297913-d27185811-Reviews-Mtoni_River_Lodge-Arusha_Arusha_Region.html";
export const GOOGLE_REVIEWS_URL =
  "https://www.google.com/search?q=Mtoni+River+Lodge+Arusha+reviews";

// Minimum displayed review count across the site. Real DB aggregates only
// reflect the seeded sample; published count reflects the lodge's actual
// volume across Google + Tripadvisor.
export const MIN_DISPLAY_REVIEW_COUNT = 90;
export const MIN_TRIPADVISOR_REVIEW_COUNT = 140;

export function formatReviewCount(
  count: number | null | undefined,
  source?: ReviewSource,
): string {
  const n = Number(count ?? 0);
  if (n > 0) return n.toLocaleString();
  const min = source === "tripadvisor" ? MIN_TRIPADVISOR_REVIEW_COUNT : MIN_DISPLAY_REVIEW_COUNT;
  return `${min}+`;
}