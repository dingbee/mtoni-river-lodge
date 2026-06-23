import { Reveal } from "@/components/site/Reveal";
import { Link } from "@tanstack/react-router";

type Variant = "standard" | "deluxe" | "family";

const COPY: Record<Variant, { lead: string; bullets: string[] }> = {
  standard: {
    lead: "A balanced, quiet room that climbers consistently choose for the night before transferring to the gate — calm enough to actually sleep, simple enough to pack from quickly at first light.",
    bullets: [
      "Quiet river-facing room for deep pre-climb rest",
      "Hot showers on demand morning and night",
      "Comfortable bedding tuned for early starts",
      "Nutritious, freshly prepared meals",
      "Reliable Wi-Fi for last-minute calls home",
      "Early breakfast or packed breakfast on request",
      "Secure storage for non-climb luggage",
      "Flexible early-departure check-out",
    ],
  },
  deluxe: {
    lead: "Our quietest sleep, closest to the water — the room returning climbers most often ask for. A long shower, a deep bed, and a slow recovery breakfast on the deck.",
    bullets: [
      "Premium river-facing room for post-summit recovery",
      "Hot showers and a soaking bathtub",
      "Luxury bedding for deep, restorative sleep",
      "Nourishing meals to rebuild energy reserves",
      "Wi-Fi for sharing the summit story home",
      "Private outdoor shower and relaxation space",
      "Late arrivals coordinated with your climb operator",
      "Onward transfers to safari, Zanzibar, or JRO",
    ],
  },
  family: {
    lead: "Room for a full crew, climbing partners, or a family regrouping after the mountain — multiple beds, a shared sitting area, and garden quiet for naps that finally stretch into hours.",
    bullets: [
      "Space for groups and trekking teams",
      "Hot showers and generous bathroom space",
      "Multiple comfortable bedding arrangements",
      "Nutritious meals served family-style",
      "Garden-facing calm for unhurried recovery",
      "Wi-Fi throughout the suite",
      "Early breakfasts or packed breakfasts arranged",
      "Group transfers to and from the trailheads",
    ],
  },
};

/**
 * Room-page block positioning Mtoni River Lodge for Mount Kilimanjaro climbers.
 * Copy varies per room so the three room pages do not duplicate text — important
 * for SEO and for the very different guest mindsets of pre-climb vs. post-summit.
 */
export function TrekkerBlock({ variant }: { variant: Variant }) {
  const { lead, bullets } = COPY[variant];
  return (
    <section className="border-t border-border bg-bone/40 px-6 py-20 lg:px-12 lg:py-28">
      <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <p className="eyebrow">Ideal for Kilimanjaro Trekkers</p>
          <h2 className="mt-5 font-display text-3xl leading-tight lg:text-4xl">
            A room shaped for the mountain — before and after.
          </h2>
        </Reveal>
        <Reveal delay={150} className="lg:col-span-7">
          <p className="text-base leading-relaxed text-charcoal/80">{lead}</p>
          <ul className="mt-8 grid gap-3 text-sm text-charcoal/75 sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-baseline gap-3 border-t border-charcoal/10 pt-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-charcoal/70" />
                {b}
              </li>
            ))}
          </ul>
          <Link
            to="/mount-kilimanjaro-accommodation-arusha"
            className="mt-8 inline-flex items-center gap-2 border-b border-charcoal pb-1 text-[0.7rem] uppercase tracking-[0.28em]"
          >
            Read more about climber stays →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}