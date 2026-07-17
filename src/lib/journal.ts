import river from "@/assets/nduruma-river-flow.jpg";
import ndurumaGrove from "@/assets/nduruma-banana-grove.jpg";
import guide from "@/assets/maasai-by-river.jpg";
import villa from "@/assets/boma-thatch-room.jpg";
import aerial from "@/assets/aerial-lodge.jpg";
import cottage from "@/assets/hero-cottage-exterior.jpg";
import poolAerialAsset from "@/assets/pool-aerial-slow-living.jpg.asset.json";
import lodgeAerial from "@/assets/mtoni-entrance-hero.webp";
import receptionFeatured from "@/assets/mtoni-reception-featured.webp.asset.json";

export type JournalPostHref =
  | "/journal/discover-mtoni-river-lodge-arusha"
  | "/journal/perfect-arusha-stay-for-safari-travelers-2026"
  | "/journal/where-to-stay-before-climbing-mount-kilimanjaro"
  | "/boutique-lodge-near-kilimanjaro-airport"
  | "/planning-your-tanzania-safari-where-to-stay-in-arusha"
  | "/journal/discovering-arusha-through-nature-and-authentic-hospitality"
  | "/journal/what-the-river-has-taught-us-about-time"
  | "/journal/life-along-the-nduruma-river"
  | "/journal/building-with-the-community"
  | "/journal/the-architecture-of-disappearing";

export type JournalPost = {
  /** ISO publication date — primary sort key (desc). */
  publishedAt: string;
  /** ISO creation timestamp — tie-breaker when publishedAt is identical. */
  createdAt: string;
  /** Human-readable date label shown in the UI. */
  date: string;
  read: string;
  title: string;
  excerpt: string;
  img: string;
  href: JournalPostHref;
};

/**
 * Single source of truth for journal articles. Add new entries here with their
 * `publishedAt` (and `createdAt`) — the homepage, journal index, and any related
 * widgets will automatically display them in reverse chronological order.
 */
const POSTS: JournalPost[] = [
  {
    publishedAt: "2026-07-13",
    createdAt: "2026-07-13T00:00:00Z",
    date: "July 2026",
    read: "10 min",
    title:
      "Planning Your Tanzania Safari? Here's Why Your Stay in Arusha Matters More Than You Think",
    excerpt:
      "Planning a safari in Tanzania? Discover why staying in Arusha before and after your safari makes your journey smoother, more comfortable, and more memorable.",
    img: lodgeAerial,
    href: "/planning-your-tanzania-safari-where-to-stay-in-arusha",
  },
  {
    publishedAt: "2026-07-02",
    createdAt: "2026-07-02T00:00:00Z",
    date: "July 2026",
    read: "9 min",
    title:
      "The Perfect Boutique Lodge Near Kilimanjaro Airport for Your Tanzania Safari",
    excerpt:
      "A peaceful boutique lodge with easy access to Kilimanjaro International Airport — the calm, authentic beginning and ending to your Northern Tanzania safari or Mount Kilimanjaro adventure.",
    img: receptionFeatured.url,
    href: "/boutique-lodge-near-kilimanjaro-airport",
  },
  {
    publishedAt: "2026-06-29",
    createdAt: "2026-06-29T00:00:00Z",
    date: "June 2026",
    read: "7 min",
    title: "Where to Stay Before Climbing Mount Kilimanjaro",
    excerpt:
      "A practical guide to choosing accommodation in Arusha before your Kilimanjaro trek — and why a peaceful riverfront lodge sets the right tone for the climb ahead.",
    img: lodgeAerial,
    href: "/journal/where-to-stay-before-climbing-mount-kilimanjaro",
  },
  {
    publishedAt: "2026-06-21",
    createdAt: "2026-06-21T00:00:00Z",
    date: "June 2026",
    read: "6 min",
    title:
      "Discover Mtoni River Lodge: A Hidden Nature Retreat in Arusha, Tanzania",
    excerpt:
      "An authentic Maasai-inspired boutique lodge on the riverbanks of Arusha — where culture, nature, and personalised hospitality meet.",
    img: poolAerialAsset.url,
    href: "/journal/discover-mtoni-river-lodge-arusha",
  },
  {
    publishedAt: "2026-06-12",
    createdAt: "2026-06-12T00:00:00Z",
    date: "June 2026",
    read: "5 min",
    title:
      "Why Mtoni River Lodge Is the Perfect Arusha Stay for Safari Travelers in 2026",
    excerpt:
      "A peaceful retreat between Kilimanjaro International Airport and Arusha City — designed for safari travelers seeking comfort, nature, and authentic Tanzanian hospitality.",
    img: cottage,
    href: "/journal/perfect-arusha-stay-for-safari-travelers-2026",
  },
  {
    publishedAt: "2026-06-01",
    createdAt: "2026-06-01T00:00:00Z",
    date: "June 2026",
    read: "4 min",
    title: "Discovering Arusha Through Nature and Authentic Hospitality",
    excerpt:
      "Why more travelers are choosing nature-inspired hospitality at Mtoni River Lodge — a peaceful retreat close to Arusha's iconic attractions.",
    img: aerial,
    href: "/journal/discovering-arusha-through-nature-and-authentic-hospitality",
  },
  {
    publishedAt: "2026-03-01",
    createdAt: "2026-03-01T00:00:00Z",
    date: "March 2026",
    read: "6 min",
    title: "What the River Has Taught Us About Time",
    excerpt:
      "On the slow art of arriving, and why we removed every clock from the lodge.",
    img: river,
    href: "/journal/what-the-river-has-taught-us-about-time",
  },
  {
    publishedAt: "2026-02-01",
    createdAt: "2026-02-01T00:00:00Z",
    date: "February 2026",
    read: "5 min",
    title: "Life Along the Nduruma River",
    excerpt:
      "Farming traditions, irrigation streams, and the green heart of Mtoni — where ox-ploughed fields and river-fed gardens shape daily life.",
    img: ndurumaGrove,
    href: "/journal/life-along-the-nduruma-river",
  },
  {
    publishedAt: "2026-01-01",
    createdAt: "2026-01-01T00:00:00Z",
    date: "January 2026",
    read: "6 min",
    title: "Building With the Community",
    excerpt:
      "Employment, infrastructure, and shared growth — how Mtoni contributes to the people and ecosystems that surround it.",
    img: guide,
    href: "/journal/building-with-the-community",
  },
  {
    publishedAt: "2025-12-01",
    createdAt: "2025-12-01T00:00:00Z",
    date: "December 2025",
    read: "6 min",
    title: "Maasai Boma Architecture at Mtoni",
    excerpt:
      "Earth, thatch, and circular spatial logic — how the rooms are grounded in a building tradition shaped by climate, culture, and land.",
    img: villa,
    href: "/journal/the-architecture-of-disappearing",
  },
];

/** Returns all journal posts sorted newest first (publishedAt desc, createdAt desc tiebreaker). */
export function getJournalPosts(): JournalPost[] {
  return [...POSTS].sort((a, b) => {
    const pub = b.publishedAt.localeCompare(a.publishedAt);
    if (pub !== 0) return pub;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Returns the latest `count` posts, newest first. */
export function getLatestJournalPosts(count: number): JournalPost[] {
  return getJournalPosts().slice(0, count);
}

/** Returns related posts (newest first), excluding the given href. */
export function getRelatedJournalPosts(
  excludeHref: JournalPostHref,
  count = 3,
): JournalPost[] {
  return getJournalPosts()
    .filter((p) => p.href !== excludeHref)
    .slice(0, count);
}