import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { WHATSAPP_URL } from "@/lib/contact";

// Replace with the real Beds24 embed URL when available, e.g.:
// "https://beds24.com/booking2.php?propid=YOUR_PROPERTY_ID"
const BEDS24_EMBED_URL: string | null = null;

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book Your Stay — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Check availability and reserve your room at Mtoni River Lodge on the banks of the Nduruma River, Arusha.",
      },
      { property: "og:title", content: "Book Your Stay — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "Reserve your room at Mtoni River Lodge — an intimate riverfront retreat in Arusha, Tanzania.",
      },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />

      <main className="pt-28 lg:pt-36">
        <section className="mx-auto max-w-[1100px] px-6 pb-10 text-center lg:px-12 lg:pb-14">
          <p className="eyebrow">Reserve</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] lg:text-6xl">
            Check availability.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-charcoal/70">
            Select your dates, room and number of guests. Our team confirms
            every reservation personally within 24 hours.
          </p>
        </section>

        {/* Beds24 booking engine */}
        <section
          aria-label="Booking engine"
          className="mx-auto w-full max-w-[1100px] px-4 pb-20 lg:px-12"
        >
          <div
            className="relative w-full overflow-hidden rounded-sm border border-charcoal/10 bg-white"
            style={{ minHeight: "780px" }}
          >
            {BEDS24_EMBED_URL ? (
              <>
                {!loaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[0.7rem] uppercase tracking-[0.3em] text-charcoal/50">
                      Loading booking engine…
                    </p>
                  </div>
                )}
                <iframe
                  title="Mtoni River Lodge — Booking"
                  src={BEDS24_EMBED_URL}
                  loading="lazy"
                  onLoad={() => setLoaded(true)}
                  className="h-[780px] w-full lg:h-[900px]"
                  style={{ border: 0, display: "block" }}
                  allow="payment"
                />
              </>
            ) : (
              <div className="flex min-h-[780px] flex-col items-center justify-center gap-6 px-6 py-20 text-center">
                <p className="eyebrow">Booking Engine</p>
                <h2 className="font-display text-3xl lg:text-4xl">
                  Beds24 will appear here.
                </h2>
                <p className="max-w-md text-sm text-charcoal/60">
                  Our live availability calendar is being connected. In the
                  meantime, our team is ready to confirm your stay personally.
                </p>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-3 px-7 py-4 text-[0.72rem] uppercase tracking-[0.28em]"
                  style={{ backgroundColor: "#C0B87A", color: "#1E2D1E" }}
                >
                  Reserve via WhatsApp →
                </a>
              </div>
            )}
          </div>

          {/* Assistance row */}
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-charcoal/50">
              Need assistance?
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 border border-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
            >
              WhatsApp +255 752 441 443 →
            </a>
            <p className="mt-2 text-xs text-charcoal/50">
              Or write to{" "}
              <a
                href="mailto:info@mtoniriverlodge.com"
                className="underline underline-offset-4 hover:text-charcoal"
              >
                info@mtoniriverlodge.com
              </a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooterMinimal />
    </div>
  );
}
