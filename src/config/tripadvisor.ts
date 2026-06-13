/**
 * Tripadvisor settings for Mtoni River Lodge.
 *
 * Single source of truth for all Tripadvisor statistics displayed across the site.
 * Update these values to refresh ratings, review counts, awards and links —
 * no component code changes required. The Trust Block, JSON-LD schema and any
 * other consumer will pick up the new values automatically.
 */
export type TripadvisorSettings = {
  /** Average guest rating, e.g. 4.9 */
  rating: number;
  /** Best possible rating used in schema, e.g. 5 */
  bestRating: number;
  /** Total number of verified reviews, e.g. 240 */
  reviewCount: number;
  /** Suffix appended to the review count, e.g. "+" to display "240+ verified reviews" */
  reviewCountSuffix?: string;
  /** Ranking on Tripadvisor, e.g. "#3 of 120 hotels in Arusha" — optional */
  ranking?: string;
  /** Award title shown in the recognition badge */
  awardTitle: string;
  /** Year the award was given, e.g. 2025 */
  awardYear: number;
  /** Short label shown under the award title */
  awardSubtitle?: string;
  /** Public Tripadvisor review URL */
  reviewUrl: string;
};

export const tripadvisorSettings: TripadvisorSettings = {
  rating: 4.9,
  bestRating: 5,
  reviewCount: 240,
  reviewCountSuffix: "+",
  ranking: undefined,
  awardTitle: "Tripadvisor Travelers' Choice",
  awardYear: 2026,
  awardSubtitle: "Award Recognition",
  reviewUrl:
    "https://www.tripadvisor.com/Hotel_Review-g297913-d27185811-Reviews-Mtoni_River_Lodge-Arusha_Arusha_Region.html",
};

export default tripadvisorSettings;