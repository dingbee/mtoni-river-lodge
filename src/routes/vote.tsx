import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, Heart, Leaf, Sparkles, Users, Star, Instagram, MessageCircle, Share2 } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { WHATSAPP_URL } from "@/lib/contact";
import { trackVoteClick, trackShareClick, trackContactClick } from "@/lib/analytics";
import heroImg from "@/assets/hero-river.jpg";
import aerialImg from "@/assets/aerial-lodge.jpg";
import suiteImg from "@/assets/suite-interior.jpg";
import diningImg from "@/assets/dining.jpg";
import poolImg from "@/assets/pool.jpg";
import riverWalkImg from "@/assets/xp-river-walk.jpg";
import ritualImg from "@/assets/rituals.jpg";
import sunsetImg from "@/assets/lodge-hero-aerial.jpg";
import voteWelcomeAsset from "@/assets/vote-welcome.jpg.asset.json";
import voteMaasaiRiverAsset from "@/assets/vote-maasai-river.jpg.asset.json";

const VOTE_URL = "https://luxuryhotelawards.com/vote/";
const SHARE_TEXT =
  "Help Mtoni River Lodge win at the World Luxury Hotel Awards — vote here:";
const SHARE_URL = "https://mtoniriverlodge.com/vote";

export const Route = createFileRoute("/vote")({
  head: () => ({
    meta: [
      { title: "Vote for Mtoni — World Luxury Hotel Awards Nominee" },
      {
        name: "description",
        content:
          "Mtoni River Lodge has been nominated for the World Luxury Hotel Awards. Cast your vote and help showcase authentic Tanzanian hospitality on the global stage.",
      },
      { property: "og:title", content: "Vote for Mtoni — World Luxury Hotel Awards" },
      {
        property: "og:description",
        content:
          "If Mtoni has been part of a memorable journey for you, your vote would mean the world.",
      },
      { property: "og:url", content: SHARE_URL },
      { property: "og:image", content: heroImg },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: SHARE_URL }],
  }),
  component: VotePage,
});

function VotePage() {
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader overlay />

      {/* ───────────────── SECTION 1 — HERO ───────────────── */}
      <section className="relative h-[100svh] min-h-[620px] w-full overflow-hidden">
        <img
          src={heroImg}
          alt="Mist rising from the Nduruma River at first light"
          className="ken-burns absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={1080}
        />
        <div className="hero-overlay pointer-events-none absolute inset-0" />

        <div className="relative z-10 mx-auto flex h-full max-w-[1300px] flex-col items-center justify-center px-6 pb-16 pt-[120px] text-center text-ivory lg:px-12">
          <Reveal>
            <Breadcrumbs variant="light" className="mb-6 justify-center" />
          </Reveal>
          <Reveal>
            <AwardBadge />
          </Reveal>

          <Reveal delay={180}>
            <p className="eyebrow mt-10 !text-ivory/80">A nomination, an invitation</p>
          </Reveal>

          <Reveal delay={260}>
            <h1 className="hero-text-shadow mt-6 max-w-[840px] font-display text-[2.4rem] leading-[1.05] text-ivory sm:text-5xl lg:text-[4.5rem]">
              Help Mtoni Shine on the Global Stage
            </h1>
          </Reveal>

          <Reveal delay={360}>
            <p className="hero-text-shadow mx-auto mt-7 max-w-[620px] text-base leading-relaxed text-ivory/90 lg:text-lg">
              Mtoni River Lodge has been nominated for the World Luxury Hotel Awards. If we
              have been part of a memorable experience for you, your vote would mean the world to us.
            </p>
          </Reveal>

          <Reveal delay={460}>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
              <a
                href={VOTE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackVoteClick("vote_page_hero")}
                className="group inline-flex items-center gap-3 bg-[#C0B87A] px-8 py-4 text-[0.72rem] font-medium uppercase tracking-[0.3em] text-charcoal shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] transition-all hover:bg-ivory hover:tracking-[0.32em]"
              >
                Vote Now
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
              <Link
                to="/"
                className="inline-flex items-center gap-3 border border-ivory/80 px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
              >
                Explore Mtoni
              </Link>
            </div>
          </Reveal>

          <Reveal delay={600}>
            <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-ivory/70 lg:flex">
              <span className="text-[0.6rem] uppercase tracking-[0.32em]">Scroll</span>
              <span className="h-10 w-px animate-pulse bg-ivory/60" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── SECTION 2 — WHY YOUR VOTE MATTERS ───────────────── */}
      <section className="px-6 py-28 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1300px]">
          <div className="grid items-center gap-16 lg:grid-cols-12">
            <Reveal className="lg:col-span-6">
              <div className="relative aspect-[4/5] overflow-hidden lg:aspect-[5/6]">
                <img
                  src={voteWelcomeAsset.url}
                  alt="A thatched Mtoni boma nestled among the trees"
                  className="h-full w-full object-cover transition-transform duration-[2000ms] hover:scale-105"
                  loading="lazy"
                />
              </div>
            </Reveal>
            <Reveal delay={150} className="lg:col-span-6 lg:pl-6">
              <p className="eyebrow">Why your vote matters</p>
              <h2 className="mt-5 font-display text-4xl leading-[1.08] lg:text-6xl">
                Every Vote Celebrates Exceptional Hospitality
              </h2>
              <p className="mt-7 max-w-lg text-base leading-relaxed text-charcoal/70">
                The World Luxury Hotel Awards recognise destinations and the people behind
                them — the unseen craft of welcome, the quiet pursuit of beauty, the
                stewardship of land. Your support helps shine a light on independent retreats
                shaped with care, and on a hospitality born here, along the Nduruma River.
              </p>

              <ul className="mt-10 grid gap-5 sm:grid-cols-2">
                {[
                  { Icon: Heart, label: "Authentic Hospitality" },
                  { Icon: Leaf, label: "Unique Nature Experience" },
                  { Icon: Sparkles, label: "Exceptional Service" },
                  { Icon: Award, label: "Sustainable Luxury" },
                ].map(({ Icon, label }) => (
                  <li
                    key={label}
                    className="group flex items-start gap-4 border-t border-charcoal/15 pt-5"
                  >
                    <Icon
                      className="mt-1 h-6 w-6 flex-shrink-0 text-[#C0B87A] transition-transform group-hover:scale-110"
                      strokeWidth={1.4}
                      aria-hidden
                    />
                    <span className="font-display text-lg leading-snug text-charcoal/90">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────────────── SECTION 3 — EXPERIENCE MTONI ───────────────── */}
      <section className="bg-bone px-6 py-28 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Experience Mtoni</p>
            <h2 className="mt-5 font-display text-4xl leading-[1.08] lg:text-6xl">
              Moments Worth Remembering
            </h2>
            <p className="mt-7 text-base leading-relaxed text-charcoal/70">
              A collection of quiet rituals shaped by river and forest — the architecture, the
              suites, the table, the still water, the people who hold it all together.
            </p>
          </Reveal>

          <div className="mt-20 grid auto-rows-[200px] grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4 md:auto-rows-[240px] lg:gap-7">
            {[
              { img: aerialImg, alt: "Aerial view of Mtoni River Lodge", span: "col-span-2 row-span-2" },
              { img: suiteImg, alt: "Candlelit Mtoni suite", span: "col-span-1 row-span-1" },
              { img: voteMaasaiRiverAsset.url, alt: "A Maasai elder beside the Nduruma River", span: "col-span-1 row-span-1" },
              { img: diningImg, alt: "Mtoni dining hall", span: "col-span-2 row-span-1 md:col-span-1 md:row-span-2" },
              { img: poolImg, alt: "Round pool in conversation with nature", span: "col-span-1 row-span-1" },
              { img: ritualImg, alt: "Evening candlelight ritual", span: "col-span-1 row-span-1" },
              { img: riverWalkImg, alt: "Guided river walk at sunrise along the Mtoni River", span: "col-span-2 row-span-1 md:col-span-2" },
            ].map((tile, i) => (
              <Reveal key={i} delay={i * 80} className={`group relative overflow-hidden ${tile.span}`}>
                <img
                  src={tile.img}
                  alt={tile.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.06]"
                />
                <div className="pointer-events-none absolute inset-0 bg-charcoal/0 transition-colors duration-700 group-hover:bg-charcoal/15" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── SECTION 4 — TESTIMONIALS ───────────────── */}
      <Testimonials />

      {/* ───────────────── SECTION 5 — VOTING PROCESS ───────────────── */}
      <section className="px-6 py-28 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1300px]">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">How to vote</p>
            <h2 className="mt-5 font-display text-4xl leading-[1.08] lg:text-6xl">
              Voting Takes Less Than a Minute
            </h2>
            <p className="mt-7 text-base leading-relaxed text-charcoal/70">
              Three small gestures of support — and you've helped place an independent
              Tanzanian lodge among the world's most refined.
            </p>
          </Reveal>

          <div className="relative mt-20 grid gap-8 md:grid-cols-3 lg:gap-10">
            {/* Connecting line (desktop) */}
            <div className="pointer-events-none absolute left-0 right-0 top-[58px] hidden h-px bg-gradient-to-r from-transparent via-[#C0B87A]/60 to-transparent md:block" />

            {[
              {
                n: "01",
                title: "Click Vote Now",
                body: "Tap the Vote button on this page — it opens the official World Luxury Hotel Awards ballot in a new tab.",
              },
              {
                n: "02",
                title: "Select Mtoni River Lodge",
                body: "Find Mtoni River Lodge listed under the Africa luxury category and choose us with a single click.",
              },
              {
                n: "03",
                title: "Submit Your Vote",
                body: "Confirm your email to complete your ballot. Each supporter may vote once per voting round.",
              },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 150}>
                <div className="group relative h-full border border-charcoal/10 bg-ivory p-8 transition-all duration-500 hover:border-[#C0B87A] hover:shadow-[0_30px_60px_-30px_rgba(52,103,57,0.35)] lg:p-10">
                  <div className="flex items-center justify-center">
                    <div className="flex h-[116px] w-[116px] items-center justify-center rounded-full border border-[#C0B87A]/50 bg-bone/60 transition-colors group-hover:border-[#C0B87A]">
                      <span className="font-display text-3xl text-charcoal lg:text-4xl">{step.n}</span>
                    </div>
                  </div>
                  <h3 className="mt-8 text-center font-display text-2xl text-charcoal lg:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-4 text-center text-sm leading-relaxed text-charcoal/70">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={400} className="mt-16 text-center">
            <a
              href={VOTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackVoteClick("vote_page_process")}
              className="group inline-flex items-center gap-3 bg-charcoal px-8 py-4 text-[0.72rem] font-medium uppercase tracking-[0.3em] text-ivory transition-all hover:bg-forest"
            >
              Cast Your Vote
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── SECTION 6 — FINAL CTA ───────────────── */}
      <section className="relative h-[90svh] min-h-[600px] w-full overflow-hidden">
        <img
          src={sunsetImg}
          alt="Sunset over Mtoni River Lodge"
          className="ken-burns absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 via-charcoal/50 to-charcoal/85" />

        <div className="relative z-10 mx-auto flex h-full max-w-[1100px] flex-col items-center justify-center px-6 text-center text-ivory lg:px-12">
          <Reveal>
            <AwardBadge inverted />
          </Reveal>
          <Reveal delay={150}>
            <h2 className="hero-text-shadow mt-10 font-display text-4xl italic leading-[1.1] text-ivory lg:text-7xl">
              Thank You for Being Part of the Journey
            </h2>
          </Reveal>
          <Reveal delay={300}>
            <p className="hero-text-shadow mx-auto mt-8 max-w-xl text-base leading-relaxed text-ivory/85 lg:text-lg">
              Your support helps showcase Tanzanian hospitality to the world — and the
              quiet, careful work of the people who make Mtoni what it is.
            </p>
          </Reveal>
          <Reveal delay={420}>
            <a
              href={VOTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackVoteClick("vote_page_final_cta")}
              className="group mt-12 inline-flex items-center gap-4 bg-[#C0B87A] px-10 py-5 text-[0.72rem] font-medium uppercase tracking-[0.32em] text-charcoal shadow-[0_30px_70px_-20px_rgba(0,0,0,0.7)] transition-all hover:bg-ivory hover:tracking-[0.34em] lg:px-14 lg:py-6"
            >
              Vote for Mtoni River Lodge
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </Reveal>

          {/* Share row */}
          <Reveal delay={560}>
            <div className="mt-14 flex flex-col items-center gap-4">
              <p className="text-[0.6rem] uppercase tracking-[0.32em] text-ivory/65">
                Share the nomination
              </p>
              <ShareRow />
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />

      {/* ───────────────── STICKY FLOATING VOTE BUTTON ───────────────── */}
      <div
        className={`fixed bottom-5 right-5 z-[995] hidden transition-all duration-500 ease-out lg:block ${
          showSticky ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
        style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <a
          href={VOTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackVoteClick("vote_page_sticky")}
          className="group inline-flex items-center gap-3 bg-charcoal px-6 py-3.5 text-[0.66rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] transition-all hover:bg-[#C0B87A] hover:text-charcoal"
        >
          <Award className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Vote for Mtoni
        </a>
      </div>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function AwardBadge({ inverted = false }: { inverted?: boolean }) {
  const ring = inverted ? "border-ivory/55" : "border-ivory/45";
  const text = "text-ivory";
  return (
    <div
      className={`mx-auto flex w-fit items-center gap-4 rounded-full border ${ring} bg-charcoal/20 px-5 py-2.5 backdrop-blur-md`}
    >
      <Award className="h-4 w-4 text-[#C0B87A]" strokeWidth={1.5} aria-hidden />
      <span className={`text-[0.6rem] uppercase tracking-[0.32em] ${text}`}>
        World Luxury Hotel Awards · Nominee 2026
      </span>
    </div>
  );
}

function Testimonials() {
  const reviews = [
    {
      title: "Beautiful lodge, conveniently located with amazing staff",
      quote:
        "It's always a treat to stay at Mtoni. By now, it feels like my home away from home whenever I'm in Arusha. Tom, Neema, and the entire team are attentive, supportive, and always welcoming. The lodge itself is a beautiful oasis, perfectly located between Kilimanjaro International Airport and Arusha town. You feel completely immersed in nature while remaining conveniently close to everything. I cannot recommend this place enough.",
      name: "Charissa",
      date: "June 2026",
    },
    {
      title: "Incredible Stay",
      quote:
        "Absolutely incredible stay at Mtoni River Lodge! We were here for a family wedding, and every aspect of our experience exceeded expectations. The staff were exceptionally helpful and made our stay one to remember. We look forward to returning.",
      name: "Si, Belinda, Simon & Debbie",
      date: "May 2026",
    },
    {
      title: "Relaxing by the River",
      quote:
        "Great surroundings, wonderful atmosphere, excellent service, and delicious food. The complete package when visiting Arusha. Babu looked after us exceptionally well, and the monkey watching provided endless entertainment for the kids. A truly relaxing and memorable experience.",
      name: "Deon L",
      date: "May 2026",
    },
  ];

  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % reviews.length), 7000);
    return () => clearInterval(t);
  }, [reviews.length]);

  return (
    <section className="bg-charcoal px-6 py-28 text-ivory lg:px-12 lg:py-40">
      <div className="mx-auto max-w-[1100px]">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow !text-ivory/65">Guest Experiences</p>
          <h2 className="mt-5 font-display text-4xl leading-[1.08] text-ivory lg:text-6xl">
            Memorable stays shared by travelers from around the world.
          </h2>
        </Reveal>

        <div className="relative mt-20">
          <div className="relative mx-auto max-w-3xl text-center">
            {reviews.map((r, i) => (
              <div
                key={r.name}
                aria-hidden={i !== active}
                className={`transition-all duration-1000 ${
                  i === active
                    ? "opacity-100"
                    : "pointer-events-none absolute inset-0 opacity-0"
                }`}
              >
                <div className="flex justify-center gap-1.5 text-[#C0B87A]">
                  {[...Array(5)].map((_, k) => (
                    <Star key={k} className="h-4 w-4 fill-current" strokeWidth={0} />
                  ))}
                </div>
                <p className="mt-6 font-display text-lg font-medium leading-snug text-ivory/95 lg:text-xl">
                  {r.title}
                </p>
                <blockquote className="mt-4 font-display text-xl italic leading-[1.4] text-ivory/90 lg:text-[1.6rem]">
                  &ldquo;{r.quote}&rdquo;
                </blockquote>
                <div className="mt-10">
                  <p className="font-display text-lg text-ivory">{r.name}</p>
                  <p className="mt-1 text-[0.7rem] uppercase tracking-[0.28em] text-ivory/55">
                    {r.date}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* dots */}
          <div className="mt-12 flex items-center justify-center gap-3">
            {reviews.map((_, i) => (
              <button
                key={i}
                aria-label={`Show review ${i + 1}`}
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === active ? "w-10 bg-[#C0B87A]" : "w-5 bg-ivory/25 hover:bg-ivory/45"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ShareRow() {
  const wa = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`;
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`;
  const ig = "https://www.instagram.com/mtoniriverlodge/";

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <ShareBtn href={wa} label="Share on WhatsApp" onClick={() => trackShareClick("whatsapp", "vote_page_share_row")}>
        <MessageCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        WhatsApp
      </ShareBtn>
      <ShareBtn href={fb} label="Share on Facebook" onClick={() => trackShareClick("facebook", "vote_page_share_row")}>
        <Share2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Facebook
      </ShareBtn>
      <ShareBtn href={tw} label="Share on Twitter" onClick={() => trackShareClick("twitter", "vote_page_share_row")}>
        <Share2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Twitter / X
      </ShareBtn>
      <ShareBtn href={ig} label="Follow on Instagram" onClick={() => trackShareClick("instagram", "vote_page_share_row")}>
        <Instagram className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Instagram
      </ShareBtn>
      <ShareBtn href={WHATSAPP_URL} label="Concierge on WhatsApp" onClick={() => trackContactClick("whatsapp", "vote_page_concierge")}>
        <Users className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Concierge
      </ShareBtn>
    </div>
  );
}

function ShareBtn({
  href,
  label,
  onClick,
  children,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={onClick}
      className="inline-flex items-center gap-2 border border-ivory/40 px-4 py-2.5 text-[0.62rem] uppercase tracking-[0.28em] text-ivory/85 transition-all hover:border-ivory hover:bg-ivory hover:text-charcoal"
    >
      {children}
    </a>
  );
}