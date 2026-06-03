import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { WHATSAPP_URL } from "@/lib/contact";
import { trackContactClick } from "@/lib/analytics";
import { AvailabilityForm } from "@/components/site/AvailabilityForm";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book Your Stay — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Send a reservation inquiry to Mtoni River Lodge on the banks of the Nduruma River, Arusha — confirmation directly via WhatsApp.",
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
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />

      <main className="pt-28 lg:pt-36">
        <section
          id="booking-form"
          aria-label="Reservation inquiry"
          className="mx-auto w-full max-w-[820px] px-4 pb-24 lg:px-12"
        >
          <div className="mb-10 text-center">
            <p className="inline-flex items-center justify-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-charcoal/60">
              <Leaf className="h-3 w-3" style={{ color: "#427A43" }} />
              Mtoni River Lodge · Reservations
            </p>
            <h1 className="mt-5 font-display text-3xl leading-tight lg:text-5xl">
              Reserve Your Stay
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-charcoal/70">
              Share a few details and our reservations team will confirm
              availability and rates shortly — personally, via WhatsApp.
            </p>
          </div>

          <AvailabilityForm location="book_page" />

          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-charcoal/50">
              Prefer to chat directly?
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick("whatsapp", "book_page_assistance")}
              className="inline-flex items-center gap-3 rounded-full border border-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
            >
              Book via WhatsApp · +255 752 441 443 →
            </a>
            <p className="mt-2 text-xs text-charcoal/55">
              Or write to{" "}
              <a
                href="mailto:bookings@mtoniriverlodge.com"
                className="underline underline-offset-4 hover:text-charcoal"
              >
                bookings@mtoniriverlodge.com
              </a>
            </p>
            <p className="mt-4 max-w-sm text-[0.7rem] text-charcoal/50">
              By submitting an inquiry you agree to our{" "}
              <Link
                to="/terms"
                className="underline underline-offset-4 hover:text-charcoal"
              >
                Terms &amp; Conditions
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
