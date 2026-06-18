import { getJournalPosts } from "@/lib/journal";
import heroRiver from "@/assets/hero-river.jpg";
import heroCottage from "@/assets/hero-cottage-exterior.jpg";
import heroReception from "@/assets/hero-reception-interior.jpg";
import aerial from "@/assets/aerial-lodge.jpg";
import lodgeAerial from "@/assets/lodge-hero-aerial.jpg";
import villaExterior from "@/assets/villa-exterior.jpg";
import pool from "@/assets/pool.jpg";
import diningHero from "@/assets/dining-hero.jpg";
import dining from "@/assets/dining.jpg";
import liveCooking from "@/assets/live-cooking.jpg";
import coffee from "@/assets/coffee.jpg";
import ndurumaRiver from "@/assets/nduruma-river-flow.jpg";
import ndurumaGrove from "@/assets/nduruma-banana-grove.jpg";
import standardExt from "@/assets/standard-river-exterior.jpg";
import standardInt from "@/assets/standard-river-interior.jpg";
import standardGarden from "@/assets/standard-river-garden.jpg";
import deluxeExt from "@/assets/riverfront-deluxe-exterior.jpg";
import deluxeInt from "@/assets/riverfront-deluxe-interior.jpg";
import deluxeShower from "@/assets/riverfront-deluxe-outdoor-shower.jpg";
import familyHero from "@/assets/family-room-hero.jpg";
import familyG2 from "@/assets/family-room-gallery-2.jpg";
import familyG3 from "@/assets/family-room-gallery-3.jpg";
import suiteInterior from "@/assets/suite-interior.jpg";
import bomaThatch from "@/assets/boma-thatch-room.jpg";
import xpCanoe from "@/assets/xp-canoe.jpg";
import xpCooking from "@/assets/xp-cooking.jpg";
import xpCycling from "@/assets/xp-cycling.jpg";
import xpHotsprings from "@/assets/xp-hotsprings.jpg";
import xpMarket from "@/assets/xp-market.jpg";
import xpRiverWalk from "@/assets/xp-river-walk.jpg";
import xpWaterfall from "@/assets/xp-waterfall.jpg";
import xpBonfire from "@/assets/xp-bonfire.jpg";
import xpMotorbike from "@/assets/xp-motorbike.jpg";
import maasaiByRiver from "@/assets/maasai-by-river.jpg";
import guide from "@/assets/guide.jpg";

export const BASE_URL = "https://mtoniriverlodge.com";

const TODAY = new Date().toISOString().slice(0, 10);

export type ChangeFreq = "weekly" | "monthly" | "yearly";

export interface PageEntry {
  path: string;
  lastmod: string;
  changefreq: ChangeFreq;
  priority: string;
}

/** Static, non-accommodation, non-journal pages. */
export const PAGE_ENTRIES: PageEntry[] = [
  { path: "/", lastmod: TODAY, changefreq: "weekly", priority: "1.0" },
  { path: "/lodge", lastmod: TODAY, changefreq: "monthly", priority: "0.8" },
  { path: "/experiences", lastmod: TODAY, changefreq: "monthly", priority: "0.8" },
  { path: "/dining", lastmod: TODAY, changefreq: "monthly", priority: "0.8" },
  { path: "/gallery", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/pricing", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/plan", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/book", lastmod: TODAY, changefreq: "monthly", priority: "0.9" },
  { path: "/contact", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/reviews", lastmod: TODAY, changefreq: "monthly", priority: "0.8" },
  { path: "/faq", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/terms", lastmod: TODAY, changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", lastmod: TODAY, changefreq: "yearly", priority: "0.3" },
  { path: "/journal", lastmod: TODAY, changefreq: "weekly", priority: "0.8" },
];

/** Accommodation index + individual room pages. */
export const ACCOMMODATION_ENTRIES: PageEntry[] = [
  { path: "/rooms", lastmod: TODAY, changefreq: "monthly", priority: "0.9" },
  { path: "/rooms/standard-river", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/rooms/riverfront-deluxe", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
  { path: "/rooms/family-room", lastmod: TODAY, changefreq: "monthly", priority: "0.7" },
];

/** Journal entries derived from the journal data source — auto-updates on publish. */
export function getJournalEntries(): PageEntry[] {
  return getJournalPosts().map((p) => ({
    path: p.href,
    lastmod: p.publishedAt,
    changefreq: "monthly",
    priority: "0.7",
  }));
}

export interface ImageEntry {
  loc: string;
  caption: string;
}

export interface PageImages {
  path: string;
  lastmod: string;
  images: ImageEntry[];
}

const abs = (asset: string): string =>
  asset.startsWith("http") ? asset : `${BASE_URL}${asset}`;

/** Image sitemap data — grouped per page (Google's required structure). */
export function getImageGroups(): PageImages[] {
  return [
    {
      path: "/",
      lastmod: TODAY,
      images: [
        { loc: abs(heroRiver), caption: "Nduruma River flowing through Mtoni River Lodge" },
        { loc: abs(heroCottage), caption: "Cottage exterior at Mtoni River Lodge, Arusha" },
        { loc: abs(heroReception), caption: "Reception interior at Mtoni River Lodge" },
        { loc: abs(aerial), caption: "Aerial view of Mtoni River Lodge gardens" },
      ],
    },
    {
      path: "/lodge",
      lastmod: TODAY,
      images: [
        { loc: abs(lodgeAerial), caption: "Aerial view of the lodge architecture" },
        { loc: abs(villaExterior), caption: "Villa exterior nestled in the gardens" },
        { loc: abs(bomaThatch), caption: "Maasai boma-inspired thatched room" },
      ],
    },
    {
      path: "/rooms",
      lastmod: TODAY,
      images: [
        { loc: abs(standardExt), caption: "Standard River Room exterior" },
        { loc: abs(deluxeExt), caption: "Riverfront Deluxe room exterior" },
        { loc: abs(familyHero), caption: "Family Room at Mtoni River Lodge" },
        { loc: abs(suiteInterior), caption: "Room interior at Mtoni River Lodge" },
      ],
    },
    {
      path: "/rooms/standard-river",
      lastmod: TODAY,
      images: [
        { loc: abs(standardExt), caption: "Standard River Room exterior" },
        { loc: abs(standardInt), caption: "Standard River Room interior" },
        { loc: abs(standardGarden), caption: "Standard River Room garden view" },
      ],
    },
    {
      path: "/rooms/riverfront-deluxe",
      lastmod: TODAY,
      images: [
        { loc: abs(deluxeExt), caption: "Riverfront Deluxe exterior" },
        { loc: abs(deluxeInt), caption: "Riverfront Deluxe interior" },
        { loc: abs(deluxeShower), caption: "Riverfront Deluxe outdoor shower" },
      ],
    },
    {
      path: "/rooms/family-room",
      lastmod: TODAY,
      images: [
        { loc: abs(familyHero), caption: "Family Room hero" },
        { loc: abs(familyG2), caption: "Family Room interior" },
        { loc: abs(familyG3), caption: "Family Room sitting area" },
      ],
    },
    {
      path: "/dining",
      lastmod: TODAY,
      images: [
        { loc: abs(diningHero), caption: "Riverside dining at Mtoni" },
        { loc: abs(dining), caption: "Open-air dining experience" },
        { loc: abs(liveCooking), caption: "Live cooking station" },
        { loc: abs(coffee), caption: "Tanzanian coffee service" },
      ],
    },
    {
      path: "/experiences",
      lastmod: TODAY,
      images: [
        { loc: abs(xpCanoe), caption: "Canoeing on the Nduruma River" },
        { loc: abs(xpCooking), caption: "Traditional Tanzanian cooking class" },
        { loc: abs(xpCycling), caption: "Cycling tour around Gomba Estate" },
        { loc: abs(xpHotsprings), caption: "Visit to Chemka Hot Springs" },
        { loc: abs(xpMarket), caption: "Local market visit in Arusha" },
        { loc: abs(xpRiverWalk), caption: "Guided river walk along the Nduruma" },
        { loc: abs(xpWaterfall), caption: "Waterfall hike near Mount Meru" },
        { loc: abs(xpBonfire), caption: "Evening bonfire experience" },
        { loc: abs(xpMotorbike), caption: "Motorbike tour through coffee country" },
        { loc: abs(ndurumaRiver), caption: "Nduruma River setting" },
        { loc: abs(ndurumaGrove), caption: "Banana grove along the Nduruma" },
        { loc: abs(maasaiByRiver), caption: "Maasai guide by the river" },
        { loc: abs(guide), caption: "Local guide at Mtoni River Lodge" },
      ],
    },
    {
      path: "/lodge",
      lastmod: TODAY,
      images: [{ loc: abs(pool), caption: "Swimming pool at Mtoni River Lodge" }],
    },
  ];
}

/** Shared XML helpers. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function urlsetXml(entries: PageEntry[]): string {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      `    <lastmod>${e.lastmod}</lastmod>`,
      `    <changefreq>${e.changefreq}</changefreq>`,
      `    <priority>${e.priority}</priority>`,
      `  </url>`,
    ].join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}