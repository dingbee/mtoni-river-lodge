import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Phone, Mail, Globe, UserPlus } from "lucide-react";
import logo from "@/assets/mtoni-logo.png";
import heroRiver from "@/assets/hero-river-800w.webp";
import heroRiverLg from "@/assets/hero-river-1600w.webp";

const CARD = {
  name: "Mwasiti Mushi",
  title: "Asia Market Representative",
  org: "Mtoni River Lodge",
  phoneDisplay: "+86 131 644 505 44",
  phoneE164: "+8613164450544",
  email: "mwasiti@mtoniriverlodge.com",
  website: "https://mtoniriverlodge.com",
  canonical: "https://mtoniriverlodge.com/mwasiti",
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
    `URL:${CARD.website}`,
    "END:VCARD",
  ].join("\r\n");
}

export const Route = createFileRoute("/mwasiti")({
  head: () => ({
    meta: [
      { title: "Mwasiti Mushi — Asia Market Representative | Mtoni River Lodge" },
      { name: "description", content: "Digital business card of Mwasiti Mushi, Asia Market Representative at Mtoni River Lodge. Call, email or save the contact." },
      { property: "og:title", content: "Mwasiti Mushi — Mtoni River Lodge" },
      { property: "og:description", content: "Asia Market Representative, Mtoni River Lodge — Hidden in Nature." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: CARD.canonical }],
  }),
  component: MwasitiCard,
});

// Card-scoped palette (forest / ivory / muted gold) — kept local so global styles stay untouched.
const scoped = `
.mw-card{--mw-forest:#163a2b;--mw-forest-deep:#0e271d;--mw-ivory:#f4efe4;--mw-gold:#b89a5e;}
@media (prefers-reduced-motion:no-preference){.mw-rise{animation:mw-rise .9s cubic-bezier(.2,.7,.2,1) both}.mw-d1{animation-delay:.12s}.mw-d2{animation-delay:.24s}.mw-d3{animation-delay:.36s}}
@keyframes mw-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
`;

function MwasitiCard() {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import("qrcode").then((QR) =>
      QR.toString(CARD.canonical, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0e271d", light: "#f4efe4" } }),
    ).then((svg) => alive && setQr(svg)).catch(() => {});
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

  const action = "flex min-h-12 items-center gap-4 rounded-sm border border-[color:var(--mw-gold)]/40 px-5 py-3 text-[color:var(--mw-ivory)] transition-colors duration-300 hover:bg-[color:var(--mw-gold)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mw-gold)]";

  return (
    <main className="mw-card min-h-screen bg-[color:var(--mw-forest-deep)] text-[color:var(--mw-ivory)]">
      <style>{scoped}</style>
      <div className="mx-auto max-w-md md:max-w-lg">
        <div className="relative h-72 overflow-hidden md:h-80">
          <img src={heroRiver} srcSet={`${heroRiver} 800w, ${heroRiverLg} 1600w`} sizes="(min-width:768px) 512px, 100vw" alt="The river flowing through the forest at Mtoni River Lodge" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[color:var(--mw-forest-deep)]/30 via-transparent to-[color:var(--mw-forest-deep)]" />
          <img src={logo} alt="Mtoni River Lodge" className="mw-rise absolute left-1/2 top-8 h-16 w-auto -translate-x-1/2 brightness-0 invert drop-shadow" />
        </div>

        <section className="relative -mt-10 px-6 pb-12 text-center">
          <p className="mw-rise font-serif text-sm uppercase tracking-[0.35em] text-[color:var(--mw-gold)]">Hidden in Nature</p>
          <div className="mx-auto my-5 h-px w-16 bg-[color:var(--mw-gold)]/60" />
          <h1 className="mw-rise mw-d1 font-display text-4xl font-light tracking-wide md:text-5xl">{CARD.name}</h1>
          <p className="mw-rise mw-d1 mt-2 font-serif text-lg italic text-[color:var(--mw-ivory)]/80">{CARD.title}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-[color:var(--mw-ivory)]/55">{CARD.org}</p>

          <nav aria-label="Contact Mwasiti" className="mw-rise mw-d2 mt-10 flex flex-col gap-3 text-left">
            <a href={`tel:${CARD.phoneE164}`} className={action}>
              <Phone className="h-5 w-5 shrink-0 text-[color:var(--mw-gold)]" aria-hidden />
              <span><span className="block text-xs uppercase tracking-widest text-[color:var(--mw-ivory)]/55">Call</span>{CARD.phoneDisplay}</span>
            </a>
            <a href={`mailto:${CARD.email}`} className={action}>
              <Mail className="h-5 w-5 shrink-0 text-[color:var(--mw-gold)]" aria-hidden />
              <span className="min-w-0"><span className="block text-xs uppercase tracking-widest text-[color:var(--mw-ivory)]/55">Email</span><span className="break-all">{CARD.email}</span></span>
            </a>
            <a href={CARD.website} target="_blank" rel="noopener noreferrer" className={action}>
              <Globe className="h-5 w-5 shrink-0 text-[color:var(--mw-gold)]" aria-hidden />
              <span><span className="block text-xs uppercase tracking-widest text-[color:var(--mw-ivory)]/55">Website</span>mtoniriverlodge.com</span>
            </a>
            <button type="button" onClick={downloadVCard} className={`${action} mt-2 justify-center bg-[color:var(--mw-gold)] font-medium text-[color:var(--mw-forest-deep)] hover:bg-[color:var(--mw-gold)]/90`}>
              <UserPlus className="h-5 w-5" aria-hidden /> Add to Contacts
            </button>
          </nav>

          <figure className="mw-rise mw-d3 mt-12 flex flex-col items-center">
            <div className="rounded-sm border border-[color:var(--mw-gold)]/40 bg-[color:var(--mw-ivory)] p-3">
              {qr ? (
                <div role="img" aria-label={`QR code linking to ${CARD.canonical}`} className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
              ) : (
                <div className="h-40 w-40" aria-hidden />
              )}
            </div>
            <figcaption className="mt-3 text-xs uppercase tracking-[0.25em] text-[color:var(--mw-ivory)]/55">Scan to share this card</figcaption>
          </figure>
        </section>
      </div>
    </main>
  );
}
