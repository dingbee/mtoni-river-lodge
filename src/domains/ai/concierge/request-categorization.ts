export const GUEST_REQUEST_CATEGORIES = [
  "housekeeping", "room_service", "dining", "airport_transfer",
  "maintenance", "special_occasion", "private_dining", "complaint",
  "service_recovery", "other",
] as const;

export type GuestRequestCategory = typeof GUEST_REQUEST_CATEGORIES[number];

const CATEGORY_RULES: Array<[GuestRequestCategory, RegExp]> = [
  ["service_recovery", /\b(refund|compensation|unacceptable|not resolved|still waiting|manager|service recovery)\b/i],
  ["complaint", /\b(complain|complaint|unhappy|disappointed|dirty|noise|problem|issue)\b/i],
  ["housekeeping", /\b(clean|cleaning|towel|linen|housekeeping|room clean|toilet paper|amenit)\b/i],
  ["room_service", /\b(room service|food to room|bring .* room|in-room dining)\b/i],
  ["private_dining", /\b(private dining|private dinner|candle.?light|dining setup)\b/i],
  ["airport_transfer", /\b(airport|transfer|pick.?up|drop.?off|taxi|shuttle)\b/i],
  ["maintenance", /\b(repair|broken|not working|maintenance|leak|electric|plumbing|air.?condition|ac unit)\b/i],
  ["special_occasion", /\b(birthday|anniversary|proposal|celebrat|surprise)\b/i],
  ["dining", /\b(restaurant|dinner|lunch|breakfast|table|reservation|meal)\b/i],
];

export function categorizeGuestRequest(text: string): GuestRequestCategory {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}
