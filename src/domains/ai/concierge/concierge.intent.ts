import type { ConciergeIntentLevel, ConciergeIntentSignal } from "./concierge.types";

const HIGH_KEYWORDS = [
  "book", "booking", "reserve", "reservation", "checkout", "check-out",
  "check in", "check-in", "available", "availability", "nights", "how much",
  "rate", "price for", "total for", "quote",
];
const MEDIUM_KEYWORDS = [
  "which room", "best room", "recommend", "recommendation", "family", "couple",
  "children", "kids", "included", "breakfast", "transfer", "airport", "package",
  "experience", "activity", "activities", "meal plan",
];
const LOW_KEYWORDS = [
  "tanzania", "arusha", "kilimanjaro", "safari", "weather", "where is",
  "how far", "distance", "about", "story", "who are you",
];

const MONTHS = [
  "january","february","march","april","may","june","july",
  "august","september","october","november","december",
];

function parseDates(text: string): { check_in: string | null; check_out: string | null; nights: number | null } {
  const lower = text.toLowerCase();
  // ISO date pattern
  const iso = lower.match(/(\d{4}-\d{2}-\d{2})/g);
  if (iso && iso.length >= 2) return { check_in: iso[0], check_out: iso[1], nights: null };
  if (iso && iso.length === 1) return { check_in: iso[0], check_out: null, nights: null };

  // "N nights"
  const nights = lower.match(/(\d{1,2})\s*nights?/);
  // "in September", "for August"
  const monthIdx = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`).test(lower));
  if (monthIdx >= 0) {
    const now = new Date();
    const year = now.getFullYear() + (monthIdx < now.getMonth() ? 1 : 0);
    const day = lower.match(new RegExp(`${MONTHS[monthIdx]}\\s+(\\d{1,2})`));
    if (day) {
      const d = Math.max(1, Math.min(28, parseInt(day[1], 10)));
      const start = new Date(Date.UTC(year, monthIdx, d));
      const n = nights ? parseInt(nights[1], 10) : 3;
      const end = new Date(start); end.setUTCDate(end.getUTCDate() + n);
      return {
        check_in: start.toISOString().slice(0, 10),
        check_out: end.toISOString().slice(0, 10),
        nights: n,
      };
    }
  }
  return { check_in: null, check_out: null, nights: nights ? parseInt(nights[1], 10) : null };
}

function parseChildAges(text: string): number[] | null {
  const match = text.match(/\b(?:children?|kids?)\s*(?:aged?|ages?)\s*[:\-]?\s*(\d{1,2}(?:\s*(?:,|and|&)\s*\d{1,2})*)/i);
  if (!match) return null;
  const ages = match[1].match(/\d{1,2}/g)?.map((age) => Number(age)) ?? [];
  return ages.length > 0 && ages.every((age) => Number.isInteger(age) && age >= 0 && age <= 17) ? ages : null;
}

function parseParty(text: string): {
  adults: number | null;
  children: number | null;
  childrenBelow6: number | null;
  children7Plus: number | null;
} {
  const lower = text.toLowerCase();
  const adults = lower.match(/(\d{1,2})\s*(adults?|people|guests?|pax)/);
  const children = lower.match(/(\d{1,2})\s*(child|children|kids?)/);
  const childAges = parseChildAges(lower);
  const couple = /\bcouple\b|\bhoneymoon\b/.test(lower);
  const family = /\bfamily\b/.test(lower);
  const childCount = children ? parseInt(children[1], 10) : childAges?.length ?? (family ? 2 : null);
  const ageBreakdownIsComplete = childCount === 0 ||
    (childAges !== null && childAges.length === childCount && !childAges.includes(6));
  return {
    adults: adults ? parseInt(adults[1], 10) : couple ? 2 : null,
    children: childCount,
    childrenBelow6: ageBreakdownIsComplete && childAges ? childAges.filter((age) => age < 6).length : childCount === 0 ? 0 : null,
    children7Plus: ageBreakdownIsComplete && childAges ? childAges.filter((age) => age >= 7).length : childCount === 0 ? 0 : null,
  };
}
function parseInterests(text: string): string[] {
  const map: Record<string, RegExp> = {
    canoe: /\bcanoe|kayak|paddle|duluti\b/i,
    hike: /\bhike|hiking|trek|walk\b/i,
    kilimanjaro: /\bkilimanjaro|climb\b/i,
    bonfire: /\bbonfire|campfire\b/i,
    dining: /\bdining|dinner|restaurant|food|meal\b/i,
    transfer: /\bairport|transfer|pickup|pick[- ]up\b/i,
    cultural: /\bcultural|maasai|village\b/i,
  };
  return Object.entries(map).filter(([, r]) => r.test(text)).map(([k]) => k);
}

export function classifyIntent(message: string, history: string[] = []): ConciergeIntentSignal {
  const text = message.toLowerCase();
  const matched: string[] = [];
  let level: ConciergeIntentLevel = "low";
  let confidence = 0.5;

  for (const kw of HIGH_KEYWORDS) if (text.includes(kw)) matched.push(kw);
  if (matched.length > 0) { level = "high"; confidence = 0.85; }
  else {
    for (const kw of MEDIUM_KEYWORDS) if (text.includes(kw)) matched.push(kw);
    if (matched.length > 0) { level = "medium"; confidence = 0.7; }
    else {
      for (const kw of LOW_KEYWORDS) if (text.includes(kw)) matched.push(kw);
      confidence = matched.length > 0 ? 0.6 : 0.5;
    }
  }

  const combined = [message, ...history].join(" ");
  const dates = parseDates(combined);
  const party = parseParty(combined);
  const interests = parseInterests(combined);

  // Upgrade to high if we have concrete dates + party
  if (dates.check_in && party.adults && level !== "high") {
    level = "high"; confidence = Math.max(confidence, 0.8);
  }

  return {
    level,
    confidence,
    keywords: matched,
    detected: {
      check_in: dates.check_in,
      check_out: dates.check_out,
      nights: dates.nights ?? (dates.check_in && dates.check_out
        ? Math.round((new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / 86400000)
        : null),
      adults: party.adults,
      children: party.children,
      children_below_6: party.childrenBelow6,
      children_7_plus: party.children7Plus,
      interests,
    },
  };
}