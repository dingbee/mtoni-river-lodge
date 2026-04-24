import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { WHATSAPP_NOTE, WHATSAPP_URL } from "@/lib/contact";
import { FAMILY_ROOM, ROOMS, getRoomPath } from "@/lib/rooms";

function FamilyRoomPage() {
  const room = FAMILY_ROOM;
  const others = ROOMS.filter((item) => item.slug !== room.slug);

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      <section className="relative h-[88svh] min-h-[560px] overflow-hidden">
        <img src={room.img} alt={room.name} className="ken-burns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 via-charcoal/20 to-charcoal/70" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-16 text-ivory lg:px-12 lg:pb-24">
          <Reveal>
            <Link to="/rooms" className="eyebrow inline-flex items-center gap-2 !text-ivory/70">
              ← Back to Rooms
            </Link>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] lg:text-7xl">{room.name}</h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-5 max-w-xl font-display text-2xl italic text-ivory/85 lg:text-3xl">{room.heroLine}</p>
          </Reveal>
          <Reveal delay={360}>
            <Link
              to="/book"
              className="mt-10 inline-flex items-center gap-3 border border-ivory bg-ivory px-7 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
            >
              <span>Check Availability</span>
              <span>→</span>
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow">No. {room.no}</p>
            <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">Space to gather, room to breathe.</h2>
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
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {room.gallery.map((image, index) => (
              <div key={image} className="aspect-[4/5] overflow-hidden">
                <img
                  src={image}
                  alt={`${room.name} gallery image ${index + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-bone/40 px-6 py-20 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow">Room Details</p>
          <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">Size</p>
              <p className="mt-3 font-display text-2xl leading-tight">{room.size}</p>
            </div>
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
                className="group inline-flex items-center gap-3 border border-charcoal bg-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-transparent hover:text-charcoal"
              >
                <span>Check Availability</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 border border-charcoal px-8 py-4 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
              >
                <span>Chat on WhatsApp</span>
                <span>→</span>
              </a>
            </div>
            <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-charcoal/60">
              {WHATSAPP_NOTE} For availability and personalized arrangements, connect with us directly on WhatsApp.
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

      <SiteFooter />
    </div>
  );
}

export const Route = createFileRoute("/rooms/family-room")({
  head: () => ({
    meta: [
      { title: `${FAMILY_ROOM.name} — Mtoni River Lodge` },
      { name: "description", content: FAMILY_ROOM.shortDesc },
      { property: "og:title", content: `${FAMILY_ROOM.name} — Mtoni River Lodge` },
      { property: "og:description", content: FAMILY_ROOM.shortDesc },
      { property: "og:image", content: FAMILY_ROOM.img },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: FAMILY_ROOM.img },
    ],
  }),
  component: FamilyRoomPage,
});
