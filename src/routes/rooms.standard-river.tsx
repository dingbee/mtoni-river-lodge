import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { PageHero } from "@/components/site/PageHero";
import { RoomRate } from "@/components/site/RoomRate";
import { RoomReviews } from "@/components/site/reviews/RoomReviews";
import { TrustBar } from "@/components/site/reviews/TrustBar";
import { LightboxGallery } from "@/components/site/Lightbox";
import { RESERVATIONS_NOTE, buildRoomInquiryUrl } from "@/lib/contact";
import { trackCheckAvailabilityClick, trackContactClick } from "@/lib/analytics";
import { STANDARD_RIVER_ROOM, ROOMS, getRoomPath } from "@/lib/rooms";
import interiorImg from "@/assets/standard-river-interior.jpg";

function StandardRiverPage() {
  const room = STANDARD_RIVER_ROOM;
  const others = ROOMS.filter((item) => item.slug !== room.slug);
  const gallery = [room.gallery[0], interiorImg, room.gallery[2]];

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      <PageHero
        image={room.img}
        imageAlt={room.name}
        title={room.name}
        subtitle={room.heroLine}
        back={{ to: "/rooms", label: "Back to Rooms" }}
        cta={{ label: "Check Availability", to: "/book" }}
      />

      <TrustBar variant="subtle" compact />

      <RoomRate
        eyebrow="Riverfront Standard"
        tagline="Balanced & quiet"
        price="$260"
        note="River-view sanctuary · Breakfast & personal hosting included"
      />

      <section className="px-6 pb-24 lg:px-12 lg:pb-32">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="font-display text-4xl leading-tight lg:text-5xl">Grounded in simplicity. Guided by nature.</h2>
          </div>
          <div className="space-y-6 lg:col-span-7 lg:col-start-6">
            {room.description.map((paragraph, index) => (
              <p key={index} className="text-lg leading-relaxed text-charcoal/80">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 lg:px-12 lg:pb-32">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow">Room Gallery</p>
          <LightboxGallery
            images={gallery.map((src, i) => ({
              src,
              alt: `${room.name} — image ${i + 1}`,
            }))}
          />
        </div>
      </section>

      <section className="border-y border-border bg-bone/40 px-6 py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow">Room Details</p>
          <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {room.details.map((detail) => (
              <div key={detail.label}>
                <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">{detail.label}</p>
                <p className="mt-3 font-display text-2xl leading-tight">{detail.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-[900px] text-center">
          <Reveal>
            <p className="eyebrow">Reserve</p>
            <h2 className="mt-6 font-display text-4xl leading-tight lg:text-6xl">{room.ctaLine}</h2>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/book"
                onClick={() => trackCheckAvailabilityClick("standard_river_room")}
                className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
              >
                <span>Check Availability</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a
                href={buildRoomInquiryUrl(STANDARD_RIVER_ROOM.name)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContactClick("whatsapp", "standard_river_room")}
                className="inline-flex items-center gap-3 border border-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
              >
                <span>Ask About This Room</span>
                <span>→</span>
              </a>
            </div>
            <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-charcoal/60">
              {RESERVATIONS_NOTE}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border px-6 py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow">Discover more</p>
          <h3 className="mt-4 font-display text-3xl lg:text-4xl">Other rooms</h3>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            {others.map((item) => (
              <Link key={item.slug} to={getRoomPath(item.slug)} className="group block">
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={item.img}
                    alt={item.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                </div>
                <h4 className="mt-5 font-display text-2xl">{item.name}</h4>
                <p className="mt-2 text-sm text-charcoal/70">{item.shortDesc}</p>
                <span className="mt-4 inline-block border-b border-charcoal pb-1 text-[0.7rem] uppercase tracking-[0.28em]">
                  Explore Room →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <RoomReviews roomName={room.name} />

      <SiteFooter />
    </div>
  );
}

export const Route = createFileRoute("/rooms/standard-river")({
  head: () => ({
    meta: [
      { title: `${STANDARD_RIVER_ROOM.name} — Mtoni River Lodge` },
      { name: "description", content: STANDARD_RIVER_ROOM.shortDesc },
      { property: "og:title", content: `${STANDARD_RIVER_ROOM.name} — Mtoni River Lodge` },
      { property: "og:description", content: STANDARD_RIVER_ROOM.shortDesc },
      { property: "og:image", content: STANDARD_RIVER_ROOM.img },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: STANDARD_RIVER_ROOM.img },
    ],
  }),
  component: StandardRiverPage,
});
