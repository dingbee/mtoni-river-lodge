import aerial from "@/assets/aerial-lodge.jpg";
import mtoniEntrance from "@/assets/mtoni-entrance-hero.webp";
import river from "@/assets/hero-river.jpg";
import reception from "@/assets/hero-reception-interior.jpg";
import suite from "@/assets/suite-interior.jpg";
import riverfrontDeluxeInterior from "@/assets/riverfront-deluxe-interior.jpg";
import riverfrontDeluxeExterior from "@/assets/riverfront-deluxe-exterior.jpg";
import riverfrontDeluxeShower from "@/assets/riverfront-deluxe-outdoor-shower.jpg";
import standardRiverInterior from "@/assets/standard-river-interior.jpg";
import standardRiverExterior from "@/assets/standard-river-exterior.jpg";
import standardRiverGarden from "@/assets/standard-river-garden.jpg";
import familyHero from "@/assets/family-room-hero.jpg";
import familyGallery2 from "@/assets/family-room-gallery-2.jpg";
import familyGallery3 from "@/assets/family-room-gallery-3.jpg";
import pool from "@/assets/pool.jpg";
import poolAerialSlowLiving from "@/assets/pool-aerial-slow-living.jpg.asset.json";


import diningHero from "@/assets/dining-hero.jpg";
import liveCooking from "@/assets/live-cooking.jpg";

import detailCoffee from "@/assets/detail-coffee.jpg";
import rituals from "@/assets/rituals.jpg";
import bomaThatch from "@/assets/boma-thatch-room.jpg";
import forestCottage from "@/assets/hero-forest-cottage.jpg.asset.json";
import diningCandlelit from "@/assets/hero-dining-candlelit.jpg.asset.json";
import palmGarden from "@/assets/palm-garden.jpg.asset.json";
import forestLight from "@/assets/forest-light.jpg.asset.json";
import maasaiByRiver from "@/assets/maasai-by-river.jpg";
import bananaGrove from "@/assets/nduruma-banana-grove.jpg";
import riverFlow from "@/assets/nduruma-river-flow.jpg";

import riverWalk from "@/assets/xp-river-walk.jpg";
import cycling from "@/assets/xp-cycling.jpg";
import bonfire from "@/assets/xp-bonfire.jpg";
import canoe from "@/assets/xp-canoe.jpg";
import waterfall from "@/assets/xp-waterfall.jpg";

export type GalleryCategory =
  | "Architecture"
  | "Rooms"
  | "Dining"
  | "Nature"
  | "Experiences"
  | "Stillness";

export type GalleryImage = {
  src: string;
  alt: string;
  category: GalleryCategory;
};

export const GALLERY: GalleryImage[] = [
  { src: aerial, alt: "Aerial view of Mtoni River Lodge along the Nduruma River", category: "Dining" },
  { src: reception, alt: "Warm stone reception with beaded chandelier and arched doorways", category: "Architecture" },
  { src: bomaThatch, alt: "Boma-inspired thatched room", category: "Architecture" },
  { src: forestCottage.url, alt: "Thatched cottage surrounded by tall forest trees at Mtoni River Lodge", category: "Architecture" },
  { src: palmGarden.url, alt: "Stone pathway winding through tall palm trees in the tropical garden at Mtoni River Lodge", category: "Architecture" },
  { src: poolAerialSlowLiving.url, alt: "Aerial view of the curved swimming pool and garden island at Mtoni River Lodge", category: "Architecture" },

  { src: suite, alt: "Candlelit bubble bath beneath a thatched roof", category: "Rooms" },
  { src: riverfrontDeluxeInterior, alt: "Riverfront Deluxe interior with antique king bed", category: "Rooms" },
  { src: riverfrontDeluxeExterior, alt: "Riverfront Deluxe exterior with private deck", category: "Rooms" },
  { src: riverfrontDeluxeShower, alt: "Outdoor copper shower at the Riverfront Deluxe", category: "Rooms" },
  { src: standardRiverInterior, alt: "Standard River Room interior", category: "Rooms" },
  { src: standardRiverExterior, alt: "Standard River Room exterior", category: "Rooms" },
  { src: standardRiverGarden, alt: "Garden view from the Standard River Room", category: "Rooms" },
  { src: familyHero, alt: "Spacious Family Room at Mtoni River Lodge", category: "Rooms" },
  { src: familyGallery2, alt: "Family Room living area", category: "Rooms" },
  { src: familyGallery3, alt: "Family Room garden-facing terrace", category: "Rooms" },

  { src: diningHero, alt: "Garden picnic with open-fire cooking", category: "Dining" },
  { src: liveCooking, alt: "Chef plating an open-fire dish", category: "Dining" },
  { src: diningCandlelit.url, alt: "Candlelit dining table with gourd pendant lamps at Mtoni River Lodge", category: "Dining" },
  { src: detailCoffee, alt: "Detail of a morning coffee service", category: "Rooms" },


  { src: river, alt: "Mist over the Nduruma River at dawn with Mount Meru beyond", category: "Nature" },
  { src: riverFlow, alt: "Nduruma River flowing past river stones", category: "Nature" },
  { src: bananaGrove, alt: "Banana grove along the riverbank", category: "Nature" },
  { src: maasaiByRiver, alt: "Maasai elder by the river at dusk", category: "Nature" },
  { src: forestLight.url, alt: "Morning sunlight filtering through the dense forest canopy at Mtoni River Lodge", category: "Nature" },

  { src: riverWalk, alt: "Guided river walk at first light", category: "Experiences" },
  { src: cycling, alt: "Cycling through the foothills", category: "Experiences" },
  { src: bonfire, alt: "Evening bonfire under the sky", category: "Experiences" },
  { src: canoe, alt: "Canoeing on Lake Duluti", category: "Experiences" },
  { src: waterfall, alt: "Hidden waterfall walk", category: "Experiences" },

  { src: pool, alt: "Curved pool framed by thatched umbrellas and greenery", category: "Stillness" },
  { src: rituals, alt: "Hand lighting a candle as evening falls", category: "Stillness" },

];

export const GALLERY_CATEGORIES: ("All" | GalleryCategory)[] = [
  "All",
  "Architecture",
  "Rooms",
  "Dining",
  "Nature",
  "Experiences",
  "Stillness",
];