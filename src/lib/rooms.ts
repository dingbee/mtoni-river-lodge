import riverfrontDeluxeInterior from "@/assets/riverfront-deluxe-interior.jpg";
import standardRiverExterior from "@/assets/standard-river-exterior.jpg";
import pool from "@/assets/pool.jpg";
import aerial from "@/assets/aerial-lodge.jpg";
import river from "@/assets/hero-river.jpg";
import dining from "@/assets/dining.jpg";
import bonfire from "@/assets/xp-bonfire.jpg";
import riverWalk from "@/assets/xp-river-walk.jpg";
import canoe from "@/assets/xp-canoe.jpg";
import standardRiverGarden from "@/assets/standard-river-garden.jpg";

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
    name: "Riverfront Deluxe Room",
    shortName: "Riverfront Deluxe",
    heroLine: "Wake to the rhythm of the river.",
    shortDesc:
      "Closest to the water’s edge — an uninterrupted connection to the river’s quiet presence.",
    description: [
      "The Riverfront Deluxe Room is built from natural earth and thatch, following the circular logic of a Maasai boma — low, grounded, and shaped to exist in quiet harmony with the riverbank.",
      "Its form is intentional: walls that breathe, textures that carry the warmth of hand-worked materials, and openings that invite light without disrupting privacy. The river remains ever-present, not as decoration, but as a living rhythm just beyond the threshold.",
      "Here, comfort is not added — it is carved from simplicity.",
    ],
    details: [
      { label: "View", value: "Direct river views" },
      { label: "Ideal for", value: "Couples" },
      { label: "Outdoor", value: "Private sitting area" },
      { label: "Bathroom", value: "En-suite" },
    ],
    ctaLine: "Step into a space where the river sets the pace.",
    img: riverfrontDeluxeInterior,
    gallery: [riverfrontDeluxeInterior, river, riverWalk],
    size: "62 m²",
    view: "River-facing private deck",
  };

export const STANDARD_RIVER_ROOM: Room = {
    slug: "standard-river",
    no: "02",
    name: "Standard River Room",
    shortName: "Standard River",
    heroLine: "Grounded in simplicity. Guided by nature.",
    shortDesc:
      "A quiet balance between comfort and immersion, set along the riverbank.",
    description: [
      "The Standard River Room reflects the same architectural language of earth and thatch, shaped through the circular principles of traditional Maasai boma design. It is modest in scale, but rich in atmosphere — where natural materials define both structure and feeling.",
      "Set slightly away from the river’s edge, it carries the same sense of calm and connection, allowing light, air, and texture to define the experience.",
      "It is not about excess — it is about presence.",
    ],
    details: [
      { label: "Orientation", value: "Nature-facing orientation" },
      { label: "Ideal for", value: "Individuals or couples" },
      { label: "Comfort", value: "Natural ventilation & light" },
      { label: "Bathroom", value: "En-suite" },
    ],
    ctaLine: "Experience the simplicity of staying close to nature.",
    img: standardRiverExterior,
    gallery: [standardRiverExterior, aerial, standardRiverGarden],
    size: "78 m²",
    view: "Serene river proximity",
  };

export const FAMILY_ROOM: Room = {
    slug: "family-room",
    no: "03",
    name: "Family / Group Room",
    shortName: "The Garden & Family Rooms",
    heroLine: "Space to gather, room to breathe.",
    shortDesc:
      "Designed for shared moments — generous in space, grounded in simplicity.",
    description: [
      "Designed for shared moments, the Family Room brings people together without losing the quiet essence of Mtoni. Generous in space yet grounded in simplicity, it allows families or groups to experience the lodge at their own rhythm.",
      "Inspired by the communal nature of Maasai living, the layout encourages connection — whether through shared spaces or quiet individual corners. Natural materials and warm finishes maintain a sense of continuity with the surrounding environment.",
      "Here, time is not divided — it is shared.",
    ],
    details: [
      { label: "Sleeping", value: "Multiple arrangements" },
      { label: "Ideal for", value: "Families or small groups" },
      { label: "Layout", value: "Spacious & open" },
      { label: "Bathroom", value: "Private facilities" },
    ],
    ctaLine: "Make space for shared experiences, naturally.",
    img: pool,
    gallery: [pool, dining, bonfire],
    size: "140 m²",
    view: "Garden & family serenity",
  };

export const ROOMS: Room[] = [
  RIVERFRONT_DELUXE_ROOM,
  STANDARD_RIVER_ROOM,
  FAMILY_ROOM,
];

export function getRoomPath(slug: RoomSlug) {
  return ROOM_PATHS[slug];
}
