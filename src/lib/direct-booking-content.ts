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
// Links may point to a section of the page ("#rooms"), a page on this site
// ("/p/…") or an https address. Protocol-relative and other schemes are refused.
const offerLink = z.string().trim().max(2048).refine(
  (value) => /^#[A-Za-z][\w-]*$/.test(value) || /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value),
  "Use #section, a site path starting with / or an https:// address.",
);

export const valueWordsSchema = z.array(shortText(24)).max(3);

export const highlightSchema = z.object({
  title: shortText(40),
  description: z.string().trim().max(140).default(""),
  icon: z.enum(HIGHLIGHT_ICONS).default("stay"),
  /** Optional link for the card's arrow (site path or https). */
  linkUrl: offerLink.or(z.literal("")).default(""),
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

// ---------------------------------------------------------------------------
// Template settings (staynas_property_branding.template) and social links
// (staynas_property_branding.social_links). Every field is optional; the guest
// page hides any element whose content is empty.
// ---------------------------------------------------------------------------

export const SOCIAL_NETWORKS = ["instagram", "facebook", "youtube", "tiktok", "pinterest", "x", "linkedin", "tripadvisor", "whatsapp"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export type DirectSocialLinks = Partial<Record<SocialNetwork, string>>;
/** Hosts each network's links must point to, so an icon never opens the wrong site. */
const SOCIAL_HOSTS: Record<SocialNetwork, RegExp> = {
  instagram: /(^|\.)instagram\.com$/,
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/,
  tiktok: /(^|\.)tiktok\.com$/,
  pinterest: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/,
  x: /(^|\.)(x\.com|twitter\.com)$/,
  linkedin: /(^|\.)linkedin\.com$/,
  tripadvisor: /(^|\.)tripadvisor\.[a-z.]+$/,
  whatsapp: /(^|\.)(wa\.me|whatsapp\.com)$/,
};

/**
 * Normalises what a property types into a social field: a WhatsApp phone number
 * becomes a wa.me link, and a bare domain gains https://. Returns "" for empty.
 */
export function normalizeSocialLink(network: SocialNetwork, value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (network === "whatsapp" && /^\+?[\d\s().-]{7,}$/.test(raw)) return `https://wa.me/${raw.replace(/\D/g, "")}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`;
  return raw;
}

/** Why a social link is rejected, or null when it is a valid https link for that network. */
export function socialLinkProblem(network: SocialNetwork, value: string): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full web address.";
  }
  if (url.protocol !== "https:") return "Use an https:// address.";
  if (!SOCIAL_HOSTS[network].test(url.hostname.toLowerCase())) return `This is not a ${network === "x" ? "X (Twitter)" : network} address.`;
  return null;
}

export const socialLinksSchema = z.record(z.string(), z.string()).transform((input, ctx) => {
  const out: DirectSocialLinks = {};
  for (const network of SOCIAL_NETWORKS) {
    const url = normalizeSocialLink(network, input[network]);
    if (!url) continue;
    const problem = socialLinkProblem(network, url);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [network], message: `${network}: ${problem}` });
    else out[network] = url;
  }
  return out;
});

const optionalText = (max: number) => z.string().trim().max(max).default("");
const optionalHttps = httpsUrl.or(z.literal("")).default("");
const optionalLink = offerLink.or(z.literal("")).default("");

export const photoCardSchema = z.object({ imageUrl: httpsUrl, caption: optionalText(40) });

export const templateSettingsSchema = z.object({
  hero: z.object({
    /** Up to three lines separated by line breaks; the last line takes the accent colour. */
    headline: optionalText(90),
    subline: optionalText(160),
    ctaLabel: optionalText(30),
    videoUrl: optionalHttps,
    videoLabel: optionalText(40),
  }).default({}),
  bookLabel: optionalText(24),
  photoCards: z.array(photoCardSchema).max(6).default([]),
  experience: z.object({ title: optionalText(60), body: optionalText(240) }).default({}),
  rating: z.object({
    value: z.number().min(0).max(5).nullable().default(null),
    label: optionalText(40),
    sourceLabel: optionalText(30),
    sourceUrl: optionalHttps,
    avatars: z.array(httpsUrl).max(3).default([]),
  }).default({}),
  discover: z.object({
    heading: optionalText(60),
    body: optionalText(300),
    buttonLabel: optionalText(30),
    buttonUrl: optionalLink,
    imageUrl: optionalHttps,
  }).default({}),
  bookingCard: z.object({ title: optionalText(40), buttonLabel: optionalText(30) }).default({}),
  contact: z.object({ phone: optionalText(40), email: z.string().trim().email().max(120).or(z.literal("")).default(""), address: optionalText(200) }).default({}),
});
export type DirectTemplateSettings = z.infer<typeof templateSettingsSchema>;
export const EMPTY_TEMPLATE_SETTINGS: DirectTemplateSettings = templateSettingsSchema.parse({});

/** Parses stored settings field by field, so one invalid value cannot hide the rest. */
export function parseTemplateSettings(value: unknown): DirectTemplateSettings {
  if (!value || typeof value !== "object") return EMPTY_TEMPLATE_SETTINGS;
  const whole = templateSettingsSchema.safeParse(value);
  if (whole.success) return whole.data;
  const raw = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(templateSettingsSchema.shape) as Array<keyof DirectTemplateSettings>) {
    const field = templateSettingsSchema.shape[key].safeParse(raw[key]);
    result[key] = field.success ? field.data : EMPTY_TEMPLATE_SETTINGS[key];
  }
  if (Array.isArray(raw.photoCards)) {
    result.photoCards = raw.photoCards.flatMap((card) => {
      const parsed = photoCardSchema.safeParse(card);
      return parsed.success ? [parsed.data] : [];
    }).slice(0, 6);
  }
  return result as DirectTemplateSettings;
}

/** Networks the property has linked, in display order. */
export function activeSocialLinks(links: DirectSocialLinks): Array<[SocialNetwork, string]> {
  return SOCIAL_NETWORKS.flatMap((network) => (links[network] ? [[network, links[network] as string] as [SocialNetwork, string]] : []));
}

/** Valid links only: empty, malformed, insecure or wrong-network values are dropped. */
export function parseSocialLinks(value: unknown): DirectSocialLinks {
  if (!value || typeof value !== "object") return {};
  const out: DirectSocialLinks = {};
  for (const network of SOCIAL_NETWORKS) {
    const raw = (value as Record<string, unknown>)[network];
    const url = typeof raw === "string" ? normalizeSocialLink(network, raw) : "";
    if (url && !socialLinkProblem(network, url)) out[network] = url;
  }
  return out;
}

/** tel: target with only the characters dialers accept. */
export function telHref(phone: string): string {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned.startsWith("+") ? "+" + cleaned.slice(1).replace(/\+/g, "") : cleaned.replace(/\+/g, "")}` : "";
}
export type DirectOffer = z.infer<typeof offerSchema>;
export type DirectTemplateContent = {
  valueWords: string[];
  highlights: DirectHighlight[];
  offer: DirectOffer | null;
  template: DirectTemplateSettings;
  socialLinks: DirectSocialLinks;
};

export const EMPTY_TEMPLATE_CONTENT: DirectTemplateContent = { valueWords: [], highlights: [], offer: null, template: EMPTY_TEMPLATE_SETTINGS, socialLinks: {} };

/** Columns added by the template review migration (social_links already exists). */
const TEMPLATE_COLUMNS = ["value_words", "highlights", "offer", "template"] as const;

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
  return {
    valueWords: words,
    highlights,
    offer: offerParsed?.success ? offerParsed.data : null,
    template: parseTemplateSettings(row.template),
    socialLinks: parseSocialLinks(row.social_links),
  };
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

export type DirectPhoto = { url: string; caption?: string };

/**
 * Photographs for the cards that overlap the bottom of the hero: the property's
 * gallery first, otherwise its room photographs captioned with the room name,
 * so a property with room photos already gets this section.
 */
export function directHeroPhotos(galleryUrls: string[], rooms: Array<{ name?: string | null; image_url?: string | null; gallery_urls?: string[] | null }>): DirectPhoto[] {
  if (galleryUrls.length > 0) return galleryUrls.slice(0, 6).map((url) => ({ url }));
  return rooms.flatMap((room) => {
    const url = room.image_url || room.gallery_urls?.[0];
    return url ? [{ url, caption: room.name ?? undefined }] : [];
  }).slice(0, 6);
}
