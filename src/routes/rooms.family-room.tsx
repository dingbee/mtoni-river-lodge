import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BedDouble, Maximize2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ConciergeWidget } from "@/components/site/ConciergeWidget";
import { FAMILY_ROOM, ROOMS, getRoomPath } from "@/lib/rooms";

const ROOM = FAMILY_ROOM;
const RATE = "US$340 / night";
const CATEGORY = "Family";

function RoomDetailPage() {
  const others = ROOMS.filter((item) => item.slug !== ROOM.slug);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b bg-muted/30 px-6 py-10 lg:px-10 lg:py-14">
          <div className="mx-auto max-w-7xl">
            <Link to="/rooms" className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to rooms
            </Link>
            <div className="mt-8 grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
              <div>
                <span className="inline-flex rounded-full border bg-background px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]">{CATEGORY}</span>
                <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{ROOM.name}</h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{ROOM.heroLine}</p>
              </div>
              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Indicative rate</p>
                <p className="mt-2 text-2xl font-semibold">{RATE}</p>
                <p className="mt-2 text-sm text-muted-foreground">Demo pricing. Property pricing is configured in StayNas.</p>
                <Link to="/book" search={{ room: "family-room" }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110">
                  Check availability <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr]">
            <div className="overflow-hidden rounded-2xl border bg-muted shadow-sm"><img src={ROOM.img} alt={ROOM.name} className="aspect-[4/3] h-full w-full object-cover" /></div>
            <div className="flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">About the room</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Comfort configured around the guest.</h2>
              <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
                {ROOM.description.map((p) => <p key={p}>{p}</p>)}
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <Meta icon={<Users className="h-4 w-4" />} label={ROOM.details[0].value} />
                <Meta icon={<BedDouble className="h-4 w-4" />} label={ROOM.details[1].value} />
                <Meta icon={<Maximize2 className="h-4 w-4" />} label={ROOM.size} />
                <Meta icon={<span className="text-sm">◉</span>} label={ROOM.view} />
              </div>
            </div>
          </div>
        </section>
        <section className="border-y bg-muted/20 px-6 py-12 lg:px-10 lg:py-16">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">StayNas guest journey</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Choose dates. Confirm availability. Continue your stay.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">This demo room is connected to the StayNas reservation flow so a property can configure live inventory, pricing, and guest rules behind the experience.</p>
            <Link to="/book" search={{ room: "family-room" }} className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">
              Continue with {ROOM.name} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Explore another room</p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {others.map((item) => (
              <Link key={item.slug} to={getRoomPath(item.slug)} className="group overflow-hidden rounded-2xl border bg-card shadow-sm">
                <img src={item.img} alt={item.name} className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                <div className="p-5"><h3 className="text-xl font-semibold">{item.name}</h3><p className="mt-1 text-sm text-muted-foreground">{item.shortDesc}</p></div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
      <ConciergeWidget />
    </div>
  );
}

function Meta({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-primary">{icon}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{label}</p></div>;
}

export const Route = createFileRoute("/rooms/family-room")({
  head: () => ({
    meta: [
      { title: `${ROOM.name} — StayNas` },
      { name: "description", content: ROOM.shortDesc },
      { property: "og:title", content: `${ROOM.name} — StayNas` },
      { property: "og:description", content: ROOM.shortDesc },
    ],
  }),
  component: RoomDetailPage,
});
