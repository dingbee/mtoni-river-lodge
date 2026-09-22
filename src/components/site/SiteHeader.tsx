import { useEffect, useState } from "react";
import { Menu, X, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { trackBookingClick } from "@/lib/analytics";

const links = [
  { to: "/rooms", label: "Rooms" },
  { to: "/book", label: "Availability" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-charcoal/10 bg-ivory/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:h-20 lg:px-10">
        <Link to="/rooms" aria-label="StayNas" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-burgundy text-ivory text-sm font-semibold transition-transform group-hover:scale-105">S</span>
          <span className="text-sm font-semibold tracking-[0.28em] uppercase">StayNas</span>
        </Link>

        <nav className="hidden items-center gap-9 lg:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="text-xs font-medium uppercase tracking-[0.2em] text-charcoal/65 transition-colors hover:text-charcoal" activeProps={{ className: "text-xs font-medium uppercase tracking-[0.2em] text-charcoal" }}>
              {l.label}
            </Link>
          ))}
          <Link to="/book" onClick={() => trackBookingClick({ buttonText: "Book now", location: "nav_desktop" })} className="inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-ivory shadow-sm transition hover:bg-forest/90">
            Book now <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>

        <button type="button" aria-label="Open StayNas menu" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-charcoal/15 bg-ivory lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] h-dvh w-screen overflow-y-auto bg-ivory text-charcoal lg:hidden">
          <div className="flex min-h-16 items-center justify-between border-b border-charcoal/10 px-5">
            <Link to="/rooms" onClick={() => setOpen(false)} className="text-sm font-semibold tracking-[0.28em] uppercase">StayNas</Link>
            <button type="button" aria-label="Close StayNas menu" onClick={() => setOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-charcoal/15 bg-ivory">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl flex-col px-6 py-10">
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-charcoal/10 py-6 text-2xl font-display hover:text-burgundy">
                <span>{l.label}</span><ArrowRight className="h-5 w-5" />
              </Link>
            ))}
            <Link to="/book" onClick={() => { setOpen(false); trackBookingClick({ buttonText: "Book now", location: "nav_mobile" }); }} className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-forest px-6 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-ivory">
              Book now <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="mt-auto pt-12">
              <div className="rounded-[24px] border border-charcoal/10 bg-bone p-6">
                <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-burgundy" /> StayNas AI</div>
                <p className="mt-2 max-w-sm text-sm leading-6 text-charcoal/60">Smarter hospitality. Brighter guest journeys.</p>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
