import { Link } from "@tanstack/react-router";
import { ArrowRight, BedDouble, Maximize2, Users } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ConciergeWidget } from "@/components/site/ConciergeWidget";
import { ROOMS, type Room } from "@/lib/rooms";

const ROOM_META: Record<string, { rate: string; bed: string; category: string }> = {
  "standard-river": { rate: "From US$180 / night", bed: "Queen or twin", category: "Essential" },
  "riverfront-deluxe": { rate: "From US$260 / night", bed: "King", category: "Premium" },
  "family-room": { rate: "From US$340 / night", bed: "King + twins", category: "Family" },
};

export const Route = createFileRoute("/rooms/")({
  component: RoomsIndexPage,
});

function RoomsIndexPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b bg-muted/30 px-6 py-14 lg:px-10 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Guest experience</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">Rooms designed for the stay.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Explore a neutral StayNas demo property. Select dates and guests to check live availability and continue your reservation.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
          <div className="grid gap-6 lg:grid-cols-3">
            {ROOMS.map((room) => <RoomCard key={room.slug} room={room} />)}
          </div>
        </section>

        <section className="border-y bg-muted/20 px-6 py-12 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-2xl border bg-card p-7 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ready to search?</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Check dates, guests, and availability.</h2>
              <p className="mt-2 text-sm text-muted-foreground">Your selected room can be carried directly into the booking flow.</p>
            </div>
            <Link to="/book" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110">
              Check availability <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <ConciergeWidget />
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const meta = ROOM_META[room.slug];
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img src={room.img} alt={room.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
        <span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] backdrop-blur">{meta.category}</span>
      </div>
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{room.no} · {room.shortName}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{room.name}</h2>
          </div>
          <p className="whitespace-nowrap text-right text-sm font-semibold text-primary">{meta.rate}</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{room.shortDesc}</p>
        <div className="mt-6 grid grid-cols-3 gap-3 border-y py-4">
          <Meta icon={<Users className="h-4 w-4" />} label={room.details[0]?.value ?? "Up to 2 guests"} />
          <Meta icon={<BedDouble className="h-4 w-4" />} label={meta.bed} />
          <Meta icon={<Maximize2 className="h-4 w-4" />} label={room.size} />
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">{room.view}</span>
          <Link
            to="/book"
            search={{ room: room.slug }}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            View availability <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="min-w-0"><div className="flex items-center gap-1.5 text-primary">{icon}</div><p className="mt-1 truncate text-xs text-muted-foreground">{label}</p></div>;
}
