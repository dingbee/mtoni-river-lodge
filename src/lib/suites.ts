import suiteImg from "@/assets/suite-interior.jpg";
import villa from "@/assets/villa-exterior.jpg";
import pool from "@/assets/pool.jpg";
import aerial from "@/assets/aerial-lodge.jpg";
import river from "@/assets/hero-river.jpg";
import dining from "@/assets/dining.jpg";
import bonfire from "@/assets/xp-bonfire.jpg";
import riverWalk from "@/assets/xp-river-walk.jpg";
import canoe from "@/assets/xp-canoe.jpg";

export type Suite = {
  slug: string;
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

export const SUITES: Suite[] = [
  {
    slug: "riverfront-deluxe",
    no: "01",
    name: "Riverfront Deluxe Suite",
    shortName: "Riverfront Deluxe",
    heroLine: "Wake to the rhythm of the river.",
    shortDesc:
      "Closest to the water’s edge — an uninterrupted connection to the river’s quiet presence.",
    description: [
      "Set closest to the water’s edge, the Riverfront Deluxe Suite offers an uninterrupted connection to the river’s quiet presence. Mornings begin with soft light reflecting off the surface, while evenings settle into a calm carried by the sound of flowing water.",
      "Built using natural stone, timber, and earth-toned finishes, the suite draws from Maasai boma forms — circular, grounded, and intentionally simple. Large openings invite the outdoors in, creating a space that feels open yet deeply private.",
      "This is where stillness becomes part of your stay — unforced, unspoken, and constant.",
    ],
    details: [
      { label: "View", value: "Direct river views" },
      { label: "Ideal for", value: "Couples" },
      { label: "Outdoor", value: "Private sitting area" },
      { label: "Bathroom", value: "En-suite" },
    ],
    ctaLine: "Step into a space where the river sets the pace.",
    img: suiteImg,
    gallery: [suiteImg, river, riverWalk],
    size: "62 m²",
    view: "River-facing private deck",
  },
  {
    slug: "standard-river",
    no: "02",
    name: "Standard River Suite",
    shortName: "Standard River",
    heroLine: "Comfort, shaped by nature.",
    shortDesc:
      "A quiet balance between comfort and immersion, set along the riverbank.",
    description: [
      "The Standard River Suite offers a quiet balance between comfort and immersion. Positioned along the riverbank, it captures the essence of Mtoni — calm, grounded, and intentionally understated.",
      "Designed with natural materials and inspired by traditional forms, the suite feels both familiar and distinct. Soft light, natural textures, and open air create an environment that encourages rest without distraction.",
      "It is not about excess — it is about presence.",
    ],
    details: [
      { label: "Orientation", value: "River-facing" },
      { label: "Ideal for", value: "Individuals or couples" },
      { label: "Comfort", value: "Natural ventilation & light" },
      { label: "Bathroom", value: "En-suite" },
    ],
    ctaLine: "Experience the simplicity of staying close to nature.",
    img: villa,
    gallery: [villa, aerial, canoe],
    size: "78 m²",
    view: "Serene river proximity",
  },
  {
    slug: "family-suite",
    no: "03",
    name: "Family / Group Suite",
    shortName: "The Garden & Family Rooms",
    heroLine: "Space to gather, room to breathe.",
    shortDesc:
      "Designed for shared moments — generous in space, grounded in simplicity.",
    description: [
      "Designed for shared moments, the Family Suite brings people together without losing the quiet essence of Mtoni. Generous in space yet grounded in simplicity, it allows families or groups to experience the lodge at their own rhythm.",
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
  },
];

export function getSuiteBySlug(slug: string): Suite | undefined {
  return SUITES.find((s) => s.slug === slug);
}