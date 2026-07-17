import { z } from "zod";

/** Zod schemas for every supported CMS block. */
export const heroSchema = z.object({
  eyebrow: z.string().optional().default(""),
  heading: z.string().optional().default(""),
  subheading: z.string().optional().default(""),
  image: z.string().url().optional().or(z.literal("")).default(""),
  ctaLabel: z.string().optional().default(""),
  ctaHref: z.string().optional().default(""),
});

export const richTextSchema = z.object({
  html: z.string().optional().default(""),
});

export const gallerySchema = z.object({
  images: z
    .array(z.object({ src: z.string(), alt: z.string().optional().default("") }))
    .optional()
    .default([]),
  columns: z.number().int().min(1).max(6).optional().default(3),
});

export const ctaSchema = z.object({
  heading: z.string().optional().default(""),
  body: z.string().optional().default(""),
  label: z.string().optional().default(""),
  url: z.string().optional().default(""),
});

export const faqSchema = z.object({
  heading: z.string().optional().default("Frequently asked questions"),
  items: z
    .array(z.object({ q: z.string(), a: z.string() }))
    .optional()
    .default([]),
});

export const videoSchema = z.object({
  url: z.string().optional().default(""),
  caption: z.string().optional().default(""),
});

export const reviewsSchema = z.object({
  heading: z.string().optional().default("What guests say"),
  limit: z.number().int().min(1).max(24).optional().default(6),
});

export const statisticsSchema = z.object({
  heading: z.string().optional().default(""),
  items: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional()
    .default([]),
});

export const contactSchema = z.object({
  heading: z.string().optional().default("Contact us"),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
});

export const mapSchema = z.object({
  url: z.string().optional().default(""),
  caption: z.string().optional().default(""),
});

export const roomsSchema = z.object({
  heading: z.string().optional().default("Our rooms"),
  limit: z.number().int().min(1).max(24).optional().default(6),
});

export const BLOCK_SCHEMAS = {
  hero: heroSchema,
  rich_text: richTextSchema,
  image_gallery: gallerySchema,
  cta: ctaSchema,
  faq: faqSchema,
  video: videoSchema,
  reviews: reviewsSchema,
  statistics: statisticsSchema,
  contact: contactSchema,
  map: mapSchema,
  rooms: roomsSchema,
} as const;

export type CmsBlockKind = keyof typeof BLOCK_SCHEMAS;

export interface BlockMeta {
  kind: CmsBlockKind;
  label: string;
  description: string;
  defaults: () => Record<string, unknown>;
}

export const BLOCK_REGISTRY: Record<CmsBlockKind, BlockMeta> = {
  hero: {
    kind: "hero",
    label: "Hero",
    description: "Large heading with image and optional CTA.",
    defaults: () => heroSchema.parse({}),
  },
  rich_text: {
    kind: "rich_text",
    label: "Rich text",
    description: "Formatted prose or HTML content.",
    defaults: () => richTextSchema.parse({}),
  },
  image_gallery: {
    kind: "image_gallery",
    label: "Gallery",
    description: "Grid of images.",
    defaults: () => gallerySchema.parse({}),
  },
  cta: {
    kind: "cta",
    label: "Call to action",
    description: "Bold panel with a button.",
    defaults: () => ctaSchema.parse({}),
  },
  faq: {
    kind: "faq",
    label: "FAQ",
    description: "Collapsible question list.",
    defaults: () => faqSchema.parse({}),
  },
  video: {
    kind: "video",
    label: "Video",
    description: "Embedded video with caption.",
    defaults: () => videoSchema.parse({}),
  },
  reviews: {
    kind: "reviews",
    label: "Reviews",
    description: "Guest reviews from database.",
    defaults: () => reviewsSchema.parse({}),
  },
  statistics: {
    kind: "statistics",
    label: "Statistics",
    description: "Numbered highlights.",
    defaults: () => statisticsSchema.parse({}),
  },
  contact: {
    kind: "contact",
    label: "Contact",
    description: "Address, email and phone.",
    defaults: () => contactSchema.parse({}),
  },
  map: {
    kind: "map",
    label: "Map",
    description: "Embedded location map.",
    defaults: () => mapSchema.parse({}),
  },
  rooms: {
    kind: "rooms",
    label: "Rooms",
    description: "Featured room cards from database.",
    defaults: () => roomsSchema.parse({}),
  },
};

/** Safely parse block data with the matching schema (falls back to defaults). */
export function parseBlockData(kind: CmsBlockKind, data: unknown): Record<string, unknown> {
  const schema = BLOCK_SCHEMAS[kind];
  if (!schema) return {};
  const result = schema.safeParse(data ?? {});
  return result.success ? (result.data as Record<string, unknown>) : (BLOCK_REGISTRY[kind].defaults() as Record<string, unknown>);
}