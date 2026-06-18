import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { BreadcrumbsBar } from "@/components/site/Breadcrumbs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Single source of truth for both the visible FAQ and the FAQPage JSON-LD.
 * Every answer is plain text (no markup) so the schema and visible content
 * stay byte-identical — a Google Rich Results requirement.
 * Each answer is grounded in verified project content (terms page, rooms
 * module, experiences route, contact lib).
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Where is Mtoni River Lodge located?",
    a: "Mtoni River Lodge sits on Gomba Estate in Arusha, Tanzania, on the banks of the Nduruma River. We are an easy drive from both Arusha (ARK) and Kilimanjaro (JRO) airports, making the lodge a quiet base before or after a safari.",
  },
  {
    q: "What time is check-in and check-out?",
    a: "Check-in and check-out times are confirmed in your reservation correspondence. Early arrivals and late departures can often be accommodated on request — please write to bookings@mtoniriverlodge.com so we can plan around your flight.",
  },
  {
    q: "How do I make a reservation?",
    a: "You can check live availability and book directly on our website at mtoniriverlodge.com/book. Payment is processed securely through Pesapal. Our reservations team is also available by email at bookings@mtoniriverlodge.com or on WhatsApp at +255 752 441 443 for itinerary and special-arrangement questions.",
  },
  {
    q: "Is a deposit required to confirm a booking?",
    a: "Yes. A 50% deposit of the total booking value is required to secure your reservation. Deposits must be paid at least 45 days prior to arrival; bookings made within 45 days of arrival require immediate deposit payment. The remaining balance is settled 30 days before arrival, or as otherwise agreed in writing.",
  },
  {
    q: "Can I modify or cancel my booking?",
    a: "Cancellations must be made in advance and are subject to the following schedule, charged on the total booking value: more than 60 days before arrival — no charge; 40 to 45 days before arrival — 25% charge; 30 to 39 days before arrival — 50% charge; less than 30 days before arrival — 100% charge. To amend or cancel, write to bookings@mtoniriverlodge.com.",
  },
  {
    q: "Do you provide airport transfers?",
    a: "Yes. We offer a private return airport transfer from Kilimanjaro (JRO) or Arusha (ARK) airports at USD 70 per booking. Add it during checkout or request it ahead of arrival so a driver meets you on landing.",
  },
  {
    q: "Do you arrange safari experiences?",
    a: "Mtoni River Lodge is a tranquil base for travelers exploring northern Tanzania's safari circuit. While safaris are arranged through our trusted local partners on request, we curate a range of lodge-led experiences in and around Arusha: Lake Duluti canoeing (USD 55/person), a guided local market walk (USD 35/person), mountain-bike rides through coffee farms (USD 25/person), a guided waterfall hike on Mount Meru (USD 45/person), a private Maji Moto hot springs day trip (USD 250 per booking, up to 4 guests), a hands-on Swahili live cooking session (USD 35/person), and complimentary guided river walks for in-house guests.",
  },
  {
    q: "Is Mtoni River Lodge suitable for families?",
    a: "Yes. Our Family / Group Room is designed for shared moments — a spacious garden-facing room sleeping up to six guests with a private bathroom and multiple sleeping arrangements. Families also enjoy complimentary guided river walks and our hands-on cooking experience.",
  },
  {
    q: "Are meals available at the lodge?",
    a: "Yes. Breakfast is included with every room. Our riverside dining room serves seasonal meals throughout the day, and our hands-on Swahili live cooking experience (USD 35/person) lets guests prepare and share a traditional meal with our chef.",
  },
  {
    q: "What makes Mtoni River Lodge unique?",
    a: "Mtoni is an intimate, riverfront eco-lodge on the banks of the Nduruma River in Arusha. Earth-and-thatch architecture inspired by the Maasai boma, natural ventilation, just 24 rooms across three room types, personal hosting from a small dedicated team, and a riverside setting at the foot of Mount Meru — recognized with a Tripadvisor Travelers' Choice 2026 award.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Answers to common questions about staying at Mtoni River Lodge in Arusha — bookings, deposits, cancellations, airport transfers, experiences, families, and dining.",
      },
      { property: "og:title", content: "Frequently Asked Questions — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "Bookings, deposits, transfers, experiences, dining and more — everything you need to plan your stay at Mtoni River Lodge, Arusha.",
      },
      { property: "og:url", content: "https://mtoniriverlodge.com/faq" },
    ],
    links: [{ rel: "canonical", href: "https://mtoniriverlodge.com/faq" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(FAQ_JSON_LD),
      },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <BreadcrumbsBar />

      <main className="pt-10 lg:pt-14">
        <section className="mx-auto max-w-[820px] px-6 pb-14 text-center lg:px-12 lg:pb-20">
          <p className="eyebrow">Plan Your Stay</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-6 font-display italic text-lg text-charcoal/70 lg:text-xl">
            Everything you need to know before arriving at Mtoni.
          </p>
        </section>

        <section className="mx-auto max-w-[820px] px-6 pb-24 lg:px-12 lg:pb-32">
          <Accordion type="single" collapsible className="border-t border-charcoal/10">
            {FAQ.map(({ q, a }, i) => (
              <AccordionItem
                key={i}
                value={`q-${i}`}
                className="border-b border-charcoal/10"
              >
                <AccordionTrigger className="py-6 text-left font-display text-xl leading-snug lg:text-2xl">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="pb-8 text-base leading-relaxed text-charcoal/75">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-14 text-center">
            <p className="text-sm leading-relaxed text-charcoal/65">
              Still have a question? Write to{" "}
              <a
                href="mailto:bookings@mtoniriverlodge.com"
                className="underline underline-offset-4 hover:text-charcoal"
              >
                bookings@mtoniriverlodge.com
              </a>{" "}
              or{" "}
              <Link
                to="/contact"
                className="underline underline-offset-4 hover:text-charcoal"
              >
                contact our reservations team
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooterMinimal />
    </div>
  );
}