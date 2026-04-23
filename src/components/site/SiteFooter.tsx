import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Youtube, Plus, Minus } from "lucide-react";
import logoUrl from "@/assets/mtoni-logo.png";

const socials = [
  { label: "Instagram", href: "https://www.instagram.com/mtoni_river_lodge", Icon: Instagram },
  { label: "Facebook", href: "https://www.facebook.com/mtoniriverlodge", Icon: Facebook },
  { label: "YouTube", href: "https://www.youtube.com/mtoniriverlodge", Icon: Youtube },
  // Pinterest is not in lucide-react; use inline SVG
  { label: "Pinterest", href: "https://www.pinterest.com/mtoniriverlodge", Icon: PinterestIcon },
];

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

export function SiteFooter() {
  const [discoverOpen, setDiscoverOpen] = useState(false);

  return (
    <footer className="relative bg-charcoal text-ivory">
      <div className="mx-auto max-w-[1100px] px-6 py-20 text-center lg:px-12 lg:py-24">
        {/* Social icons */}
        <ul className="flex items-center justify-center gap-8">
          {socials.map(({ label, href, Icon }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex h-10 w-10 items-center justify-center text-ivory/70 transition-colors hover:text-gold"
              >
                <Icon className="h-5 w-5" />
              </a>
            </li>
          ))}
        </ul>

        {/* Tagline */}
        <h2 className="mt-14 font-display text-4xl leading-[1.1] lg:text-5xl">
          Where the river<br />remembers your name.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-ivory/70">
          An intimate retreat on the banks of the Nduruma River, Arusha.
          Twenty four suites. One river. A thousand quiet hours.
        </p>

        {/* Discover (collapsible) */}
        <div className="mx-auto mt-16 max-w-sm border-y border-ivory/10">
          <button
            type="button"
            onClick={() => setDiscoverOpen((o) => !o)}
            aria-expanded={discoverOpen}
            aria-controls="footer-discover"
            className="flex w-full items-center justify-center gap-3 py-5 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory/60 transition-colors hover:text-gold"
          >
            <span>Discover</span>
            {discoverOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
          <div
            id="footer-discover"
            className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: discoverOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <ul className="flex flex-col items-center gap-3 pb-6 text-sm">
                <li><Link to="/lodge" className="hover:text-gold">The Lodge</Link></li>
                <li><Link to="/suites" className="hover:text-gold">Suites</Link></li>
                <li><Link to="/experiences" className="hover:text-gold">Experiences</Link></li>
                <li><Link to="/dining" className="hover:text-gold">Dining</Link></li>
                <li><Link to="/journal" className="hover:text-gold">Journal</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Visit + Reserve */}
        <div className="mt-12 grid gap-12 sm:grid-cols-2">
          <div>
            <p className="eyebrow !text-ivory/40">Visit</p>
            <ul className="mt-6 space-y-2 text-sm text-ivory/80">
              <li>Gomba Estate</li>
              <li>Arusha, Tanzania</li>
              <li>+255 784 270 357</li>
              <li>+255 786 441 441</li>
              <li className="pt-2">
                <a href="mailto:info@mtoniriverlodge.com" className="hover:text-gold">
                  info@mtoniriverlodge.com
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
              to="/plan"
              className="mt-6 inline-flex items-center gap-3 border border-ivory/40 px-5 py-3 text-[0.72rem] font-medium uppercase tracking-[0.28em] hover:bg-ivory hover:text-charcoal"
            >
              Begin a reservation
            </Link>
          </div>
        </div>

        {/* Logo + slogan */}
        <div className="mt-20 flex flex-col items-center gap-4">
          <img
            src={logoUrl}
            alt="Mtoni River Lodge"
            className="h-20 w-auto brightness-0 invert"
          />
          <p className="text-xs uppercase tracking-[0.4em] text-ivory/70">
            The African Experience
          </p>
        </div>

        {/* Bottom row */}
        <div className="mt-14 flex flex-col items-center justify-center gap-3 border-t border-ivory/10 pt-8 text-xs text-ivory/50">
          <p>© {new Date().getFullYear()} Mtoni River Lodge. All rights reserved.</p>
          <p className="font-display italic text-ivory/60">
            "Pole pole — slowly, slowly, the river finds the sea."
          </p>
        </div>
      </div>
    </footer>
  );
}
