import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em]">StayNas</p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/60">
              Hospitality operating software for reservations, guest experience, operations, and intelligent property management.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">Guest</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white/75">
              <Link to="/rooms" className="hover:text-white">Rooms</Link>
              <Link to="/book" className="hover:text-white">Availability</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">StayNas AI</p>
            <p className="mt-4 text-sm leading-6 text-white/60">
              Intelligent assistance throughout the guest journey.
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} StayNas. All rights reserved.</span>
          <span>Hospitality Operating System</span>
        </div>
      </div>
    </footer>
  );
}
