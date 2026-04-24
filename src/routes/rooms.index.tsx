import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { WHATSAPP_NOTE } from "@/lib/contact";
import { ROOMS, getRoomPath, type Room } from "@/lib/rooms";
import roomImg from "@/assets/suite-interior.jpg";

export const Route = createFileRoute("/rooms/")({
  head: () => ({
    meta: [
      { title: "Rooms — Mtoni River Lodge" },
      { name: "description", content: "Earth-and-thatch rooms by the river at Mtoni River Lodge — accommodations inspired by Maasai boma design, grounded in natural materials and quiet luxury." },
      { property: "og:title", content: "Rooms — Mtoni River Lodge" },
      { property: "og:description", content: "Discover earth-and-thatch rooms by the river at Mtoni River Lodge, each inspired by Maasai boma design with its own private atmosphere." },
      { property: "og:image", content: roomImg },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: roomImg },
    ],
  }),
  component: RoomsIndexPage,
});

function RoomsIndexPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />
      <section className="relative h-[70svh] overflow-hidden">
        <img src={roomImg} alt="Room interior" className="ken-burns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 to-charcoal/60" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1300px] px-6 pb-20 text-ivory lg:px-12">
          <Reveal><p className="eyebrow !text-ivory/70">Rooms by the River</p></Reveal>
          <Reveal delay={150}><h1 className="mt-6 font-display text-5xl leading-tight lg:text-7xl">Rooms at Mtoni<br />River Lodge.</h1></Reveal>
          <Reveal delay={300}>
            <p className="mt-6 max-w-xl text-ivory/80">
              Earth-and-thatch accommodations inspired by Maasai boma design — 24 quiet sanctuaries along the Nduruma River, each shaped by stone, timber, and the rhythm of the water.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1400px] space-y-32 lg:space-y-48">
          {ROOMS.map((room, index) => (
            <RoomRow key={room.no} room={room} reverse={index % 2 === 1} />
          ))}
        </div>
      </section>
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
          <Link to={roomPath} className="group block aspect-[4/3] overflow-hidden">
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
              className="group inline-flex items-center gap-3 border border-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
            >
              <span>Explore Room</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/book"
              className="inline-flex items-center gap-3 border-b border-charcoal pb-1 text-[0.72rem] uppercase tracking-[0.28em]"
            >
              Check Availability →
            </Link>
          </div>
          <p className="mt-3 max-w-sm text-xs leading-relaxed text-charcoal/55">
            {WHATSAPP_NOTE}
          </p>
        </div>
      </div>
    </Reveal>
  );
}
