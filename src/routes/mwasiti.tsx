import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Phone, Mail, UserPlus, Share2, MessageCircle, ArrowUpRight, MapPin, Check } from "lucide-react";
import logo from "@/assets/mtoni-logo.png";
import heroRiver from "@/assets/hero-river-800w.webp";
import heroRiverLg from "@/assets/hero-river-1600w.webp";
import roomImg from "@/assets/riverfront-deluxe-exterior.jpg";
import xpImg from "@/assets/maasai-by-river.jpg";
import diningImg from "@/assets/dining-hero.jpg";
import poolImg from "@/assets/pool.jpg";
import riverWalkImg from "@/assets/xp-river-walk.jpg";

const SITE = "https://mtoniriverlodge.com";

export const CARD = {
  name: "Mwasiti Mushi",
  title: "Asia Market Representative",
  org: "Mtoni River Lodge",
  phoneDisplay: "+86 131 644 505 44",
  phoneE164: "+8613164450544",
  whatsappUrl: "https://wa.me/8613164450544",
  email: "mwasiti@mtoniriverlodge.com",
  website: SITE,
  canonical: `${SITE}/mwasiti`,
};

// Links verified against the live official website (HTTP 200).
export const SITE_LINKS = {
  stays: `${SITE}/stay`,
  rooms: `${SITE}/rooms`,
  experiences: `${SITE}/experiences`,
  dining: `${SITE}/dining`,
  lodge: `${SITE}/lodge`,
  contact: `${SITE}/contact`,
  plan: `${SITE}/plan`,
};

/**
 * Award / recognition placement. Stays hidden (not rendered at all) until
 * approved official wording and artwork are supplied. To enable: set
 * `enabled: true` and fill in the approved fields.
 */
export const AWARD: { enabled: boolean; title: string; issuer: string; year: string; image?: string; href?: string } = {
  enabled: false,
  title: "",
  issuer: "",
  year: "",
};

export function buildVCard() {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Mushi;Mwasiti;;;",
    `FN:${CARD.name}`,
    `ORG:${CARD.org}`,
    `TITLE:${CARD.title}`,
    `TEL;TYPE=CELL,VOICE:${CARD.phoneE164}`,
    `EMAIL;TYPE=WORK:${CARD.email}`,
    `URL:${CARD.canonical}`,
    `URL;TYPE=WORK:${CARD.website}`,
    "NOTE:WhatsApp: " + CARD.whatsappUrl,
    "END:VCARD",
  ].join("\r\n");
}

export const Route = createFileRoute("/mwasiti")({
  head: () => ({
    meta: [
      { title: "Mwasiti Mushi — Asia Market Representative | Mtoni River Lodge" },
      { name: "description", content: "Plan a riverside stay at Mtoni River Lodge, Arusha, with Mwasiti Mushi, Asia Market Representative. WhatsApp, call, email or save the contact." },
      { property: "og:title", content: "Mwasiti Mushi — Mtoni River Lodge, Hidden in Nature" },
      { property: "og:description", content: "Your Asia contact for riverside stays, safari journeys and dining at Mtoni River Lodge, Arusha." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: CARD.canonical }],
  }),
  component: MwasitiCard,
});

const scoped = `
.mw-card{--mw-forest:#163a2b;--mw-forest-deep:#0e271d;--mw-ivory:#f4efe4;--mw-gold:#b89a5e;}
@media (prefers-reduced-motion:no-preference){.mw-rise{animation:mw-rise .9s cubic-bezier(.2,.7,.2,1) both}.mw-d1{animation-delay:.12s}.mw-d2{animation-delay:.24s}.mw-d3{animation-delay:.36s}}
@keyframes mw-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
`;

const OFFERS = [
  { img: roomImg, eyebrow: "Stay", title: "Riverside cottages & suites", body: "Thatched cottages beside the Nduruma River, wrapped in palms and birdsong.", href: SITE_LINKS.stays, cta: "Explore stays", alt: "Riverfront deluxe cottage at Mtoni River Lodge" },
  { img: xpImg, eyebrow: "Experiences", title: "Safari gateway & local life", body: "Arusha's base for Serengeti, Ngorongoro and Kilimanjaro — plus river walks and village culture.", href: SITE_LINKS.experiences, cta: "Discover experiences", alt: "Maasai guide by the river at Mtoni" },
  { img: diningImg, eyebrow: "Dining", title: "Candlelit garden dining", body: "Farm-fresh Tanzanian and international menus, served by the water.", href: SITE_LINKS.dining, cta: "See dining", alt: "Evening dining at Mtoni River Lodge" },
];

const VALUES = ["Private riverside setting in Arusha", "Easy start for northern-circuit safaris", "Personal planning in your time zone"];

function MwasitiCard() {
  const [qr, setQr] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((QR) => QR.toString(CARD.canonical, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e271d", light: "#f4efe4" } }))
      .then((svg) => alive && setQr(svg))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const downloadVCard = () => {
    const blob = new Blob([buildVCard()], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mwasiti-Mushi-Mtoni-River-Lodge.vcf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    const data = { title: `${CARD.name} — ${CARD.org}`, text: "Plan your stay at Mtoni River Lodge", url: CARD.canonical };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(CARD.canonical); setShared(true); setTimeout(() => setShared(false), 2500); }
    } catch { /* user cancelled */ }
  };

  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mw-gold)]";
  const ghost = `flex min-h-12 items-center justify-center gap-2 rounded-sm border border-[color:var(--mw-gold)]/40 px-4 py-3 text-sm text-[color:var(--mw-ivory)] transition-colors hover:bg-[color:var(--mw-gold)]/10 ${focus}`;
  const label = "text-[11px] uppercase tracking-[0.3em] text-[color:var(--mw-gold)]";

  return (
    <main className="mw-card min-h-screen bg-[color:var(--mw-forest-deep)] text-[color:var(--mw-ivory)]">
      <style>{scoped}</style>

      {/* Hero */}
      <header className="relative h-[78vh] min-h-[520px] max-h-[760px] overflow-hidden">
        <img src={heroRiverLg} srcSet={`${heroRiver} 800w, ${heroRiverLg} 1600w`} sizes="100vw" alt="Mtoni River Lodge glowing beside the river at night" className="h-full w-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-b from-[color:var(--mw-forest-deep)]/60 via-[color:var(--mw-forest-deep)]/30 via-50% to-[color:var(--mw-forest-deep)] to-85%" />
        <img src={logo} alt="Mtoni River Lodge" className="mw-rise absolute left-1/2 top-8 h-14 w-auto -translate-x-1/2 brightness-0 invert md:h-16" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl px-6 pb-10 text-center">
          <p className="mw-rise font-serif text-xs uppercase tracking-[0.4em] text-[color:var(--mw-gold)] [text-shadow:0_1px_8px_rgba(0,0,0,.8)]">Hidden in Nature</p>
          <div className="mx-auto my-5 h-px w-16 bg-[color:var(--mw-gold)]/60" />
          <h1 className="mw-rise mw-d1 font-display text-4xl font-light tracking-wide md:text-6xl">{CARD.name}</h1>
          <p className="mw-rise mw-d1 mt-2 font-serif text-lg italic text-[color:var(--mw-ivory)]/85 md:text-xl">{CARD.title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-[color:var(--mw-ivory)]/60">{CARD.org} · Arusha, Tanzania</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6">
        {/* Primary CTAs */}
        <section aria-label="Contact Mwasiti" className="mw-rise mw-d2 -mt-2">
          <a href={CARD.whatsappUrl} target="_blank" rel="noopener noreferrer" className={`flex min-h-14 items-center justify-center gap-3 rounded-sm bg-[color:var(--mw-gold)] px-5 py-4 font-medium text-[color:var(--mw-forest-deep)] shadow-lg transition hover:brightness-105 ${focus}`}>
            <MessageCircle className="h-5 w-5" aria-hidden />
            <span className="flex flex-col text-left leading-tight sm:flex-row sm:gap-2"><span>Chat on WhatsApp</span><span className="font-normal opacity-80">{CARD.phoneDisplay}</span></span>
          </a>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a href={`tel:${CARD.phoneE164}`} className={ghost}><Phone className="h-4 w-4 text-[color:var(--mw-gold)]" aria-hidden /> Call</a>
            <a href={`mailto:${CARD.email}?subject=${encodeURIComponent("Mtoni River Lodge enquiry")}`} className={ghost}><Mail className="h-4 w-4 text-[color:var(--mw-gold)]" aria-hidden /> Email</a>
            <button type="button" onClick={downloadVCard} className={ghost}><UserPlus className="h-4 w-4 text-[color:var(--mw-gold)]" aria-hidden /> Save contact</button>
            <button type="button" onClick={share} className={ghost} aria-live="polite">
              {shared ? <Check className="h-4 w-4 text-[color:var(--mw-gold)]" aria-hidden /> : <Share2 className="h-4 w-4 text-[color:var(--mw-gold)]" aria-hidden />}
              {shared ? "Link copied" : "Share card"}
            </button>
          </div>
          <p className="mt-4 break-all text-center text-sm text-[color:var(--mw-ivory)]/60">{CARD.email}</p>
        </section>

        {/* Positioning */}
        <section className="py-16 text-center">
          <p className={label}>The Lodge</p>
          <h2 className="mx-auto mt-4 max-w-lg font-display text-3xl font-light leading-snug md:text-4xl">A private riverside retreat at the doorstep of Tanzania's great safaris.</h2>
          <p className="mx-auto mt-5 max-w-md font-serif text-base leading-relaxed text-[color:var(--mw-ivory)]/75">Mwasiti looks after travellers and partners across Asia — from the first question to the welcome drink — so every journey to Mtoni feels effortless.</p>
          <ul className="mx-auto mt-8 grid max-w-md gap-3 text-left text-sm">
            {VALUES.map((v) => (
              <li key={v} className="flex items-start gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-[color:var(--mw-gold)]" aria-hidden />{v}</li>
            ))}
          </ul>
        </section>

        {/* Award — not rendered until approved */}
        {AWARD.enabled && (
          <section aria-label="Recognition" className="mb-16 rounded-sm border border-[color:var(--mw-gold)]/50 p-6 text-center">
            {AWARD.image && <img src={AWARD.image} alt={`${AWARD.title} — ${AWARD.issuer}`} className="mx-auto mb-4 h-20 w-auto" />}
            <p className={label}>{AWARD.issuer} · {AWARD.year}</p>
            <p className="mt-2 font-display text-2xl font-light">{AWARD.title}</p>
          </section>
        )}

        {/* Offers */}
        <section aria-label="Discover Mtoni" className="grid gap-6 md:grid-cols-3 md:gap-4">
          {OFFERS.map((o) => (
            <a key={o.title} href={o.href} target="_blank" rel="noopener noreferrer" className={`group block overflow-hidden rounded-sm border border-[color:var(--mw-gold)]/25 bg-[color:var(--mw-forest)] ${focus}`}>
              <div className="aspect-[4/3] overflow-hidden"><img src={o.img} alt={o.alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" /></div>
              <div className="p-5">
                <p className={label}>{o.eyebrow}</p>
                <h3 className="mt-2 font-display text-xl font-light">{o.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--mw-ivory)]/70">{o.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-[color:var(--mw-gold)]">{o.cta}<ArrowUpRight className="h-4 w-4" aria-hidden /></span>
              </div>
            </a>
          ))}
        </section>

        {/* Plan your stay */}
        <section className="relative mt-16 overflow-hidden rounded-sm">
          <img src={poolImg} alt="Pool among the palms at Mtoni River Lodge" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[color:var(--mw-forest-deep)]/75" />
          <div className="relative px-6 py-12 text-center">
            <p className={label}>Plan your stay</p>
            <h2 className="mt-3 font-display text-3xl font-light">Tell us your dates — we'll shape the rest.</h2>
            <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3">
              <a href={SITE_LINKS.plan} target="_blank" rel="noopener noreferrer" className={`flex min-h-12 items-center justify-center gap-2 rounded-sm bg-[color:var(--mw-ivory)] px-5 py-3 font-medium text-[color:var(--mw-forest-deep)] hover:bg-[color:var(--mw-ivory)]/90 ${focus}`}>Start planning <ArrowUpRight className="h-4 w-4" aria-hidden /></a>
              <a href={SITE_LINKS.rooms} target="_blank" rel="noopener noreferrer" className={ghost}>View rooms & rates</a>
            </div>
          </div>
        </section>

        {/* Location */}
        <section className="mt-16 grid items-center gap-6 md:grid-cols-2">
          <img src={riverWalkImg} alt="River walk through the lodge gardens" loading="lazy" className="aspect-[4/3] w-full rounded-sm object-cover" />
          <div>
            <p className={label}>Location</p>
            <h2 className="mt-3 font-display text-2xl font-light">Nduruma riverbanks, Arusha</h2>
            <p className="mt-3 flex items-start gap-2 text-sm text-[color:var(--mw-ivory)]/70"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--mw-gold)]" aria-hidden />Close to Arusha and Kilimanjaro airports — an easy first and last night on safari.</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href={SITE_LINKS.lodge} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[color:var(--mw-gold)] underline-offset-4 hover:underline ${focus}`}>About the lodge<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
              <a href={SITE_LINKS.contact} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[color:var(--mw-gold)] underline-offset-4 hover:underline ${focus}`}>Contact & directions<ArrowUpRight className="h-4 w-4" aria-hidden /></a>
            </div>
          </div>
        </section>

        {/* QR */}
        <figure className="flex flex-col items-center py-16">
          <div className="rounded-sm border border-[color:var(--mw-gold)]/40 bg-[color:var(--mw-ivory)] p-3">
            {qr ? (
              <div role="img" aria-label={`QR code linking to ${CARD.canonical}`} className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            ) : (
              <div className="h-40 w-40" aria-hidden />
            )}
          </div>
          <figcaption className="mt-3 text-center text-xs uppercase tracking-[0.25em] text-[color:var(--mw-ivory)]/60">Scan to share this card<br /><span className="normal-case tracking-normal">mtoniriverlodge.com/mwasiti</span></figcaption>
        </figure>

        <footer className="border-t border-[color:var(--mw-gold)]/20 py-8 text-center text-xs text-[color:var(--mw-ivory)]/50">
          <a href={CARD.website} target="_blank" rel="noopener noreferrer" className={`hover:text-[color:var(--mw-gold)] ${focus}`}>mtoniriverlodge.com</a> · Hidden in Nature
        </footer>
      </div>
    </main>
  );
}
