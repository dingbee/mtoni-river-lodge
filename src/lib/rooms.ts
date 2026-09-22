export const ROOM_PATHS = {
  "riverfront-deluxe": "/rooms/riverfront-deluxe",
  "standard-river": "/rooms/standard-river",
  "family-room": "/rooms/family-room",
} as const;

export type RoomSlug = keyof typeof ROOM_PATHS;

export type Room = {
  slug: RoomSlug;
  no: string;
  name: string;
  shortName: string;
  heroLine: string;
  shortDesc: string;
  description: string[];
  details: { label: string; value: string }[];
  ctaLine: string;
  img: string;
  gallery: string[];
  size: string;
  view: string;
};

export const RIVERFRONT_DELUXE_ROOM: Room = {
  slug: "riverfront-deluxe",
  no: "01",
  name: "Deluxe Room",
  shortName: "Deluxe",
  heroLine: "More space, refined comfort, and a quieter stay.",
  shortDesc: "A spacious premium room designed for guests who want additional comfort and privacy.",
  description: [
    "A refined room category with generous space, considered materials, and a calm contemporary atmosphere.",
    "The layout balances privacy with practical guest needs, creating an easy base for short stays and longer visits.",
    "Comfort is designed into every part of the experience, from the sleeping area to the en-suite bathroom.",
  ],
  details: [
    { label: "Capacity", value: "Up to 2 guests" },
    { label: "Bed", value: "King bed" },
    { label: "View", value: "Garden / property view" },
    { label: "Bathroom", value: "Private en-suite" },
  ],
  ctaLine: "A little more space for a more relaxed stay.",
  img: "/staynas-room-deluxe.svg",
  gallery: ["/staynas-room-deluxe.svg"],
  size: "38 m²",
  view: "Garden / property view",
};

export const STANDARD_RIVER_ROOM: Room = {
  slug: "standard-river",
  no: "02",
  name: "Standard Room",
  shortName: "Standard",
  heroLine: "Comfortable, practical, and thoughtfully appointed.",
  shortDesc: "An efficient room category for guests looking for dependable comfort and a simple stay.",
  description: [
    "A comfortable room designed around the essentials guests need for a smooth, restful stay.",
    "Clean lines, practical storage, and a welcoming sleeping area make this a dependable everyday room category.",
    "It is an efficient choice for couples, solo travellers, and short business or leisure stays.",
  ],
  details: [
    { label: "Capacity", value: "Up to 2 guests" },
    { label: "Bed", value: "Queen or twin configuration" },
    { label: "View", value: "Property view" },
    { label: "Bathroom", value: "Private en-suite" },
  ],
  ctaLine: "Everything you need for a comfortable stay.",
  img: "/staynas-room-standard.svg",
  gallery: ["/staynas-room-standard.svg"],
  size: "28 m²",
  view: "Property view",
};

export const FAMILY_ROOM: Room = {
  slug: "family-room",
  no: "03",
  name: "Family Room",
  shortName: "Family",
  heroLine: "Flexible space for families and small groups.",
  shortDesc: "A generous room configuration designed for families and guests travelling together.",
  description: [
    "A flexible accommodation category that gives families and small groups more room to settle in comfortably.",
    "The layout is designed for shared stays without sacrificing the privacy and practical details guests expect.",
    "An adaptable option for family holidays, small groups, and longer stays.",
  ],
  details: [
    { label: "Capacity", value: "Up to 4 guests" },
    { label: "Bed", value: "King + twin configuration" },
    { label: "View", value: "Property view" },
    { label: "Bathroom", value: "Private en-suite" },
  ],
  ctaLine: "More room to settle in together.",
  img: "/staynas-room-family.svg",
  gallery: ["/staynas-room-family.svg"],
  size: "48 m²",
  view: "Property view",
};

export const ROOMS: Room[] = [
  STANDARD_RIVER_ROOM,
  RIVERFRONT_DELUXE_ROOM,
  FAMILY_ROOM,
];

export function getRoomPath(slug: RoomSlug) {
  return ROOM_PATHS[slug];
}
