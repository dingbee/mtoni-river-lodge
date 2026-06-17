import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Booking, payment, and cancellation policies for stays at Mtoni River Lodge, Arusha, Tanzania.",
      },
      { property: "og:title", content: "Terms & Conditions — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "Deposit, balance, and cancellation policies for reservations at Mtoni River Lodge.",
      },
    ],
  }),
  component: TermsPage,
});

type Section = {
  number: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    number: "01",
    title: "Booking Confirmation",
    body: (
      <>
        <p>
          A reservation is considered confirmed once the required deposit has
          been received and acknowledged by Mtoni River Lodge.
        </p>
        <p>All bookings remain provisional until payment is completed.</p>
      </>
    ),
  },
  {
    number: "02",
    title: "Deposit Requirement",
    body: (
      <>
        <p>
          A 50% deposit of the total booking value is required to secure a
          reservation.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Deposit must be paid at least 45 days prior to arrival.</li>
          <li>
            Bookings made within 45 days of arrival require immediate deposit
            payment.
          </li>
        </ul>
      </>
    ),
  },
  {
    number: "03",
    title: "Balance Payment",
    body: (
      <>
        <p>The remaining balance must be settled:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>30 days prior to arrival, or</li>
          <li>As otherwise agreed in writing with management.</li>
        </ul>
        <p>
          Failure to complete payment within the required timeframe may result
          in cancellation of the booking.
        </p>
      </>
    ),
  },
  {
    number: "04",
    title: "Booking Security",
    body: (
      <p>
        In the unlikely event that the lodge is unable to provide accommodation
        for a confirmed booking, Mtoni River Lodge will arrange alternative
        accommodation of a similar standard at its own expense.
      </p>
    ),
  },
  {
    number: "05",
    title: "Credit Facilities",
    body: (
      <p>
        Credit facilities will not be extended unless prior arrangements have
        been made with management in writing.
      </p>
    ),
  },
  {
    number: "06",
    title: "Bounced Cheques",
    body: <p>All bounced cheques are subject to a 10% unpaid cheque charge.</p>,
  },
  {
    number: "07",
    title: "Payment of Bills",
    body: (
      <ul className="list-disc space-y-2 pl-6">
        <li>
          All payments must be made in foreign currency or via USD account
          cheque, unless otherwise agreed for residents.
        </li>
        <li>
          Outstanding balances not settled within 30 days will incur a 10% late
          payment fee.
        </li>
      </ul>
    ),
  },
  {
    number: "08",
    title: "Exchange Rate",
    body: (
      <p>
        The US dollar value of booking fees or deposits will be calculated based
        on the applicable exchange rate on the date of stay.
      </p>
    ),
  },
  {
    number: "09",
    title: "Cancellations & Amendments",
    body: (
      <>
        <p>
          Cancellations must be made in advance and are subject to the following
          conditions:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>More than 60 days before arrival — no charge.</li>
          <li>40–45 days before arrival — 25% charge.</li>
          <li>30–39 days before arrival — 50% charge.</li>
          <li>Less than 30 days before arrival — 100% charge.</li>
        </ul>
        <p>All applicable charges are based on the total booking value.</p>
      </>
    ),
  },
  {
    number: "10",
    title: "Policy Changes",
    body: (
      <p>
        Management reserves the right to modify these terms and conditions at
        any time without prior notice.
      </p>
    ),
  },
];

function TermsPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />

      <BreadcrumbsBar />
      <main className="pt-10 lg:pt-14">
        {/* Header */}
        <section className="mx-auto max-w-[820px] px-6 pb-14 text-center lg:px-12 lg:pb-20">
          <p className="eyebrow">Policies</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
            Terms &amp; Conditions
          </h1>
          <p className="mt-6 font-display italic text-lg text-charcoal/70 lg:text-xl">
            Booking, Payment &amp; Cancellation Policies
          </p>
          <p className="mx-auto mt-8 max-w-md text-xs uppercase tracking-[0.28em] text-charcoal/45">
            Last updated · {new Date().getFullYear()}
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
              Questions about these terms? Write to{" "}
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
