import type { Room } from "@/lib/rooms";

const SITE_URL = "https://mtoniriverlodge.com";

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build a Hotel + Offer JSON-LD payload for a single room page. */
export function buildRoomJsonLd(opts: {
  room: Room;
  routePath: string;
  priceUSD: number;
  occupancy?: number;
}) {
  const { room, routePath, priceUSD, occupancy } = opts;
  const url = absoluteUrl(routePath);
  const image = absoluteUrl(room.img);

  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": `${url}#hotel`,
    name: room.name,
    description: room.shortDesc,
    url,
    image,
    brand: { "@type": "Brand", name: "Mtoni River Lodge" },
    containedInPlace: {
      "@type": "LodgingBusiness",
      name: "Mtoni River Lodge",
      url: SITE_URL,
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Arusha",
      addressRegion: "Arusha",
      addressCountry: "TZ",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -3.435813,
      longitude: 36.794313,
    },
    ...(occupancy
      ? {
          occupancy: {
            "@type": "QuantitativeValue",
            maxValue: occupancy,
            unitCode: "C62",
          },
        }
      : {}),
    makesOffer: {
      "@type": "Offer",
      url: `${SITE_URL}/book`,
      priceCurrency: "USD",
      price: priceUSD,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: priceUSD,
        priceCurrency: "USD",
        unitCode: "DAY",
        referenceQuantity: {
          "@type": "QuantitativeValue",
          value: 1,
          unitCode: "DAY",
        },
      },
      availability: "https://schema.org/InStock",
      category: "Lodging",
    },
  } as const;
}