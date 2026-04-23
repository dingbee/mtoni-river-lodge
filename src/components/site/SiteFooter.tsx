import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/mtoni-logo.png";

export function SiteFooter() {
  return (
    <footer className="relative bg-charcoal text-ivory">
      <div className="mx-auto max-w-[1500px] px-6 py-24 lg:px-12">
        <div className="grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <img src={logoUrl} alt="Mtoni River Lodge" className="h-20 w-auto brightness-0 invert" />
            <h2 className="mt-8 font-display text-5xl leading-[1.05] lg:text-6xl">
              Where the river<br/>
              remembers your name.
            </h2>
            <p className="mt-8 max-w-md text-ivory/70">
              An intimate retreat on the banks of the Mtoni River, Arusha.
              Twelve suites. One river. A thousand quiet hours.
            </p>
          </div>

          <div className="grid gap-12 sm:grid-cols-3 lg:col-span-7 lg:pl-12">
            <div>
              <p className="eyebrow !text-ivory/40">Discover</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li><Link to="/lodge" className="hover:text-gold">The Lodge</Link></li>
                <li><Link to="/suites" className="hover:text-gold">Suites</Link></li>
                <li><Link to="/experiences" className="hover:text-gold">Experiences</Link></li>
                <li><Link to="/dining" className="hover:text-gold">Dining</Link></li>
                <li><Link to="/journal" className="hover:text-gold">Journal</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow !text-ivory/40">Visit</p>
              <ul className="mt-6 space-y-3 text-sm text-ivory/80">
                <li>Gomba Estate</li>
                <li>Arusha, Tanzania</li>
                <li>+255 784 270 357</li>
                <li>+255 786 441 441</li>
                <li className="pt-3"><a href="mailto:info@mtoniriverlodge.com" className="hover:text-gold">info@mtoniriverlodge.com</a></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow !text-ivory/40">Reserve</p>
              <p className="mt-6 text-sm text-ivory/70">
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
        </div>

        <div className="mt-20 flex flex-col items-start justify-between gap-4 border-t border-ivory/10 pt-8 text-xs text-ivory/50 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Mtoni River Lodge. All rights reserved.</p>
          <p className="font-display italic text-ivory/60">"Pole pole — slowly, slowly, the river finds the sea."</p>
        </div>
      </div>
    </footer>
  );
}
