import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import logoAsset from "@/assets/mtoni-river-lodge-logo.png.asset.json";
import menuBgUrl from "@/assets/hero-river.jpg";
import { Link } from "@tanstack/react-router";
import { MobileStickyCTA } from "@/components/site/MobileStickyCTA";
import { AvailabilityModal } from "@/components/site/AvailabilityModal";
import { trackCheckAvailabilityClick } from "@/lib/analytics";

const logoUrl = logoAsset.url;

const links = [
  { to: "/", label: "Home" },
  { to: "/lodge", label: "About Mtoni" },
  { to: "/rooms", label: "Rooms" },
  { to: "/experiences", label: "Experiences" },
  { to: "/dining", label: "Dining" },
  { to: "/gallery", label: "Gallery" },
  { to: "/journal", label: "Journal" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
  { to: "/plan", label: "Plan Your Stay" },
] as const;

export function SiteHeader({ overlay = true }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 transition state
  const [open, setOpen] = useState(false);
  const [isLg, setIsLg] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [availLocation, setAvailLocation] = useState("nav_desktop");
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 80);
      setProgress(Math.min(1, Math.max(0, (y - 10) / 90)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLg(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Lock background scroll when mobile menu open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : original || "";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const solid = !overlay || scrolled;
  const p = !overlay ? 1 : progress;
  // Interpolate header height & logo height for smooth shrink.
  // Mobile gets a more compact header and noticeably smaller logo
  // to prevent any overlap with hero text or page headings.
  const headerHeight = isLg ? 144 - 40 * p : 72 - 8 * p; // lg: 144->104, mobile: 72->64
  const logoHeight = isLg ? 96 - 24 * p : 36 - 4 * p;    // lg: 96->72,  mobile: 36->32
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,color,box-shadow,border-color] duration-500 ease-out will-change-[background-color] ${
        solid
          ? "bg-ivory/95 backdrop-blur-md text-charcoal border-b border-border shadow-[0_4px_20px_-12px_rgba(0,0,0,0.15)]"
          : p > 0.05
            ? "bg-ivory/40 backdrop-blur-sm text-charcoal border-b border-transparent"
            : "bg-transparent text-ivory border-b border-transparent"
      }`}
    >
      <div
        className="mx-auto flex max-w-[1500px] items-center justify-between px-5 sm:px-6 lg:px-12 transition-[height] duration-500 ease-out"
        style={{ height: `${headerHeight}px` }}
      >
        <Link to="/" className="flex items-center leading-none" aria-label="Mtoni River Lodge">
          <img
            src={logoUrl}
            alt="Mtoni River Lodge"
            className={`w-auto transition-[height,filter] duration-500 ease-out ${solid || p > 0.5 ? "" : "brightness-0 invert"}`}
            style={{ height: `${logoHeight}px` }}
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.slice(1, -1).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="group relative text-[0.78rem] font-medium uppercase tracking-[0.22em] transition-colors hover:text-[var(--gold)]"
              activeProps={{ className: "opacity-100 text-[var(--green)]" }}
              inactiveProps={{ className: "opacity-75" }}
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-[var(--gold)] transition-all duration-500 group-hover:w-full" />
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link
            to="/book"
            onClick={() => trackCheckAvailabilityClick("nav_desktop")}
            className="group inline-flex items-center gap-3 border-2 border-[var(--green)] bg-[var(--green)] px-5 py-2.5 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory transition-all duration-300 hover:bg-transparent hover:text-[var(--green)] hover:shadow-[0_0_24px_-4px_rgba(192,184,122,0.5)]"
          >
            <span>Check Availability</span>
          </Link>
        </div>

        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="lg:hidden -mr-2 inline-flex h-11 w-11 items-center justify-center"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 z-[100] flex h-[100svh] w-screen flex-col text-ivory transition-all duration-500 ease-out lg:hidden ${
          open ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-2"
        }`}
        style={{ backgroundColor: "#141414" }}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
      >
        {/* Faint background image */}
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.18]"
          style={{ backgroundImage: `url(${menuBgUrl})` }}
          aria-hidden="true"
        />
        {/* River-stone texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
          aria-hidden="true"
        />
        {/* Subtle vertical gradient to deepen edges */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(20,20,20,0.85) 0%, rgba(20,20,20,0.7) 50%, rgba(20,20,20,0.92) 100%)",
          }}
          aria-hidden="true"
        />

        <div className="relative flex h-20 items-center justify-between px-6">
          <img src={logoUrl} alt="Mtoni River Lodge" className="h-12 w-auto brightness-0 invert" />
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="-mr-2 inline-flex h-12 w-12 items-center justify-center rounded-full border border-ivory/25 transition hover:bg-ivory/10 hover:text-[var(--gold)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative flex flex-1 flex-col">
          <p className="px-6 pt-2 text-center eyebrow text-[var(--gold)]/80">
            Luxury by Nature
          </p>
          <nav className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            {links.map((l, idx) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                activeProps={{ className: "is-active" }}
                className="mtoni-menu-link group relative font-display text-[2rem] sm:text-4xl py-4 px-6 w-full tracking-wide transition-colors duration-300 hover:text-[var(--gold)] flex items-center justify-center gap-4"
                style={{
                  opacity: open ? 1 : 0,
                  transform: open ? "translateY(0)" : "translateY(8px)",
                  transition: `opacity 600ms ease ${idx * 80 + 120}ms, transform 600ms ease ${idx * 80 + 120}ms, color 300ms ease`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="block h-7 w-[2px] bg-[var(--green)] opacity-0 transition-opacity duration-300 group-[.is-active]:opacity-100"
                />
                <span>{l.label}</span>
                <span aria-hidden="true" className="block h-7 w-[2px]" />
              </Link>
            ))}
          </nav>
        </div>
        <div className="relative px-6 pb-10 pt-4">
          <Link
            to="/book"
            onClick={() => {
              trackCheckAvailabilityClick("nav_mobile");
              setOpen(false);
            }}
            className="block w-full border-2 border-[var(--green)] bg-[var(--green)] py-4 text-center text-[0.72rem] font-medium uppercase tracking-[0.32em] text-ivory transition-all duration-300 hover:bg-transparent hover:text-[var(--gold)] hover:border-[var(--gold)] hover:shadow-[0_0_28px_-4px_rgba(192,184,122,0.55)]"
          >
            Check Availability
          </Link>
          <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-ivory/55">
            Check live availability and reserve your stay online — our team is on hand should you need assistance.
          </p>
        </div>
      </div>
      <MobileStickyCTA />
      <AvailabilityModal
        open={availOpen}
        onOpenChange={setAvailOpen}
        location={availLocation}
      />
    </header>
  );
}
