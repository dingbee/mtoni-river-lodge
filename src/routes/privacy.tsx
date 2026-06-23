import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { BreadcrumbsBar } from "@/components/site/Breadcrumbs";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Mtoni River Lodge privacy policy. Learn how we collect, use, and protect your personal information when you visit our website or make a reservation.",
      },
      { property: "og:title", content: "Privacy Policy — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "How Mtoni River Lodge collects, uses, and safeguards guest personal information.",
      },
      { property: "og:url", content: "https://mtoniriverlodge.com/privacy" },
    ],
    links: [
      { rel: "canonical", href: "https://mtoniriverlodge.com/privacy" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Privacy Policy — Mtoni River Lodge",
          description:
            "Mtoni River Lodge privacy policy. Learn how we collect, use, and protect your personal information.",
          url: "https://mtoniriverlodge.com/privacy",
          isPartOf: {
            "@type": "WebSite",
            name: "Mtoni River Lodge",
            url: "https://mtoniriverlodge.com",
          },
        }),
      },
    ],
  }),
  component: PrivacyPage,
});

type Section = {
  number: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    number: "01",
    title: "Introduction",
    body: (
      <p>
        Mtoni River Lodge respects your privacy and is committed to protecting
        your personal information. This Privacy Policy explains how we collect,
        use, store, and safeguard the data you share with us when visiting our
        website, making an inquiry, or booking a stay.
      </p>
    ),
  },
  {
    number: "02",
    title: "Information We Collect",
    body: (
      <>
        <p>We may collect the following personal information:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Booking information (dates, room preferences, number of guests)</li>
          <li>Inquiry details submitted through forms</li>
          <li>Website usage data through analytics tools</li>
        </ul>
      </>
    ),
  },
  {
    number: "03",
    title: "How We Use Information",
    body: (
      <>
        <p>Information may be used to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Process reservations and manage your stay</li>
          <li>Respond to inquiries and provide guest support</li>
          <li>Improve guest services and lodge operations</li>
          <li>Improve website performance and user experience</li>
          <li>Communicate booking-related information and updates</li>
        </ul>
      </>
    ),
  },
  {
    number: "04",
    title: "Analytics and Cookies",
    body: (
      <>
        <p>
          The website uses analytics technologies, including Google Analytics, to
          understand website usage and improve visitor experience.
        </p>
        <p>Cookies may be used to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Analyze traffic and user behaviour</li>
          <li>Improve website functionality</li>
          <li>Enhance user experience</li>
        </ul>
      </>
    ),
  },
  {
    number: "05",
    title: "Third-Party Services",
    body: (
      <>
        <p>
          Information may be processed through trusted third-party providers
          including:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Booking and reservation systems</li>
          <li>Payment providers</li>
          <li>Analytics services</li>
          <li>Email communication platforms</li>
        </ul>
        <p>
          We only share the minimum information necessary and require all
          third-party providers to maintain appropriate data protection standards.
        </p>
      </>
    ),
  },
  {
    number: "06",
    title: "Data Security",
    body: (
      <p>
        Mtoni River Lodge implements reasonable technical and organisational
        measures to protect personal information from unauthorised access,
        misuse, alteration, or disclosure. Access to guest data is limited to
        authorised personnel who require it to perform their duties.
      </p>
    ),
  },
  {
    number: "07",
    title: "Your Rights",
    body: (
      <p>
        Guests may request access to, correction of, or deletion of their personal
        information by contacting Mtoni River Lodge directly. We will respond to
        all reasonable requests in accordance with applicable data protection
        laws.
      </p>
    ),
  },
  {
    number: "08",
    title: "Contact",
    body: (
      <>
        <p>
          For privacy-related inquiries, or to exercise your data rights, please
          contact us:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Email:{" "}
            <a
              href="mailto:bookings@mtoniriverlodge.com"
              className="underline underline-offset-4 hover:text-charcoal"
            >
              bookings@mtoniriverlodge.com
            </a>
          </li>
          <li>Phone: +255 752 441 443</li>
        </ul>
      </>
    ),
  },
];

function PrivacyPage() {
  const lastUpdated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />

      <BreadcrumbsBar />
      <main className="pt-10 lg:pt-14">
        {/* Header */}
        <section className="mx-auto max-w-[820px] px-6 pb-14 text-center lg:px-12 lg:pb-20">
          <p className="eyebrow">Policies</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
            Privacy Policy
          </h1>
          <p className="mt-6 font-display italic text-lg text-charcoal/70 lg:text-xl">
            How we collect, use, and protect your personal information
          </p>
          <p className="mx-auto mt-8 max-w-md text-xs uppercase tracking-[0.28em] text-charcoal/45">
            Last updated · {lastUpdated}
          </p>
        </section>

        {/* Sections */}
        <section className="mx-auto max-w-[760px] px-6 pb-24 lg:px-12 lg:pb-32">
          <div className="border-t border-charcoal/10">
            {SECTIONS.map((section) => (
              <article
                key={section.number}
                className="grid gap-6 border-b border-charcoal/10 py-12 lg:grid-cols-[80px_1fr] lg:gap-10 lg:py-16"
              >
                <div>
                  <span className="font-display text-2xl text-charcoal/35">
                    {section.number}
                  </span>
                </div>
                <div>
                  <h2 className="font-display text-2xl leading-tight lg:text-3xl">
                    {section.title}
                  </h2>
                  <div className="mt-5 space-y-4 text-base leading-relaxed text-charcoal/75">
                    {section.body}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Contact note */}
          <div className="mt-14 text-center">
            <p className="text-sm leading-relaxed text-charcoal/65">
              Questions about this policy? Write to{" "}
              <a
                href="mailto:bookings@mtoniriverlodge.com"
                className="underline underline-offset-4 hover:text-charcoal"
              >
                bookings@mtoniriverlodge.com
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooterMinimal />
    </div>
  );
}
