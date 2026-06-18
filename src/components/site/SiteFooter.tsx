import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Youtube, Plus, Minus } from "lucide-react";
import logoUrl from "@/assets/mtoni-logo.png";
import { RESERVATIONS_NOTE } from "@/lib/contact";
import { AvailabilityModal } from "@/components/site/AvailabilityModal";
import {
  trackBookingClick,
  trackCallClick,
  trackEmailClick,
  trackSocialClick,
} from "@/lib/analytics";

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

const socials = [
  { label: "Instagram", href: "https://www.instagram.com/mtoni_river_lodge", Icon: Instagram },
  { label: "Facebook", href: "https://www.facebook.com/share/1ERY93Negq/", Icon: Facebook },
  { label: "YouTube", href: "https://www.youtube.com/@MtoniRiverLodge", Icon: Youtube },
  { label: "Pinterest", href: "https://www.pinterest.com/mtoniriverlodge", Icon: PinterestIcon },
];

const discoveryGroups: Array<{
  title: string;
  links: Array<{ label: string; to: string }>;
}> = [
  {
    title: "Discover",
    links: [
      { label: "About Mtoni", to: "/lodge" },
      { label: "Dining", to: "/dining" },
      { label: "Gallery", to: "/gallery" },
      { label: "FAQ", to: "/faq" },
      { label: "Plan Your Stay", to: "/plan" },
    ],
  },
  {
    title: "Experiences",
    links: [{ label: "All Experiences", to: "/experiences" }],
  },
  {
    title: "Rooms",
    links: [
      { label: "All Rooms", to: "/rooms" },
      { label: "Riverfront Deluxe", to: "/rooms/riverfront-deluxe" },
      { label: "Family Room", to: "/rooms/family-room" },
      { label: "Standard River", to: "/rooms/standard-river" },
    ],
  },
  {
    title: "Journal",
    links: [{ label: "All Stories", to: "/journal" }],
  },
  {
    title: "Reviews",
    links: [{ label: "Guest Reviews", to: "/reviews" }],
  },
  {
    title: "Policies",
    links: [
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
    ],
  },
];

function AccordionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ivory/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-5 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory/70 transition-colors hover:text-gold"
      >
        <span>{title}</span>
        {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      <div
        className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function SiteFooter() {
  const [availOpen, setAvailOpen] = useState(false);
  return (
    <footer
      id="site-footer"
      className="relative isolate bg-charcoal text-ivory"
      style={{ zIndex: 1 }}
    >
      <div className="mx-auto max-w-[1100px] px-6 py-20 text-center lg:px-12 lg:py-24">
        {/* ============ A. SOCIAL STRIP ============ */}
        <section
          aria-label="Social media"
          className="relative"
          style={{ zIndex: 50, pointerEvents: "auto" }}
        >
          <ul className="flex items-center justify-center gap-6 sm:gap-8">
            {socials.map(({ label, href, Icon }) => (
              <li key={label} className="relative" style={{ zIndex: 50 }}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  data-external-link="true"
                  onClick={() =>
                    trackSocialClick({
                      platform: label,
                      location: "footer",
                      destinationUrl: href,
                    })
                  }
                  className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center text-ivory/70 transition-colors hover:text-gold [&_svg]:pointer-events-none"
                  style={{ zIndex: 50, pointerEvents: "auto" }}
                >
                  <Icon className="h-6 w-6" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* Tagline */}
        <h2 className="mt-14 font-display text-4xl leading-[1.1] lg:text-5xl">
          Where the river<br />remembers your name.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-ivory/70">
          An intimate retreat on the banks of the Nduruma River, Arusha.
          Twenty four rooms. One river. A thousand quiet hours.
        </p>

        {/* ============ B. DISCOVERY SECTION ============ */}
        <section
          aria-label="Site navigation"
          className="relative mx-auto mt-16 max-w-md text-left"
          style={{ zIndex: 10 }}
        >
          <div className="border-t border-ivory/10">
            {discoveryGroups.map((group) => (
              <AccordionGroup key={group.title} title={group.title}>
                <ul className="flex flex-col gap-3 text-sm text-ivory/80">
                  {group.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className="hover:text-gold">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionGroup>
            ))}
          </div>
        </section>

        {/* Visit + Reserve */}
        <div className="mt-12 grid gap-12 sm:grid-cols-2">
          <div>
            <p className="eyebrow !text-ivory/40">Visit</p>
            <ul className="mt-6 space-y-2 text-sm text-ivory/80">
              <li>Gomba Estate</li>
              <li>Arusha, Tanzania</li>
              <li>
                <a
                  href="tel:+255752441443"
                  onClick={() =>
                    trackCallClick({
                      buttonText: "+255 752 441 443",
                      location: "footer",
                      destinationUrl: "tel:+255752441443",
                    })
                  }
                  className="hover:text-gold"
                >
                  +255 752 441 443
                </a>
              </li>
              <li>
                <a
                  href="tel:+255784270357"
                  onClick={() =>
                    trackCallClick({
                      buttonText: "+255 784 270 357",
                      location: "footer",
                      destinationUrl: "tel:+255784270357",
                    })
                  }
                  className="hover:text-gold"
                >
                  +255 784 270 357
                </a>
              </li>
              <li className="pt-2">
                <a
                  href="mailto:bookings@mtoniriverlodge.com"
                  onClick={() =>
                    trackEmailClick({
                      buttonText: "bookings@mtoniriverlodge.com",
                      location: "footer",
                      destinationUrl: "mailto:bookings@mtoniriverlodge.com",
                    })
                  }
                  className="hover:text-gold"
                >
                  bookings@mtoniriverlodge.com
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="eyebrow !text-ivory/40">Reserve</p>
            <p className="mx-auto mt-6 max-w-xs text-sm text-ivory/70">
              Our reservations team responds within 24 hours with a tailored itinerary.
            </p>
            <Link
              to="/book"
              onClick={() => {
                trackBookingClick({
                  buttonText: "Check Availability",
                  location: "footer",
                });
              }}
              className="mt-6 inline-flex items-center gap-3 border border-ivory bg-ivory px-5 py-3 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-transparent hover:text-ivory"
            >
              Check Availability →
            </Link>
            <p className="mx-auto mt-4 max-w-xs text-xs leading-relaxed text-ivory/55">
              {RESERVATIONS_NOTE}
            </p>
          </div>
        </div>

        {/* ============ C. TRUST STRIP ============ */}
        <section
          aria-label="Trust and security"
          className="relative mx-auto mt-16 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-ivory/10 pt-8"
        >
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-ivory/45">
            Secure Website
          </span>
          <span className="hidden h-3 w-px bg-ivory/20 sm:block" />
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-ivory/45">
            Privacy Protected
          </span>
          <span className="hidden h-3 w-px bg-ivory/20 sm:block" />
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-ivory/45">
            Secure Booking Experience
          </span>
        </section>

        {/* ============ D. BRAND BASE ============ */}
        <section
          aria-label="Brand"
          className="relative mt-14 flex flex-col items-center gap-4"
          style={{ zIndex: 5 }}
        >
          <img
            src={logoUrl}
            alt="Mtoni River Lodge"
            className="h-20 w-auto brightness-0 invert"
          />
          <p className="text-xs uppercase tracking-[0.4em] text-ivory/70">
            An African Experience
          </p>
        </section>

        {/* Bottom row */}
        <div className="mt-14 flex flex-col items-center justify-center gap-3 border-t border-ivory/10 pt-8 text-xs text-ivory/50">
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              to="/privacy"
              className="uppercase tracking-[0.2em] transition-colors hover:text-gold"
            >
              Privacy Policy
            </Link>
            <span className="hidden text-ivory/25 sm:inline">·</span>
            <Link
              to="/terms"
              className="uppercase tracking-[0.2em] transition-colors hover:text-gold"
            >
              Terms & Conditions
            </Link>
            <span className="hidden text-ivory/25 sm:inline">·</span>
            <a
              href="mailto:bookings@mtoniriverlodge.com"
              onClick={() =>
                trackEmailClick({
                  buttonText: "Contact Us",
                  location: "footer",
                  destinationUrl: "mailto:bookings@mtoniriverlodge.com",
                })
              }
              className="uppercase tracking-[0.2em] transition-colors hover:text-gold"
            >
              Contact Us
            </a>
          </nav>
          <p>© {new Date().getFullYear()} Mtoni River Lodge. All rights reserved.</p>
          <p className="font-display italic text-ivory/60">
            "Pole pole — slowly, slowly, the river finds the sea."
          </p>
        </div>
      </div>
      <AvailabilityModal
        open={availOpen}
        onOpenChange={setAvailOpen}
        location="footer"
      />
    </footer>
  );
}
