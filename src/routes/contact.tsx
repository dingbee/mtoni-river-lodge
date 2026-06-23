import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { BreadcrumbsBar } from "@/components/site/Breadcrumbs";
import { WHATSAPP_URL } from "@/lib/contact";
import { trackContactClick } from "@/lib/analytics";
import { FAQ } from "@/components/FAQ";
import { buildFAQJsonLd, type FAQItem } from "@/lib/faq-schema";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";

const PHONE_DISPLAY = "+255 752 441 443";
const PHONE_TEL = "+255752441443";
const WHATSAPP_DISPLAY = "+255 752 441 443";
const EMAIL = "bookings@mtoniriverlodge.com";
const ADDRESS_LINES = ["Mtoni River Lodge", "Gomba Estate, Arusha", "Tanzania"];
const MAP_EMBED = "https://www.google.com/maps?q=Mtoni%20River%20Lodge&output=embed";
const MAP_DIRECTIONS = "https://www.google.com/maps?q=Mtoni+River+Lodge";

const CONTACT_FAQS: FAQItem[] = [
  {
    q: "What is the fastest way to reach the reservations team?",
    a: "WhatsApp is the fastest channel during the day — message us at +255 752 441 443. You can also call the same number, or email bookings@mtoniriverlodge.com for written enquiries.",
  },
  {
    q: "What are your reception and reservations hours?",
    a: "Our reception is staffed daily and reservations enquiries are answered between 08:00 and 20:00 East Africa Time. Messages received outside these hours are answered first thing the next morning.",
  },
  {
    q: "Can you arrange airport transfers?",
    a: "Yes. We arrange private transfers from Kilimanjaro International Airport (JRO) and Arusha Airport (ARK). Share your flight details when booking and our team will confirm pickup arrangements.",
  },
  {
    q: "Do you help plan safaris and excursions?",
    a: "Yes. Our team helps plan day trips and multi-day safaris to Arusha National Park, Tarangire, Lake Manyara, Ngorongoro, and the Serengeti, alongside local experiences around the lodge.",
  },
  {
    q: "Where exactly is the lodge?",
    a: "Mtoni River Lodge is on the Gomba Estate in Arusha, Tanzania, on the banks of the Nduruma River. Use the Directions link on this page for live maps and driving directions.",
  },
  {
    q: "Can you arrange transfers and early breakfasts for Mount Kilimanjaro climbers?",
    a: "Yes. We routinely host climbers before and after Kilimanjaro and coordinate with operators on every major route. Let us know your gate time and we'll arrange the transfer and an early or packed breakfast.",
  },
];

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Mtoni River Lodge | Arusha Boutique Nature Lodge" },
      {
        name: "description",
        content:
          "Contact Mtoni River Lodge in Arusha for reservations, inquiries, airport transfers, and guest assistance. Reach us via phone, WhatsApp, email, or our contact form.",
      },
      { property: "og:title", content: "Contact Mtoni River Lodge | Arusha Boutique Nature Lodge" },
      {
        property: "og:description",
        content:
          "Reach our reservations team for bookings, airport transfers, and safari extensions in Arusha, Tanzania.",
      },
      { property: "og:url", content: "https://mtoniriverlodge.com/contact" },
    ],
    links: [{ rel: "canonical", href: "https://mtoniriverlodge.com/contact" }],
    scripts: [
      buildFAQJsonLd(CONTACT_FAQS),
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Contact", path: "/contact" },
      ]),
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <BreadcrumbsBar />
      <main>
        <HeroIntro />
        <ContactInformation />
        <VisitUs />
        <SendMessage />
        <OperatingHours />
        <CtaBand />
        <FAQ
          faqs={CONTACT_FAQS}
          eyebrow="Before you reach out"
          heading="Frequently asked questions"
        />
      </main>
      <SiteFooter />
    </div>
  );
}

function HeroIntro() {
  return (
    <section className="bg-ivory px-6 pt-12 pb-16 lg:px-12 lg:pt-16 lg:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="eyebrow">Get in Touch</p>
          <h1 className="mt-6 font-display text-4xl leading-[1.1] lg:text-6xl">
            Contact Mtoni River Lodge
          </h1>
          <p className="mt-8 text-base leading-relaxed text-charcoal/75 lg:text-lg">
            We'd love to hear from you. Whether you're planning a reservation, arranging an
            airport transfer, extending your safari, or simply have a question — our team is
            here to help craft a stay that feels effortless from the very first message.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function ContactInformation() {
  const items = [
    {
      label: "Phone",
      value: PHONE_DISPLAY,
      href: `tel:${PHONE_TEL}`,
      hint: "Tap to call our front desk",
      track: "phone" as const,
    },
    {
      label: "WhatsApp",
      value: WHATSAPP_DISPLAY,
      href: WHATSAPP_URL,
      hint: "Chat with reservations instantly",
      track: "whatsapp" as const,
      external: true,
    },
    {
      label: "Email",
      value: EMAIL,
      href: `mailto:${EMAIL}`,
      hint: "Replies within 24 hours",
      track: "email" as const,
    },
  ];
  return (
    <section className="bg-bone px-6 py-20 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-[1200px]">
        <Reveal>
          <div className="mb-12 text-center">
            <p className="eyebrow">Contact Information</p>
            <h2 className="mt-6 font-display text-3xl lg:text-4xl">
              Reach our team directly
            </h2>
          </div>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={item.label} delay={i * 100}>
              <a
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={() => trackContactClick(item.track, "contact_page")}
                className="group flex h-full flex-col justify-between border border-charcoal/10 bg-ivory p-8 transition-all duration-300 hover:border-[var(--green)] hover:shadow-soft"
              >
                <div>
                  <p className="eyebrow text-[var(--green)]">{item.label}</p>
                  <p className="mt-4 font-display text-xl leading-snug text-charcoal lg:text-2xl">
                    {item.value}
                  </p>
                  <p className="mt-3 text-sm text-charcoal/65">{item.hint}</p>
                </div>
                <span className="mt-8 inline-flex items-center text-[0.72rem] uppercase tracking-[0.28em] text-[var(--green)] transition-transform group-hover:translate-x-1">
                  Connect →
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function VisitUs() {
  return (
    <section className="bg-ivory px-6 py-20 lg:px-12 lg:py-28">
      <div className="mx-auto grid max-w-[1300px] gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <Reveal>
          <p className="eyebrow">Visit Us</p>
          <h2 className="mt-6 font-display text-3xl lg:text-4xl">
            On the banks of the Nduruma
          </h2>
          <address className="mt-8 not-italic text-base leading-relaxed text-charcoal/80">
            {ADDRESS_LINES.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </address>
          <p className="mt-6 text-sm leading-relaxed text-charcoal/65">
            Fifty minutes from Kilimanjaro International Airport and a short drive from
            Arusha town. Need help finding us? Our team can share detailed driving
            directions or arrange a private transfer — simply reach out by WhatsApp or
            email and we'll guide you door to door.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href={MAP_DIRECTIONS}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 border border-charcoal px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
            >
              Open in Google Maps →
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick("whatsapp", "contact_visit_us")}
              className="inline-flex items-center gap-3 border border-[var(--green)] px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-[var(--green)] transition-colors hover:bg-[var(--green)] hover:text-ivory"
            >
              Request Directions →
            </a>
          </div>
        </Reveal>
        <Reveal delay={150}>
          <div className="overflow-hidden rounded-sm border border-charcoal/10 shadow-soft">
            <iframe
              src={MAP_EMBED}
              title="Map showing Mtoni River Lodge location near Arusha, Tanzania"
              width="100%"
              height="450"
              style={{ border: 0, display: "block" }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[360px] w-full sm:h-[420px] lg:h-[500px]"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SendMessage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const update =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    const lines = [
      `Hello Mtoni River Lodge, my name is ${form.name.trim()}.`,
      "",
      form.message.trim(),
      "",
      `Email: ${form.email.trim()}`,
    ];
    if (form.phone.trim()) lines.push(`Phone / WhatsApp: ${form.phone.trim()}`);
    const url = `https://wa.me/255752441443?text=${encodeURIComponent(lines.join("\n"))}`;
    trackContactClick("whatsapp_form", "contact_page");
    window.open(url, "_blank", "noopener,noreferrer");
    setSubmitted(true);
  };

  return (
    <section className="bg-bone px-6 py-20 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <div className="mb-10 text-center">
            <p className="eyebrow">Send Us a Message</p>
            <h2 className="mt-6 font-display text-3xl lg:text-4xl">
              We'll reply within 24 hours
            </h2>
            <p className="mt-4 text-sm text-charcoal/65">
              Share a few details and our reservations team will be in touch.
            </p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <form onSubmit={handleSubmit} className="space-y-8 border border-charcoal/10 bg-ivory p-8 lg:p-12">
            <div className="grid gap-8 sm:grid-cols-2">
              <Field label="Your Name" name="name" value={form.name} onChange={update("name")} required />
              <Field label="Email" name="email" type="email" value={form.email} onChange={update("email")} required />
            </div>
            <Field label="Phone / WhatsApp" name="phone" type="tel" value={form.phone} onChange={update("phone")} />
            <div>
              <label className="eyebrow block" htmlFor="message">Your Message</label>
              <textarea
                id="message"
                name="message"
                rows={5}
                value={form.message}
                onChange={update("message")}
                required
                maxLength={1000}
                className="mt-3 w-full border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-[var(--green)]"
                placeholder="Tell us about your travel dates, party size, or any questions…"
              />
            </div>
            <button
              type="submit"
              className="group inline-flex w-full items-center justify-between border border-charcoal bg-charcoal px-6 py-5 text-[0.72rem] uppercase tracking-[0.32em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
            >
              <span>Send Message</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            {submitted ? (
              <p className="text-center text-sm text-[var(--green)]">
                Thank you — your message has been prepared in WhatsApp. We'll respond shortly.
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Submitting opens WhatsApp with your message ready to send.
              </p>
            )}
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function OperatingHours() {
  return (
    <section className="bg-ivory px-6 py-20 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-[1100px]">
        <Reveal>
          <div className="mb-12 text-center">
            <p className="eyebrow">Operating Hours</p>
            <h2 className="mt-6 font-display text-3xl lg:text-4xl">
              Always within reach
            </h2>
          </div>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2">
          <Reveal>
            <div className="border border-charcoal/10 bg-bone p-8 lg:p-10">
              <p className="eyebrow text-[var(--green)]">Reception</p>
              <p className="mt-4 font-display text-2xl">Open 24 hours</p>
              <p className="mt-3 text-sm text-charcoal/70">
                Our front desk welcomes guests around the clock for arrivals,
                departures, and on-site assistance.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="border border-charcoal/10 bg-bone p-8 lg:p-10">
              <p className="eyebrow text-[var(--green)]">Reservation Support</p>
              <p className="mt-4 font-display text-2xl">Mon – Sun · 7:00 – 21:00 EAT</p>
              <p className="mt-3 text-sm text-charcoal/70">
                Bookings, airport transfers, and safari extensions. Messages received
                after hours are answered first thing in the morning.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="bg-charcoal px-6 py-20 text-ivory lg:px-12 lg:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="eyebrow !text-ivory/70">Ready When You Are</p>
          <h2 className="mt-6 font-display text-3xl lg:text-4xl">
            Let's plan your arrival at Mtoni
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick("whatsapp", "contact_cta_band")}
              className="inline-flex items-center justify-center gap-3 border border-ivory px-6 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
            >
              WhatsApp Us →
            </a>
            <a
              href={`mailto:${EMAIL}`}
              onClick={() => trackContactClick("email", "contact_cta_band")}
              className="inline-flex items-center justify-center gap-3 border border-ivory px-6 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal"
            >
              Email Us →
            </a>
            <Link
              to="/plan"
              className="inline-flex items-center justify-center gap-3 border border-[var(--gold)] bg-[var(--gold)] px-6 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-[var(--gold)]"
            >
              Book Your Stay →
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="eyebrow block" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        maxLength={255}
        className="mt-3 w-full border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-[var(--green)]"
      />
    </div>
  );
}