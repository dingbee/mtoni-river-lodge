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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = !overlay || scrolled;
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        solid ? "bg-ivory/95 backdrop-blur-md text-charcoal border-b border-border" : "bg-transparent text-ivory"
      }`}
    >
      <div className="mx-auto flex h-28 max-w-[1500px] items-center justify-between px-6 lg:px-12">
        <Link to="/" className="flex items-center leading-none" aria-label="Mtoni River Lodge">
          <img
            src={logoUrl}
            alt="Mtoni River Lodge"
            className={`h-18 w-auto transition-all duration-500 ${solid ? "" : "brightness-0 invert"}`}
            style={{ height: "4.5rem" }}
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
          className="lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-charcoal text-ivory">
          <div className="flex h-20 items-center justify-between px-6">
            <img src={logoUrl} alt="Mtoni River Lodge" className="h-10 w-auto brightness-0 invert" />
            <button aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col items-center justify-center gap-6">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="font-display text-4xl"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
