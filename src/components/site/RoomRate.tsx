import { Reveal } from "@/components/site/Reveal";
import { StartBookingLink } from "@/lib/booking-session";

type Props = {
  eyebrow: string;
  tagline: string;
  price: string;
  unit?: string;
  note?: string;
  /** Room slug — booking CTA opens a fresh wizard session bound to this room. */
  roomSlug?: string;
};

/**
 * Elegant in-page rate block for room detail pages.
 * Sits between the hero and the long-form description as a quiet,
 * editorial price statement — not a card, not a CTA banner.
 */
export function RoomRate({ eyebrow, tagline, price, unit = "night", note, roomSlug }: Props) {
  return (
    <section className="px-6 pb-16 lg:px-12 lg:pb-24">
      <div className="mx-auto max-w-[1200px]">
        <Reveal>
          <div className="grid items-end gap-8 border-y border-charcoal/15 py-10 md:grid-cols-12 md:gap-10 lg:py-14">
            <div className="md:col-span-5">
              <p className="eyebrow text-charcoal/60">{eyebrow}</p>
              <p className="mt-3 font-display text-2xl leading-tight lg:text-3xl">{tagline}</p>
            </div>
            <div className="md:col-span-4">
              <div className="flex items-baseline gap-3">
                <span className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/55">From</span>
                <span className="font-display text-5xl leading-none lg:text-6xl">{price}</span>
                <span className="text-xs uppercase tracking-[0.24em] text-charcoal/55">/ {unit}</span>
              </div>
              {note && (
                <p className="mt-4 text-sm leading-relaxed text-charcoal/65">{note}</p>
              )}
            </div>
            <div className="md:col-span-3 md:justify-self-end">
              <StartBookingLink
                roomSlug={roomSlug}
                className="group inline-flex items-center gap-3 border border-charcoal px-6 py-3 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
              >
                <span>Reserve This Room</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </StartBookingLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}