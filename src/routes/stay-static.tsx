import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Leaf,
  Plane,
  Sparkles,
  ShieldCheck,
  Waves,
  CalendarCheck,
  CreditCard,
  MessageCircle,
  Phone,
  Check,
  MapPin,
} from "lucide-react";
import { ROOMS, ROOM_PATHS } from "@/lib/rooms";

import heroImg from "@/assets/hero-river.jpg";
import logoImg from "@/assets/mtoni-logo.png";
import xpCanoe from "@/assets/xp-canoe.jpg";
import xpWaterfall from "@/assets/xp-waterfall.jpg";
import xpHotsprings from "@/assets/xp-hotsprings.jpg";
import aerialImg from "@/assets/aerial-lodge.jpg";

/**
 * DIAGNOSTIC: fully-static mirror of /stay.
 *
 * Stripped vs /stay:
 *   - no Framer Motion / AnimatePresence (none existed)
 *   - no scroll / hover / lazy-load transitions
 *   - no parallax, transform, translate3d, perspective, will-change
 *   - no backdrop-filter, mix-blend-mode, clip-path, mask-image
 *   - no `transition-*`, no `hover:brightness-*`, no filter utilities
 *   - no large multi-stop box-shadows
 *   - no inline linear-gradient backgrounds (replaced with solid color)
 *   - no `<picture>` + absolute-positioned hero image; hero is a static
 *     <img> in normal flow with a solid color band above it
 *   - no `loading="lazy"` (all images eager + explicit dimensions)
 *
 * Layout, copy and structure mirror /stay so visual comparison is direct.
 */

const ROOM_PRICES: Record<string, number> = {
  "standard-river": 260,
  "riverfront-deluxe": 310,
  "family-room": 360,
};

const ROOM_IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "riverfront-deluxe": { width: 1264, height: 848 },
  "standard-river": { width: 1824, height: 1216 },
  "family-room": { width: 862, height: 575 },
};

export const Route = createFileRoute("/stay-static")({
  head: () => ({
    meta: [
      { title: "Stay (static diagnostic) — Mtoni River Lodge" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StayStatic,
});

function StayStatic() {
  return (
    <div className="bg-ivory text-charcoal">
      {/* Header — solid, no transitions */}
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-ivory">
            <img src={logoImg} alt="Mtoni River Lodge" width={36} height={36} className="block h-9 w-auto" />
            <span className="hidden font-display text-base sm:inline">Mtoni River Lodge</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="tel:+255752441443"
              className="hidden items-center gap-2 rounded-full border border-ivory/40 px-4 py-2 text-[0.65rem] uppercase tracking-[0.22em] text-ivory sm:inline-flex"
            >
              <Phone className="h-3.5 w-3.5" /> +255 752 441 443
            </a>
            <span className="inline-flex items-center gap-2 rounded-full bg-ivory px-4 py-2 text-[0.65rem] uppercase tracking-[0.22em] text-charcoal">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </span>
          </div>
        </div>
      </header>

      {/* HERO — static image in normal flow, no overlay, no absolute children */}
      <section>
        <img
          src={heroImg}
          alt="Nduruma River at Mtoni River Lodge, Arusha"
          width={1600}
          height={900}
          className="block h-auto w-full"
        />
        <div className="bg-charcoal text-ivory">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-ivory/30 px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.28em]">
              <MapPin className="h-3 w-3" /> 50 minutes from Kilimanjaro International Airport
            </p>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Your first &amp; last stop in Northern Tanzania.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ivory/85">
              A peaceful riverside retreat on the Nduruma River — perfect before or after your safari.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4 text-sm text-ivory/85">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> 4.9★ on TripAdvisor</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Free cancellation 60+ days</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Pay 50% deposit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Availability — static placeholder (no form interactivity needed for visual diag) */}
      <section className="border-b border-charcoal/10 bg-bone/40">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-charcoal/70">
            Check live availability (static diagnostic)
          </p>
          <p className="mt-2 text-sm text-charcoal/70">
            This static page is for visual diagnosis only — booking form omitted.
          </p>
        </div>
      </section>

      {/* WHY MTONI */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-8 sm:grid-cols-3">
          <Pillar
            icon={<Waves className="h-6 w-6" style={{ color: "#346739" }} />}
            title="Riverside sanctuary"
            body="Thatched Maasai-inspired rooms set directly on the Nduruma River — quiet, grounded, immersed in nature."
          />
          <Pillar
            icon={<Plane className="h-6 w-6" style={{ color: "#346739" }} />}
            title="50 min from JRO"
            body="Kilimanjaro International Airport is a 50-minute drive. Optional airport transfer keeps your arrival effortless."
          />
          <Pillar
            icon={<Sparkles className="h-6 w-6" style={{ color: "#346739" }} />}
            title="Curated experiences"
            body="Lake Duluti canoeing, waterfall hikes, market visits and hot springs — bookable at checkout."
          />
        </div>
      </section>

      {/* FEATURED ROOMS */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/60">
              <Leaf className="mr-1.5 inline h-3 w-3" style={{ color: "#427A43" }} />
              Choose your room
            </p>
            <h2 className="mt-3 font-display text-3xl lg:text-4xl">
              Three rooms. One river.
            </h2>
          </div>
          <p className="max-w-sm text-sm text-charcoal/70">
            All rates in USD. Pay a 50% deposit now and the balance on arrival.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {ROOMS.map((r) => {
            const price = ROOM_PRICES[r.slug];
            const d = ROOM_IMAGE_DIMENSIONS[r.slug];
            return (
              <article
                key={r.slug}
                className="flex flex-col rounded-2xl border border-charcoal/10 bg-ivory"
              >
                <div className="rounded-t-2xl bg-bone">
                  <img
                    src={r.img}
                    alt={r.name}
                    width={d.width}
                    height={d.height}
                    className="block h-auto w-full rounded-t-2xl"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-xl">{r.name}</h3>
                  <p className="mt-1 text-sm text-charcoal/65">{r.shortDesc}</p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/55">From</span>
                    <span className="font-display text-2xl">${price}</span>
                    <span className="text-xs text-charcoal/55">/ night</span>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    <span
                      className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory"
                      style={{ background: "#346739" }}
                    >
                      Book this room →
                    </span>
                    <Link
                      to={ROOM_PATHS[r.slug]}
                      className="text-center text-[0.7rem] uppercase tracking-[0.22em] text-charcoal/65"
                    >
                      Room details
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* EXPERIENCES */}
      <section className="bg-bone/40 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 max-w-2xl">
            <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/60">Curated add-ons</p>
            <h2 className="mt-3 font-display text-3xl lg:text-4xl">Make your stay unforgettable.</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <AddOnCard img={aerialImg} title="Airport Transfer" price="USD 70 per booking" body="10-minute private transfer from Arusha Airport (JRO) to the lodge." />
            <AddOnCard img={xpCanoe} title="Lake Duluti Canoeing" price="USD 55 per person" body="Guided canoe on a hidden crater lake — birdlife, calm water, Mount Meru views." />
            <AddOnCard img={xpWaterfall} title="Waterfall Excursion" price="USD 45 per person" body="A short hike to a forest waterfall on the lower slopes of Mount Meru." />
            <AddOnCard img={xpHotsprings} title="Maji Moto Hot Springs" price="USD 250 per booking (up to 4)" body="Day trip to crystal-clear natural springs — swim, picnic, return refreshed." />
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="bg-charcoal text-ivory py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Benefit icon={<CreditCard className="h-5 w-5" />} title="Pay 50% deposit" body="Balance on arrival — no full prepayment." />
            <Benefit icon={<CalendarCheck className="h-5 w-5" />} title="Free cancellation" body="Full refund 60+ days before check-in." />
            <Benefit icon={<ShieldCheck className="h-5 w-5" />} title="Secure payments" body="Card payments processed by Pesapal." />
            <Benefit icon={<Sparkles className="h-5 w-5" />} title="Instant confirmation" body="Email receipt sent the moment payment clears." />
          </div>
        </div>
      </section>

      <footer className="border-t border-charcoal/10 bg-bone/40 py-8 text-xs text-charcoal/65">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          Static diagnostic page · /stay-static
        </div>
      </footer>
    </div>
  );
}

function Pillar({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#427A43]/10">{icon}</div>
      <h3 className="mt-4 font-display text-lg">{title}</h3>
      <p className="mt-2 text-sm text-charcoal/70">{body}</p>
    </div>
  );
}

function AddOnCard({ img, title, price, body }: { img: string; title: string; price: string; body: string }) {
  return (
    <article className="rounded-2xl border border-charcoal/10 bg-ivory">
      <img src={img} alt={title} width={1200} height={900} className="block h-auto w-full rounded-t-2xl" />
      <div className="p-5">
        <h3 className="font-display text-base">{title}</h3>
        <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-charcoal/60">{price}</p>
        <p className="mt-2 text-sm text-charcoal/70">{body}</p>
      </div>
    </article>
  );
}

function Benefit({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ivory/10 text-ivory">{icon}</div>
      <div>
        <h3 className="font-display text-base text-ivory">{title}</h3>
        <p className="mt-1 text-xs text-ivory/70">{body}</p>
      </div>
    </div>
  );
}