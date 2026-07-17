import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import { RESERVATIONS_NOTE } from "@/lib/contact";
import { trackCheckAvailabilityClick, trackRoomView } from "@/lib/analytics";
import { StartBookingLink } from "@/lib/booking-session";
import { ROOMS, getRoomPath, type Room } from "@/lib/rooms";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";
import { getPublicSeoOverride } from "@/domains/marketing/seo/seo-public.functions";
import { resolveSeo, seoMeta, seoSchemaScript } from "@/lib/seo-head";
import roomImg from "@/assets/suite-interior.jpg";
import { usePublicCms } from "@/lib/use-public-cms";
import { CmsBody, hasCmsBody } from "@/components/site/CmsBody";

const ROOMS_FAQS: FAQItem[] = [
  {
    q: "What room types are available at Mtoni River Lodge?",
    a: "We offer three room types — Riverfront Standard, Riverfront Deluxe, and the Family & Garden Suite — each designed in the spirit of Maasai boma architecture and grounded in natural materials.",
  },
  {
    q: "How many guests can each room accommodate?",
    a: "Standard and Deluxe rooms host up to 3 occupants, while the Family & Garden Suite welcomes up to 5 occupants — ideal for families travelling together.",
  },
  {
    q: "Are children welcome and how are they counted?",
    a: "Children are warmly welcome. Children under 6 stay free and do not affect pricing; children 7 and older count as occupants for capacity, but extra-occupant charges only apply once you exceed the base room rate's included guests.",
  },
  {
    q: "What is included in the nightly rate?",
    a: "Every stay includes breakfast, personal hosting, riverfront garden access, and complimentary Wi-Fi. Excursions, transfers, and additional meals can be added on request.",
  },
  {
    q: "Can I see the room before booking?",
    a: "Yes. Each room has its own page with photography and a full description — open any room from this page to explore the interior, view, and amenities before confirming a stay.",
  },
  {
    q: "Are the rooms suitable for Mount Kilimanjaro climbers?",
    a: "Yes — all three rooms are popular with trekkers. Expect hot showers, comfortable bedding, reliable Wi-Fi, and the option of an early or packed breakfast on departure day. See our Kilimanjaro stays page for the full picture.",
  },
];

export const Route = createFileRoute("/rooms/")({
  loader: async () => ({
    seoOverride: await getPublicSeoOverride({ data: { routePath: "/rooms" } }),
  }),
  head: ({ loaderData }) => {
    const seo = resolveSeo(
      {
        title: "Rooms — Mtoni River Lodge",
        description:
          "Earth-and-thatch rooms by the river at Mtoni River Lodge — accommodations inspired by Maasai boma design, grounded in natural materials and quiet luxury.",
        canonical: "https://mtoniriverlodge.com/rooms",
        ogTitle: "Rooms — Mtoni River Lodge",
        ogDescription:
          "Discover earth-and-thatch rooms by the river at Mtoni River Lodge, each inspired by Maasai boma design with its own private atmosphere.",
        ogImage: roomImg,
        twitterImage: roomImg,
      },
      loaderData?.seoOverride ?? null,
    );
    const schema = seoSchemaScript(seo);
    const scripts = [
      buildFAQJsonLd(ROOMS_FAQS),
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Accommodation", path: "/rooms" },
      ]),
    ];
    if (schema) scripts.push(schema);
    return {
      meta: seoMeta(seo),
      links: [{ rel: "canonical", href: seo.canonical }],
      scripts,
    };
  },
  errorComponent: () => null,
  notFoundComponent: () => null,
  component: RoomsIndexPage,
});

function RoomsIndexPage() {
  const { data: cms } = usePublicCms("rooms-landing");
  if (hasCmsBody(cms)) return <CmsBody blocks={cms.blocks} overlayHeader />;

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <PageHero
        image={roomImg}
        imageAlt="Room interior at Mtoni River Lodge"
        eyebrow="Rooms by the River"
        title={<>Rooms at Mtoni<br />River Lodge.</>}
        subtitle="Earth-and-thatch accommodations inspired by Maasai boma design — 24 quiet sanctuaries along the Nduruma River, each shaped by stone, timber, and the rhythm of the water."
      />

      <section className="px-6 pb-24 lg:px-12 lg:pb-40">
        <div className="mx-auto max-w-[1400px] space-y-32 lg:space-y-48">
          {ROOMS.map((room, index) => (
            <RoomRow key={room.no} room={room} reverse={index % 2 === 1} />
          ))}
        </div>
      </section>
      <FAQ
        faqs={ROOMS_FAQS}
        eyebrow="About the rooms"
        heading="Frequently asked questions"
      />
      <SiteFooter />
    </div>
  );
}

function RoomRow({ room, reverse }: { room: Room; reverse: boolean }) {
  const roomPath = getRoomPath(room.slug);

  return (
    <Reveal>
      <div className={`grid items-center gap-12 lg:grid-cols-12 ${reverse ? "lg:[direction:rtl]" : ""}`}>
        <div className="lg:col-span-7 lg:[direction:ltr]">
          <Link
            to={roomPath}
            onClick={() => trackRoomView(room.name, "rooms_index_image")}
            className="group block aspect-[4/3] overflow-hidden"
          >
            <img src={room.img} alt={room.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
          </Link>
        </div>
        <div className="lg:col-span-4 lg:[direction:ltr]">
          <h2 className="font-display text-4xl lg:text-5xl">{room.name}</h2>
          <div className="mt-6 flex gap-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>{room.view}</span>
          </div>
          <p className="mt-6 leading-relaxed text-charcoal/75">{room.shortDesc}</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link
              to={roomPath}
              onClick={() => trackRoomView(room.name, "rooms_index_cta")}
              className="group inline-flex items-center gap-3 border border-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
            >
              <span>Explore Room</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <StartBookingLink
              roomSlug={room.slug}
              onClick={() => trackCheckAvailabilityClick(`rooms_page:${room.slug}`)}
              className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
            >
              View Availability
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </StartBookingLink>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-charcoal/55">
            {RESERVATIONS_NOTE}
          </p>
        </div>
      </div>
    </Reveal>
  );
}
