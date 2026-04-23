import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import logoUrl from "@/assets/mtoni-logo.png";

const links = [
  { to: "/", label: "Home" },
  { to: "/lodge", label: "The Lodge" },
  { to: "/suites", label: "Suites" },
  { to: "/experiences", label: "Experiences" },
  { to: "/dining", label: "Dining" },
  { to: "/journal", label: "Journal" },
  { to: "/plan", label: "Plan Your Stay" },
] as const;

export function SiteHeader({ overlay = true }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 transition state
  const [open, setOpen] = useState(false);
  const [isLg, setIsLg] = useState(false);
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
              className="group relative text-[0.78rem] font-medium uppercase tracking-[0.22em] transition-opacity hover:opacity-100"
              activeProps={{ className: "opacity-100" }}
              inactiveProps={{ className: "opacity-75" }}
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-current transition-all duration-500 group-hover:w-full" />
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link
            to="/plan"
            className="group inline-flex items-center gap-3 border border-current px-5 py-2.5 text-[0.72rem] font-medium uppercase tracking-[0.28em] transition-all hover:bg-current"
          >
            <span className="transition-colors group-hover:text-ivory">Reserve</span>
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
        className={`fixed inset-0 z-[100] flex h-[100svh] w-screen flex-col bg-charcoal text-ivory transition-all duration-500 ease-out lg:hidden ${
          open ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-2"
        }`}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-20 items-center justify-between px-6">
          <img src={logoUrl} alt="Mtoni River Lodge" className="h-10 w-auto brightness-0 invert" />
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="-mr-2 inline-flex h-12 w-12 items-center justify-center rounded-full border border-ivory/20 transition hover:bg-ivory/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="font-display text-3xl py-4 px-6 w-full text-center transition-opacity hover:opacity-70"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 pb-10 pt-4">
          <Link
            to="/plan"
            onClick={() => setOpen(false)}
            className="block w-full border border-ivory py-4 text-center text-[0.72rem] font-medium uppercase tracking-[0.28em] transition hover:bg-ivory hover:text-charcoal"
          >
            Reserve
          </Link>
        </div>
      </div>
    </header>
  );
}
