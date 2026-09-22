import { createFileRoute, Link } from "@tanstack/react-router";

const DEMO_ROOMS = [
  { slug: "standard", name: "Standard Room", description: "A practical, comfortable room for everyday stays.", capacity: "Up to 2 guests" },
  { slug: "deluxe", name: "Deluxe Room", description: "More space and a higher-comfort guest experience.", capacity: "Up to 2 guests" },
  { slug: "family", name: "Family Room", description: "Flexible accommodation for families and small groups.", capacity: "Up to 4 guests" },
];

export const Route = createFileRoute("/rooms/")({
  component: RoomsIndexPage,
});

function RoomsIndexPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-5 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">StayNas</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rooms & Availability</h1>
          </div>
          <Link to="/book" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
            Check availability
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Guest demo</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight lg:text-5xl">Choose your room.</h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            A neutral StayNas hospitality experience. Property-specific branding and live inventory are configured by the property.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {DEMO_ROOMS.map((room) => (
            <article key={room.slug} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted">
                <span className="text-sm text-muted-foreground">Room image</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold">{room.name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{room.description}</p>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{room.capacity}</p>
              <Link
                to="/book"
                className="mt-6 inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                View availability →
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
