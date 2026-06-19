import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { TrustBar } from "@/components/site/reviews/TrustBar";
import { TripadvisorExcellentWidget } from "@/components/site/TripadvisorExcellentWidget";
import {
  trackBookingStarted,
  trackContactClick,
  trackRoomView,
} from "@/lib/analytics";
import { WHATSAPP_URL } from "@/lib/contact";
import { newBookingSessionId } from "@/lib/booking-session";
import { ROOMS, ROOM_PATHS } from "@/lib/rooms";

import heroImg from "@/assets/hero-river.jpg";
import heroImg800 from "@/assets/hero-river-800w.webp";
import heroImg1600 from "@/assets/hero-river-1600w.webp";
import logoImg from "@/assets/mtoni-logo.png";
import xpCanoe from "@/assets/xp-canoe.jpg";
import xpWaterfall from "@/assets/xp-waterfall.jpg";
import xpHotsprings from "@/assets/xp-hotsprings.jpg";
import aerialImg from "@/assets/aerial-lodge.jpg";

const WIZARD_STORAGE_KEY = "mrl.booking.wizard.v1";

const CANONICAL = "https://mtoniriverlodge.com/stay";

const ROOM_PRICES: Record<string, number> = {
  "standard-river": 260,
  "riverfront-deluxe": 310,
  "family-room": 360,
};

export const Route = createFileRoute("/stay")({
  head: () => ({
    meta: [
      {
        title:
          "Stay at Mtoni River Lodge — Riverside Retreat 10 min from Arusha Airport",
      },
      {
        name: "description",
        content:
          "Book your stay at Mtoni River Lodge — a peaceful riverside retreat 10 minutes from Arusha Airport (JRO). Live availability, secure card payments, free cancellation up to 60 days.",
      },
      { property: "og:title", content: "Stay at Mtoni River Lodge — Arusha, Tanzania" },
      {
        property: "og:description",
        content:
          "Your first and last stop in Northern Tanzania. Riverside rooms, curated experiences, secure online booking.",
      },
      { property: "og:image", content: heroImg },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroImg },
    ],
    links: [
      { rel: "canonical", href: CANONICAL },
      {
        rel: "preload",
        as: "image",
        href: heroImg800,
        type: "image/webp",
        imageSrcSet: `${heroImg800} 800w, ${heroImg1600} 1600w`,
        imageSizes: "100vw",
        fetchPriority: "high",
      },
    ],
  }),
  component: StayLanding,
});

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (base: string, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function StayLanding() {
  const navigate = useNavigate();
  const defaultIn = todayISO();
  const [checkIn, setCheckIn] = useState(defaultIn);
  const [checkOut, setCheckOut] = useState(addDaysISO(defaultIn, 2));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const startBooking = (location: string, roomSlug?: string) => {
    const sessionId = newBookingSessionId();
    trackBookingStarted({
      location,
      check_in: checkIn,
      check_out: checkOut,
      guests: adults + children,
      room_slug: roomSlug,
    });
    // Pre-write wizard state so /book hydrates with the chosen dates.
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          WIZARD_STORAGE_KEY,
          JSON.stringify({
            sessionId,
            checkIn,
            checkOut,
            adults,
            children,
            results: [],
            selectedRoom: null,
            extras: [],
            selectedExtras: [],
            guest: { name: "", email: "", phone: "", country: "", requests: "" },
          }),
        );
      } catch {}
    }
    void navigate({
      to: "/book",
      search: { step: 1, session: sessionId, room: roomSlug },
    });
  };

  return (
    <div className="bg-ivory text-charcoal">
      <LandingHeader />

      {/* HERO */}
      <section className="relative overflow-hidden min-h-[640px] lg:min-h-[680px]">
        <picture>
          <source
            type="image/webp"
            srcSet={`${heroImg800} 800w, ${heroImg1600} 1600w`}
            sizes="100vw"
          />
          <img
            src={heroImg}
            alt="Nduruma River at Mtoni River Lodge, Arusha"
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/65" />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-24 sm:px-6 lg:flex-row lg:items-end lg:gap-12 lg:pt-32">
          <div className="max-w-2xl text-ivory">
            <p className="inline-flex items-center gap-2 rounded-full border border-ivory/30 bg-black/40 px-4 py-1.5 text-[0.65rem] uppercase tracking-[0.28em]">
              <MapPin className="h-3 w-3" /> 10 minutes from Arusha Airport
            </p>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Your first &amp; last stop in Northern Tanzania.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ivory/85">
              A peaceful riverside retreat on the Nduruma River — perfect before or
              after your safari, with secure online booking and curated experiences.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4 text-sm text-ivory/85">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> 4.9★ on TripAdvisor</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Free cancellation 60+ days</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Pay 50% deposit</span>
            </div>
          </div>

          {/* Hero booking form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startBooking("stay_hero");
            }}
            className="w-full max-w-md rounded-2xl border border-ivory/15 bg-ivory p-6 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.6)] lg:w-[400px]"
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-charcoal/70">
              Check live availability
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Check-in">
                <input
                  type="date"
                  min={todayISO()}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Check-out">
                <input
                  type="date"
                  min={checkIn || todayISO()}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={fieldCls}
                />
              </Field>
              <Field label="Adults">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={adults}
                  onChange={(e) =>
                    setAdults(Math.max(1, Number(e.target.value) || 1))
                  }
                  className={fieldCls}
                />
              </Field>
              <Field label="Children">
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={children}
                  onChange={(e) =>
                    setChildren(Math.max(0, Number(e.target.value) || 0))
                  }
                  className={fieldCls}
                />
              </Field>
            </div>
            <button
              type="submit"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_18px_40px_-18px_rgba(52,103,57,0.7)] transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
            >
              Check Availability →
            </button>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick("whatsapp", "stay_hero")}
              className="mt-3 flex items-center justify-center gap-2 text-[0.7rem] uppercase tracking-[0.22em] text-charcoal/70 hover:text-charcoal"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Or chat on WhatsApp
            </a>
          </form>
        </div>
      </section>

      {/* TRUST BAR */}
      <TrustBar variant="subtle" compact />

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
              title="10 min from JRO"
              body="Arusha Airport is a 10-minute drive. Optional airport transfer keeps your arrival effortless."
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
              return (
                <article
                  key={r.slug}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-charcoal/10 bg-ivory shadow-[0_18px_48px_-30px_rgba(30,45,30,0.4)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={r.img}
                      alt={r.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-xl">{r.name}</h3>
                    <p className="mt-1 text-sm text-charcoal/65">{r.shortDesc}</p>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/55">
                        From
                      </span>
                      <span className="font-display text-2xl">${price}</span>
                      <span className="text-xs text-charcoal/55">/ night</span>
                    </div>
                    <div className="mt-5 flex flex-col gap-2">
                      <button
                        onClick={() => {
                          trackRoomView(r.name, "stay_room_cards");
                          startBooking("stay_room_card", r.slug);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110"
                        style={{
                          background:
                            "linear-gradient(135deg, #346739 0%, #427A43 100%)",
                        }}
                      >
                        Book this room →
                      </button>
                      <Link
                        to={ROOM_PATHS[r.slug]}
                        className="text-center text-[0.7rem] uppercase tracking-[0.22em] text-charcoal/65 hover:text-charcoal"
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
      

      {/* EXPERIENCES (add-ons) */}
      
        <section className="bg-bone/40 py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 max-w-2xl">
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/60">
                Curated add-ons
              </p>
              <h2 className="mt-3 font-display text-3xl lg:text-4xl">
                Make your stay unforgettable.
              </h2>
              <p className="mt-3 text-sm text-charcoal/70">
                Add any of these at checkout — no separate bookings, no hidden fees.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <AddOnCard
                img={aerialImg}
                title="Airport Transfer"
                price="USD 70 per booking"
                body="10-minute private transfer from Arusha Airport (JRO) to the lodge."
              />
              <AddOnCard
                img={xpCanoe}
                title="Lake Duluti Canoeing"
                price="USD 55 per person"
                body="Guided canoe on a hidden crater lake — birdlife, calm water, Mount Meru views."
              />
              <AddOnCard
                img={xpWaterfall}
                title="Waterfall Excursion"
                price="USD 45 per person"
                body="A short hike to a forest waterfall on the lower slopes of Mount Meru."
              />
              <AddOnCard
                img={xpHotsprings}
                title="Maji Moto Hot Springs"
                price="USD 250 per booking (up to 4)"
                body="Day trip to crystal-clear natural springs — swim, picnic, return refreshed."
              />
            </div>
            <p className="mt-6 text-xs text-charcoal/55">
              Also available: Local Market Experience · Mountain Bike Adventure ·
              Live Cooking · Guided River Walks (complimentary).
            </p>
          </div>
        </section>
      

      {/* REVIEWS */}
      
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-[0.28em] text-charcoal/60">
              What guests say
            </p>
            <h2 className="mt-3 font-display text-3xl lg:text-4xl">
              4.9 out of 5 — and a 2026 Travelers&apos; Choice.
            </h2>
          </div>
          <div className="mt-10 flex justify-center">
            <TripadvisorExcellentWidget />
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Testimonial
              quote="A perfect first night in Tanzania — quiet, comfortable, and the river is magical at dawn."
              author="Helen R."
              context="Safari traveler, UK"
            />
            <Testimonial
              quote="Ten minutes from the airport but feels a world away. We&apos;ll be back."
              author="Marcus T."
              context="Family stay, Germany"
            />
            <Testimonial
              quote="The team made our post-Serengeti recovery effortless. Beautiful food, real hospitality."
              author="Aisha &amp; Daniel"
              context="Honeymoon, Kenya"
            />
          </div>
        </section>
      

      {/* BOOKING BENEFITS */}
      
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
      

      {/* FINAL CTA */}
      
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-3xl lg:text-4xl">
            Ready to book your riverside stay?
          </h2>
          <p className="mt-4 text-sm text-charcoal/70">
            Live availability. Instant confirmation. Real human help if you need it.
          </p>
          <div className="mt-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              onClick={() => startBooking("stay_final_cta")}
              className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_18px_40px_-18px_rgba(52,103,57,0.7)] transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
            >
              Check Availability →
            </button>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick("whatsapp", "stay_final_cta")}
              className="inline-flex items-center gap-2 rounded-full border border-charcoal px-6 py-3.5 text-[0.7rem] uppercase tracking-[0.28em] hover:bg-charcoal hover:text-ivory"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp our team
            </a>
          </div>
        </section>
      

      {/* MINIMAL FOOTER */}
      <footer className="border-t border-charcoal/10 bg-bone/40 py-8 text-xs text-charcoal/65">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Mtoni River Lodge · Gomba Estate, Arusha, Tanzania</p>
          <div className="flex items-center gap-5">
            <Link to="/terms" className="hover:text-charcoal">Terms</Link>
            <Link to="/privacy" className="hover:text-charcoal">Privacy</Link>
            <Link to="/contact" className="hover:text-charcoal">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Bits ─── */

const fieldCls =
  "w-full rounded-lg border border-charcoal/15 bg-ivory px-3 py-2.5 text-sm outline-none focus:border-charcoal focus:ring-2 focus:ring-charcoal/15";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function LandingHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-ivory">
          <img src={logoImg} alt="Mtoni River Lodge" className="h-9 w-auto" />
          <span className="hidden font-display text-base sm:inline">Mtoni River Lodge</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="tel:+255752441443"
            onClick={() => trackContactClick("phone", "stay_header")}
            className="hidden items-center gap-2 rounded-full border border-ivory/40 px-4 py-2 text-[0.65rem] uppercase tracking-[0.22em] text-ivory transition hover:bg-ivory hover:text-charcoal sm:inline-flex"
          >
            <Phone className="h-3.5 w-3.5" /> +255 752 441 443
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackContactClick("whatsapp", "stay_header")}
            className="inline-flex items-center gap-2 rounded-full bg-ivory px-4 py-2 text-[0.65rem] uppercase tracking-[0.22em] text-charcoal transition hover:bg-ivory/90"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </div>
      </div>
    </header>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#427A43]/10">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg">{title}</h3>
      <p className="mt-2 text-sm text-charcoal/70">{body}</p>
    </div>
  );
}

function AddOnCard({
  img,
  title,
  price,
  body,
}: {
  img: string;
  title: string;
  price: string;
  body: string;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-charcoal/10 bg-ivory">
      <div className="aspect-[4/3] overflow-hidden">
        <img src={img} alt={title} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="p-5">
        <h3 className="font-display text-base">{title}</h3>
        <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-charcoal/60">
          {price}
        </p>
        <p className="mt-2 text-sm text-charcoal/70">{body}</p>
      </div>
    </article>
  );
}

function Testimonial({
  quote,
  author,
  context,
}: {
  quote: string;
  author: string;
  context: string;
}) {
  return (
    <figure className="rounded-2xl border border-charcoal/10 bg-ivory p-6">
      <blockquote className="text-sm leading-relaxed text-charcoal/85">
        “{quote}”
      </blockquote>
      <figcaption className="mt-4 text-[0.7rem] uppercase tracking-[0.22em] text-charcoal/60">
        {author} · {context}
      </figcaption>
    </figure>
  );
}

function Benefit({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ivory/10 text-ivory">
        {icon}
      </div>
      <div>
        <h3 className="font-display text-base text-ivory">{title}</h3>
        <p className="mt-1 text-xs text-ivory/70">{body}</p>
      </div>
    </div>
  );
}