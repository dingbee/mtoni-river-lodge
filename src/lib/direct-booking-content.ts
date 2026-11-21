import { z } from "zod";

/**
 * Optional template content for the public direct-booking pages, stored per
 * property on staynas_property_branding (value_words, highlights, offer).
 *
 * Guest pages render a section only when the property has filled it in; there
 * are no placeholder claims. Columns are read defensively so the pages keep
 * working before the review migration that adds them is applied.
 */

export const HIGHLIGHT_ICONS = ["stay", "dining", "wellness", "outdoors", "pool", "wifi", "transfer", "family"] as const;
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number];

const shortText = (max: number) => z.string().trim().min(1).max(max);
const httpsUrl = z.string().trim().url().max(2048).refine((value) => value.startsWith("https://"), "Use an https:// address.");
// Offer links may point to a page on this site ("/p/…") or to an https address.
const offerLink = z.string().trim().max(2048).refine(
  (value) => /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value),
  "Use a site path starting with / or an https:// address.",
);

export const valueWordsSchema = z.array(shortText(24)).max(3);

export const highlightSchema = z.object({
  title: shortText(40),
  description: z.string().trim().max(140).default(""),
  icon: z.enum(HIGHLIGHT_ICONS).default("stay"),
});
export const highlightsSchema = z.array(highlightSchema).max(4);

export const offerSchema = z.object({
  enabled: z.boolean(),
  eyebrow: z.string().trim().max(40).default(""),
  title: shortText(80),
  body: z.string().trim().max(240).default(""),
  ctaLabel: z.string().trim().max(30).default(""),
  ctaUrl: offerLink.or(z.literal("")).default(""),
  imageUrl: httpsUrl.or(z.literal("")).default(""),
});

export type DirectHighlight = z.infer<typeof highlightSchema>;
export type DirectOffer = z.infer<typeof offerSchema>;
export type DirectTemplateContent = {
  valueWords: string[];
  highlights: DirectHighlight[];
  offer: DirectOffer | null;
};

export const EMPTY_TEMPLATE_CONTENT: DirectTemplateContent = { valueWords: [], highlights: [], offer: null };

/** Keys of a branding row that may be sent to guests; everything else stays server-side. */
const TEMPLATE_COLUMNS = ["value_words", "highlights", "offer"] as const;

export function hasTemplateColumns(row: Record<string, unknown> | null | undefined): boolean {
  return !!row && TEMPLATE_COLUMNS.every((column) => column in row);
}

/**
 * Parses stored template content. Invalid entries are dropped individually so
 * one malformed highlight cannot hide the rest, and nothing malformed reaches
 * the guest page.
 */
export function parseTemplateContent(row: Record<string, unknown> | null | undefined): DirectTemplateContent {
  if (!row) return EMPTY_TEMPLATE_CONTENT;
  const words = Array.isArray(row.value_words)
    ? row.value_words.flatMap((word) => {
        const parsed = shortText(24).safeParse(word);
        return parsed.success ? [parsed.data] : [];
      }).slice(0, 3)
    : [];
  const highlights = Array.isArray(row.highlights)
    ? row.highlights.flatMap((item) => {
        const parsed = highlightSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }).slice(0, 4)
    : [];
  const offerParsed = row.offer && typeof row.offer === "object" ? offerSchema.safeParse(row.offer) : null;
  return { valueWords: words, highlights, offer: offerParsed?.success ? offerParsed.data : null };
}

/** The offer banner shows only when the property enabled it and gave it a title. */
export function visibleOffer(offer: DirectOffer | null): DirectOffer | null {
  return offer && offer.enabled && offer.title ? offer : null;
}

/** Gallery URLs safe to render on a guest page (https only, at most 12). */
export function publicGalleryUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((url): url is string => typeof url === "string" && httpsUrl.safeParse(url).success).slice(0, 12);
}
