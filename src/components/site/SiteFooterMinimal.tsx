import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/mtoni-logo.png";
import { trackEmailClick } from "@/lib/analytics";

export function SiteFooterMinimal() {
  return (
    <footer
      id="site-footer"
      className="relative isolate bg-charcoal text-ivory"
    >
      <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-6 px-6 py-12 text-center lg:px-12">
        <Link to="/" aria-label="Mtoni River Lodge">
          <img
            src={logoUrl}
            alt="Mtoni River Lodge"
            className="h-12 w-auto brightness-0 invert"
          />
        </Link>
        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[0.7rem] uppercase tracking-[0.28em] text-ivory/70">
          <Link to="/" className="hover:text-gold">Home</Link>
          <Link to="/rooms" className="hover:text-gold">Rooms</Link>
          <Link to="/lodge" className="hover:text-gold">The Lodge</Link>
          <Link to="/experiences" className="hover:text-gold">Experiences</Link>
          <Link to="/terms" className="hover:text-gold">Terms</Link>
          <a
            href="mailto:bookings@mtoniriverlodge.com"
            onClick={() =>
              trackEmailClick({
                buttonText: "Contact",
                location: "footer_minimal",
                destinationUrl: "mailto:bookings@mtoniriverlodge.com",
              })
            }
            className="hover:text-gold"
          >
            Contact
          </a>
        </nav>
        <p className="text-xs text-ivory/50">
          © {new Date().getFullYear()} Mtoni River Lodge. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
