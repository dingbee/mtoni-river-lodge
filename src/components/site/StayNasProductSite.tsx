import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { trackGAEvent, trackPageView } from "@/lib/analytics";
import { ArrowRight, ArrowUpRight, BedDouble, Building2, CalendarCheck, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, CircleDot, CreditCard, ExternalLink, Globe2, House, Layers3, Menu, Network, ShieldCheck, Sparkles, Users, Workflow, Wrench, X, Search } from "lucide-react";
import { STAYNAS_PUBLIC_CAPABILITIES, STAYNAS_PILLARS, type PublicCapability } from "@/lib/staynas-public-capabilities";
import { StayNasDemoRequestForm, StayNasModulePreview } from "@/components/site/StayNasWebsiteEnhancements";

const capabilityIcons: Record<string, typeof BedDouble> = {
  reservations: CalendarCheck,
  property: BedDouble,
  "front-desk": Users,
  housekeeping: Wrench,
  guest: Users,
  finance: ChartNoAxesCombined,
  "ai-concierge": Sparkles,
  automation: Workflow,
  "multi-property": Building2,
  payments: CreditCard,
  distribution: Network,
  ecosystem: Layers3,
};

const PUBLIC_SEARCH_ITEMS = [
  { title: "Platform overview", category: "Platform", to: "/platform", terms: "hospitality operating system connected platform overview property operations commercial guest experience finance intelligence" },
  { title: "Reservations & booking lifecycle", category: "Operations", to: "/modules#reservations", terms: "reservations booking availability rates guest details amendments confirmation booking lifecycle" },
  { title: "Front desk & digital check-in", category: "Operations", to: "/modules#front-desk", terms: "reception arrivals departures check in check-out room assignment guest arrival pass" },
  { title: "Housekeeping & inspections", category: "Operations", to: "/modules#housekeeping", terms: "cleaning room turnover task assignment inspection maintenance room readiness" },
  { title: "Rooms & inventory", category: "Operations", to: "/modules#rooms-inventory", terms: "rooms accommodation categories room types capacity inventory allocation status" },
  { title: "Guest profiles & intelligence", category: "Guest experience", to: "/modules#guest-intelligence", terms: "guest crm profiles preferences stay history returning guest service context" },
  { title: "AI Concierge", category: "Guest experience", to: "/modules#staynas-ai", terms: "artificial intelligence concierge property knowledge guest questions facilities services policies" },
  { title: "Finance & payments", category: "Financial control", to: "/modules#finance", terms: "finance payments balances folio invoices settlements reconciliation revenue" },
  { title: "Revenue & pricing", category: "Commercial", to: "/modules#revenue", terms: "revenue rate plans pricing rules adr revpar restrictions performance" },
  { title: "Booking distribution", category: "Commercial", to: "/integrations", terms: "channel manager ota booking channels distribution connectors inventory availability" },
  { title: "Platform integrations", category: "Connected ecosystem", to: "/integrations", terms: "integrations api providers connectors payment communication distribution ecosystem" },
  { title: "Hospitality business solutions", category: "Solutions", to: "/solutions", terms: "hotels lodges resorts serviced apartments hostels multi property hospitality business" },
  { title: "Product walkthrough", category: "Explore", to: "/product-tour", terms: "tour demo guest journey workflow discover how staynas works" },
  { title: "Platform architecture", category: "Explore", to: "/architecture", terms: "architecture multi tenant property aware organisation data boundaries platform" },
  { title: "Trust & security", category: "Resources", to: "/security", terms: "security privacy permissions roles access tenant isolation governance" },
  { title: "Plans & pricing", category: "Commercial", to: "/pricing", terms: "pricing plans subscription commercial packages fees add ons" },
  { title: "Request a demonstration", category: "Get started", to: "/request-demo", terms: "contact sales book demo request demonstration enquiry talk to team" },
  { title: "Multi-property management", category: "Administration", to: "/modules#multi-property", terms: "groups organisations multiple properties central oversight tenant boundaries" },
  { title: "Workflow automation", category: "Intelligence", to: "/modules#automation", terms: "automation events notifications tasks approvals operational workflows" },
  { title: "Reporting & management intelligence", category: "Management", to: "/modules#reporting-intelligence", terms: "analytics reports dashboards metrics management performance" },
] as const;

export function ProductSiteHeader() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeMenu, setActiveMenu] = useState<"root" | "platform">("root");
  const links = [
    { to: "/platform", label: "Platform" },
    { to: "/modules", label: "Modules" },
    { to: "/product-tour", label: "Product walkthrough" },
  ] as const;
  const [expanded, setExpanded] = useState<string | null>("Platform");
  const groups = [
    { label: "Solutions", items: [{ to: "/solutions", label: "By hospitality business" }, { to: "/integrations", label: "Integrations & ecosystem" }] },
    { label: "Resources", items: [{ to: "/security", label: "Trust & security" }, { to: "/architecture", label: "Platform architecture" }, { to: "/product-tour", label: "Product walkthrough" }] },
  ] as const;
  const platformSections = [
    { heading: "Operations", items: [{ to: "/modules#reservations", label: "Reservations & booking" }, { to: "/modules#front-desk", label: "Front desk" }, { to: "/modules#housekeeping", label: "Housekeeping" }, { to: "/modules#rooms-inventory", label: "Rooms & inventory" }] },
    { heading: "Guest", items: [{ to: "/modules#staynas-ai", label: "AI Concierge" }, { to: "/modules#guest-intelligence", label: "Guest profiles & intelligence" }] },
    { heading: "Revenue", items: [{ to: "/modules#revenue", label: "Revenue & pricing" }, { to: "/modules#finance", label: "Finance" }, { to: "/integrations", label: "Booking & distribution" }] },
  ] as const;

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      else if (event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 60);
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSearchOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => { window.clearTimeout(timer); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onEscape); };
  }, [searchOpen]);

  const searchResults = searchQuery.trim()
    ? PUBLIC_SEARCH_ITEMS.filter((item) => (item.title + " " + item.category + " " + item.terms).toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 8)
    : PUBLIC_SEARCH_ITEMS.slice(0, 6);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);
  const toggleGroup = (label: string) => setExpanded((current) => current === label ? null : label);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#3A4A3F]/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link to="/" onClick={closeMenu} className="flex items-center gap-3" aria-label="StayNas home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#AE8F60] text-lg font-semibold text-[#2A2725]">S</span>
          <span className="text-lg font-semibold tracking-[0.12em]">STAYNAS</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">
          {links.map((item) => <Link key={item.to} to={item.to} className="text-sm text-white/70 transition hover:text-white">{item.label}</Link>)}
          <Link to="/solutions" className="text-sm text-white/70 transition hover:text-white">Solutions</Link>
          <Link to="/pricing" className="text-sm text-white/70 transition hover:text-white">Pricing</Link>
          <a href="https://nolmark.co" target="_blank" rel="noreferrer" className="text-sm text-white/70 transition hover:text-white">Company <ExternalLink className="ml-1 inline h-3 w-3"/></a>
          <button type="button" aria-label="Search StayNas" onClick={() => setSearchOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:bg-white/10 hover:text-white"><Search className="h-5 w-5"/></button>
          <Link to="/request-demo" className="inline-flex items-center gap-2 rounded-full bg-[#AE8F60] px-5 py-3 text-sm font-semibold text-[#2A2725] transition hover:bg-[#91A673]">Book a Demo <ArrowUpRight className="h-4 w-4"/></Link>
        </nav>
        <div className="flex items-center gap-2 lg:hidden"><button type="button" aria-label="Search StayNas" onClick={() => setSearchOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10"><Search className="h-5 w-5"/></button>
        <button type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="staynas-mobile-navigation" onClick={() => setOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 lg:hidden">
          <Menu className="h-5 w-5"/>
        </button></div>
      </div>

      {searchOpen && <div className="fixed inset-0 z-[120] flex items-start justify-center bg-[#2A2725]/65 px-4 pb-6 pt-[max(8vh,36px)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Search StayNas" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#EAE2D3] bg-[#F6F2F1] text-[#2A2725] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-[#EAE2D3] px-5 py-4"><Search className="h-5 w-5 shrink-0 text-[#AE8F60]"/><input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search StayNas, features, solutions..." aria-label="Search StayNas website" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[#3A4A3F]"/><kbd className="hidden rounded border border-[#EAE2D3] px-2 py-1 text-[10px] text-[#3A4A3F] sm:inline">ESC</kbd><button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} className="rounded-full p-2 transition hover:bg-[#EAE2D3]"><X className="h-5 w-5"/></button></div>
          <div className="max-h-[min(65vh,560px)] overflow-y-auto p-3"><p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#AE8F60]">{searchQuery.trim() ? "Search results" : "Explore StayNas"}</p>
            {searchResults.length ? searchResults.map((item) => <a key={item.title} href={item.to} onClick={() => setSearchOpen(false)} className="group flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition hover:bg-[#EAE2D3]"><span className="min-w-0"><span className="block text-sm font-medium text-[#3A4A3F]">{item.title}</span><span className="mt-1 block text-xs text-[#3A4A3F]">{item.category}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-[#AE8F60] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/></a>) : <p className="px-3 py-10 text-center text-sm text-[#3A4A3F]">No matches yet. Try reservations, rooms, finance or concierge.</p>}
          </div>
          <div className="flex items-center justify-between border-t border-[#EAE2D3] px-5 py-3 text-[10px] text-[#3A4A3F]"><span>Search across the StayNas website</span><span>⌘ K / Ctrl K</span></div>
        </div>
      </div>}
      {open && <div className="fixed inset-0 z-[100] lg:hidden">
        <button type="button" aria-label="Close navigation overlay" onClick={closeMenu} className="absolute inset-0 h-full w-full cursor-default bg-[#2A2725]/55 backdrop-blur-[2px]"/>
        <aside id="staynas-mobile-navigation" role="dialog" aria-modal="true" aria-label="StayNas navigation" onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 flex h-[100dvh] w-[min(100%,440px)] flex-col overflow-hidden bg-[#F6F2F1] text-[#2A2725] shadow-2xl">
          <div className="flex min-h-[88px] items-center justify-between border-b border-[#EAE2D3] px-6 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {activeMenu === "platform" ? <>
                <button type="button" aria-label="Back to main navigation" onClick={() => setActiveMenu("root")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#2A2725] transition hover:bg-[#EAE2D3]"><ChevronRight className="h-6 w-6 rotate-180"/></button>
                <span className="text-lg font-semibold text-[#2A2725]">Platform</span>
              </> : <Link to="/" onClick={closeMenu} className="flex items-center gap-3" aria-label="StayNas home">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#AE8F60] text-lg font-semibold text-[#2A2725]">S</span>
                <span className="truncate text-[17px] font-semibold tracking-[0.1em] text-[#2A2725]">STAYNAS <span className="font-normal tracking-normal text-[#3A4A3F]">Hospitality OS</span></span>
              </Link>}
            </div>
            <button type="button" aria-label="Close navigation menu" onClick={closeMenu} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#2A2725] transition hover:bg-[#EAE2D3]"><X className="h-7 w-7"/></button>
          </div>

          <nav aria-label="Mobile navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 pt-3 sm:px-8">
            {activeMenu === "platform" ? <>
              <Link to="/platform" onClick={closeMenu} className="flex min-h-[112px] items-center border-b border-[#EAE2D3] text-[25px] font-medium text-[#2A2725] transition hover:text-[#3A4A3F]">Overview</Link>
              {platformSections.map(section => <section key={section.heading} className="border-b border-[#EAE2D3] py-7">
                <h3 className="mb-5 text-[17px] font-medium text-[#3A4A3F]">{section.heading}</h3>
                <div className="space-y-1">{section.items.map(item => <a key={item.label} href={item.to} onClick={closeMenu} className="flex min-h-[58px] items-center py-3 text-[21px] font-normal tracking-tight text-[#2A2725] transition-colors hover:text-[#3A4A3F]">{item.label}</a>)}</div>
              </section>)}
              <Link to="/architecture" onClick={closeMenu} className="flex min-h-[76px] items-center border-b border-[#EAE2D3] text-[20px] text-[#2A2725]">Architecture</Link>
            </> : <>
              <button type="button" onClick={() => setActiveMenu("platform")} className="flex min-h-[76px] w-full items-center justify-between border-b border-[#EAE2D3] text-left text-[22px] font-medium text-[#2A2725] transition hover:text-[#3A4A3F]">Platform<ChevronRight className="h-6 w-6"/></button>
              {groups.map(group => {
                const isExpanded = expanded === group.label;
                return <section key={group.label} className="border-b border-[#EAE2D3]">
                  <button type="button" aria-expanded={isExpanded} onClick={() => setExpanded(current => current === group.label ? null : group.label)} className={"flex min-h-[76px] w-full items-center justify-between text-left text-[22px] font-medium transition-colors " + (isExpanded ? "text-[#3A4A3F]" : "text-[#2A2725] hover:text-[#AE8F60]")}>{group.label}{isExpanded ? <ChevronDown className="h-6 w-6"/> : <ChevronRight className="h-6 w-6"/>}</button>
                  {isExpanded && <div className="space-y-1 pb-5 pl-1">{group.items.map(item => <Link key={item.to} to={item.to} onClick={closeMenu} className="flex items-center justify-between rounded-lg px-3 py-3 text-base text-[#3A4A3F] transition hover:bg-[#EAE2D3] hover:text-[#3A4A3F]">{item.label}<ArrowUpRight className="h-4 w-4 opacity-60"/></Link>)}</div>}
                </section>;
              })}
              <Link to="/pricing" onClick={closeMenu} className="flex min-h-[76px] items-center justify-between border-b border-[#EAE2D3] text-[22px] font-medium text-[#2A2725] transition hover:text-[#AE8F60]">Pricing<ArrowUpRight className="h-5 w-5"/></Link>
              <Link to="/admin" onClick={closeMenu} className="mt-6 flex min-h-[54px] items-center justify-center rounded-full border border-[#3A4A3F] px-6 text-base font-medium text-[#2A2725] transition hover:bg-[#EAE2D3]">Login</Link>
            </>}
          </nav>

          <div className="shrink-0 border-t border-[#EAE2D3] bg-[#F6F2F1] px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 sm:px-8">
            <Link to="/request-demo" onClick={closeMenu} className="flex min-h-[58px] w-full items-center justify-center rounded-full bg-[#AE8F60] px-6 text-base font-semibold text-white shadow-sm transition hover:bg-[#91A673]">Book a Demo</Link>
          </div>
        </aside>
      </div>}
    <style>{`
      .staynas-public-site main article[class*="rounded-2xl"],
      .staynas-public-site main article[class*="rounded-3xl"] {
        border: 0 !important;
        border-bottom: 1px solid #EAE2D3 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      .staynas-public-site main article[class*="rounded-2xl"]:last-child,
      .staynas-public-site main article[class*="rounded-3xl"]:last-child {
        border-bottom: 0 !important;
      }
      .staynas-public-site main .site-editorial-item {
        border-bottom: 1px solid #EAE2D3;
        background: transparent;
        box-shadow: none;
      }
      .staynas-public-site main [data-editorial-panel] {
        border-radius: 0;
        box-shadow: none;
      }
      html { scroll-behavior: smooth; }
      .staynas-public-site main section { scroll-margin-top: 6rem; }
      .capability-reveal { transition: opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1), border-color .3s ease; }
      .capability-reveal[data-reveal-pending="true"] { opacity: .28; transform: translateY(22px); }
      .capability-reveal[data-revealed="true"] { opacity: 1; transform: translateY(0); }
      .capability-reveal:hover { border-color: #AE8F60; }
      [data-scroll-emphasis] p, [data-scroll-emphasis] h2 { transition: opacity .5s ease, font-weight .5s ease, letter-spacing .5s ease; }
      [data-scroll-emphasis] h2 { opacity: .62; font-weight: 500; }
      [data-scroll-emphasis][data-active="true"] h2 { opacity: 1; font-weight: 750; letter-spacing: -.025em; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        .capability-reveal, [data-scroll-emphasis] p, [data-scroll-emphasis] h2 { transition: none; transform: none; opacity: 1; }
      }
      @media (max-width: 640px) {
        .staynas-public-site main h1, .staynas-public-site main h2 { text-wrap: balance; }
      }
    `}</style>
    </header>
  );
}

export function ProductSiteFooter() {
  const [expanded, setExpanded] = useState<string | null>("Platform");
  const groups = [
    { title: "Platform", links: [{ to: "/platform", label: "Platform overview" }, { to: "/modules", label: "Modules" }, { to: "/product-tour", label: "Product walkthrough" }, { to: "/integrations", label: "Integrations" }, { to: "/pricing", label: "Plans & pricing" }] },
    { title: "Solutions", links: [{ to: "/solutions", label: "By hospitality business" }, { to: "/request-demo", label: "Request a demonstration" }] },
    { title: "Resources", links: [{ to: "/architecture", label: "Platform architecture" }, { to: "/security", label: "Trust & security" }] },
    { title: "Company", links: [{ to: "/request-demo", label: "Contact StayNas" }, { to: "https://nolmark.co", label: "Nolmark CDMA", external: true }] },
    { title: "Support", links: [{ to: "mailto:support@staynas.nolmark.co", label: "Contact support", external: true }, { to: "/privacy", label: "Privacy" }] },
  ] as const;

  const renderLinks = (group: typeof groups[number]) => (
    <ul className={group.title === "Platform" ? "mt-5 grid grid-cols-2 gap-x-5 gap-y-4" : "mt-5 space-y-4"}>
      {group.links.map((item) => <li key={item.label}>
        {"external" in item && item.external
          ? <a href={item.to} target={item.to.startsWith("http") ? "_blank" : undefined} rel={item.to.startsWith("http") ? "noreferrer" : undefined} className="text-sm leading-6 text-[#F6F2F1]/65 transition hover:text-[#AE8F60]">{item.label}</a>
          : <Link to={item.to} className="text-sm leading-6 text-[#F6F2F1]/65 transition hover:text-[#AE8F60]">{item.label}</Link>}
      </li>)}
    </ul>
  );

  return (
    <footer className="bg-[#2A2725] text-[#F6F2F1]">
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-14 lg:px-10 lg:pb-12 lg:pt-20">
        <div className="border-b border-[#F6F2F1]/15 pb-12 lg:pb-16">
          <h2 className="max-w-2xl font-serif text-[38px] leading-[1.12] tracking-tight sm:text-5xl">Hospitality insights,<br/><span className="text-[#AE8F60]">straight to you.</span></h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-[#F6F2F1]/65">Product thinking, hospitality operations and ideas for running a better-connected property.</p>
          <form className="mt-8 flex min-h-[64px] w-full max-w-2xl items-center rounded-full bg-[#3A4A3F] pl-6 pr-3 focus-within:ring-2 focus-within:ring-[#AE8F60]" onSubmit={(event) => {
            event.preventDefault();
            const email = new FormData(event.currentTarget).get("email");
            if (typeof email === "string" && email.trim()) {
              window.location.href = `mailto:support@staynas.nolmark.co?subject=StayNas%20updates&body=Please%20send%20me%20StayNas%20hospitality%20insights%20and%20updates.%0A%0AEmail:%20${encodeURIComponent(email.trim())}`;
            }
          }}>
            <label className="sr-only" htmlFor="staynas-footer-email">Your email address</label>
            <input id="staynas-footer-email" name="email" type="email" required placeholder="What's your email?" className="min-w-0 flex-1 bg-transparent text-base text-[#F6F2F1] outline-none placeholder:text-[#F6F2F1]/55"/>
            <button type="submit" aria-label="Request StayNas email updates" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#AE8F60] transition hover:bg-[#2A2725]/40 hover:text-[#F6F2F1]"><ArrowUpRight className="h-6 w-6"/></button>
          </form>
        </div>

        <div className="hidden grid-cols-6 gap-x-8 gap-y-10 border-b border-[#F6F2F1]/15 py-12 lg:grid">
          {groups.map((group) => <section key={group.title} className={group.title === "Platform" ? "col-span-2" : "col-span-1"}>
            <h3 className="text-base font-semibold text-[#F6F2F1]">{group.title}</h3>
            {renderLinks(group)}
          </section>)}
        </div>

        <div className="border-b border-[#F6F2F1]/15 lg:hidden">
          {groups.map((group) => {
            const isExpanded = expanded === group.title;
            return <section key={group.title} className="border-b border-[#F6F2F1]/15 last:border-b-0">
              <button type="button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : group.title)} className="flex min-h-[76px] w-full items-center justify-between text-left text-lg font-medium text-[#F6F2F1]">
                {group.title}<span aria-hidden="true" className="text-xl font-light">{isExpanded ? "−" : "+"}</span>
              </button>
              {isExpanded && <div className="pb-7">{renderLinks(group)}</div>}
            </section>;
          })}
        </div>

        <div className="flex flex-col gap-3 pt-7 text-xs leading-6 text-[#F6F2F1]/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} StayNas. All rights reserved.</span>
          <span>Hospitality Operating System · staynas.com</span>
        </div>
      </div>
    </footer>
  );
}
function SiteShell({ children }: { children: ReactNode }) {
  return <div className="staynas-public-site min-h-screen bg-[#F6F2F1] text-[#2A2725]"><ProductSiteHeader/><StayNasAnalytics/>{children}<ProductSiteFooter/></div>;
}

function StayNasAnalytics() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const [consent, setConsent] = useState<boolean | null>(null);
  const ga4Id = import.meta.env.VITE_STAYNAS_GA4_MEASUREMENT_ID as string | undefined;
  const gtmId = import.meta.env.VITE_STAYNAS_GTM_CONTAINER_ID as string | undefined;
  const configured = Boolean(ga4Id || gtmId);

  useEffect(() => {
    const saved = window.localStorage.getItem("staynas-analytics-consent");
    setConsent(saved === "granted" ? true : saved === "denied" ? false : null);
  }, []);

  useEffect(() => {
    if (!configured || consent !== true) return;
    window.dataLayer = window.dataLayer || [];
    let script: HTMLScriptElement;
    if (gtmId) {
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    } else if (ga4Id) {
      window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
      window.gtag("js", new Date());
      window.gtag("config", ga4Id, { send_page_view: false });
      script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`;
    } else {
      return;
    }
    document.head.appendChild(script);
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin === window.location.origin && destination.pathname === "/request-demo") {
        trackGAEvent("demo_request_click", { event_category: "conversion", cta_location: "product_website" });
      }
    };
    const handleDemoSuccess = (event: Event) => {
      const detail = (event as CustomEvent<{ propertyType?: string; propertyCount?: string }>).detail ?? {};
      trackGAEvent("generate_lead", { event_category: "conversion", form_name: "staynas_demo_request", property_type: detail.propertyType, property_count_band: detail.propertyCount });
    };
    document.addEventListener("click", handleClick);
    window.addEventListener("staynas:demo-request-success", handleDemoSuccess);
    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("staynas:demo-request-success", handleDemoSuccess);
      script.remove();
    };
  }, [configured, consent, ga4Id, gtmId]);

  useEffect(() => {
    if (configured && consent === true) trackPageView(pathname);
  }, [configured, consent, pathname]);

  if (!configured || consent !== null) return null;
  const choose = (granted: boolean) => {
    window.localStorage.setItem("staynas-analytics-consent", granted ? "granted" : "denied");
    setConsent(granted);
  };
  return <aside aria-label="Analytics preferences" className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-[#EAE2D3] bg-white p-5 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
    <div><p className="text-sm font-semibold text-[#2A2725]">Help improve StayNas</p><p className="mt-1 text-xs leading-5 text-[#3A4A3F]">With your permission, we use analytics to understand website visits and demo interest. Form details and personal contact information are not sent to analytics.</p></div>
    <div className="flex shrink-0 gap-2"><button type="button" onClick={() => choose(false)} className="rounded-full border border-[#EAE2D3] px-4 py-2.5 text-xs font-semibold text-[#3A4A3F]">Essential only</button><button type="button" onClick={() => choose(true)} className="rounded-full bg-[#3A4A3F] px-4 py-2.5 text-xs font-semibold text-white">Allow analytics</button></div>
  </aside>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#AE8F60]">{children}</p>;
}

function ScrollEmphasis({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      node.dataset.active = entry.isIntersecting ? "true" : "false";
    }, { threshold: 0.45 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} data-scroll-emphasis>{children}</div>;
}

function CapabilityCard({ item, index }: { item: PublicCapability; index: number }) {
  const Icon = capabilityIcons[item.id] ?? CircleDot;
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLElementTagNameMap["article"]>(null!);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    node.dataset.revealPending = "true";
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.dataset.revealed = "true";
        observer.disconnect();
      }
    }, { threshold: 0.16, rootMargin: "0px 0px -32px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <article ref={cardRef} data-reveal="true" className="site-editorial-item capability-reveal group flex h-full flex-col p-7" style={{ transitionDelay: `${(index % 6) * 65}ms` }}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex h-full w-full flex-col text-left">
        <div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAE2D3] text-[#3A4A3F] transition duration-300 group-hover:-translate-y-1 group-hover:bg-[#AE8F60]"><Icon className="h-5 w-5"/></span><span className="mt-2 text-xs font-medium text-[#AE8F60] transition group-hover:text-[#3A4A3F]">{expanded ? "Close details −" : "Explore capability +"}</span></div>
        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#AE8F60]">{item.pillar}</p>
        <h3 className="mt-3 text-lg font-semibold tracking-tight transition-colors duration-300 group-hover:text-[#3A4A3F]">{item.name}</h3>
        <p className="mt-3 text-sm leading-7 text-[#3A4A3F]">{item.summary}</p>
      </button>
      {expanded && <div className="mt-5 rounded-2xl bg-[#EAE2D3] p-5 motion-safe:animate-[fadeIn_.25s_ease-out]">
        <p className="text-xs font-semibold text-[#3A4A3F]">Inside this capability</p>
        <ul className="mt-3 space-y-2.5">{item.details.map(detail => <li key={detail} className="flex gap-2 text-sm leading-6 text-[#3A4A3F]"><Check className="mt-1 h-4 w-4 shrink-0 text-[#91A673]"/>{detail}</li>)}</ul>
      </div>}
    </article>
  );
}

export function ProductHomePage() {
  return <SiteShell>
    <main>
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "StayNas",
        description: "A hospitality operating system connecting reservations, guest experience, property operations, finance and hospitality intelligence.",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://staynas.com",
        provider: { "@type": "Organization", name: "Nolmark CDMA", url: "https://nolmark.co" },
      })}</script>
      <section className="relative overflow-hidden bg-[#3A4A3F] text-white">
        <div className="absolute inset-0 opacity-30" style={{backgroundImage:"radial-gradient(ellipse at 78% 18%, rgba(199,169,107,.42), transparent 34%), radial-gradient(ellipse at 12% 90%, rgba(65,116,83,.5), transparent 40%)"}}/>
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-28">
          <div>
            <Eyebrow>Hospitality Operating System</Eyebrow>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[4.5rem]">Every stay.<br/><span className="text-[#AE8F60]">Every operation.</span><br/>One intelligent system.</h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-white/65 sm:text-lg">StayNas connects reservations, guest experience, property operations, financial control and hospitality intelligence in one operating environment.</p>
            <div className="mt-9 flex flex-wrap gap-3"><Link to="/platform" className="inline-flex items-center gap-2 rounded-full bg-[#AE8F60] px-6 py-4 text-sm font-semibold text-[#2A2725] transition hover:bg-[#91A673]">Explore the platform <ArrowRight className="h-4 w-4"/></Link><Link to="/request-demo" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/10">Request a demonstration</Link><Link to="/product-tour" className="inline-flex items-center gap-2 px-3 py-4 text-sm font-semibold text-white/75 hover:text-white">Take the product walkthrough <ArrowRight className="h-4 w-4"/></Link></div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#AE8F60]"/> Property-aware architecture</span><span className="flex items-center gap-2"><Network className="h-4 w-4 text-[#AE8F60]"/> Connected workflows</span></div>
          </div>
          <div className="relative">
            <div className="rounded-[28px] border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-sm sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs uppercase tracking-[0.2em] text-white/45">The connected property</p><p className="mt-1 text-lg font-semibold">One operating environment</p></div><span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] text-emerald-200">Platform overview</span></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {STAYNAS_PILLARS.map((pillar)=><div key={pillar.name} className="rounded-2xl border border-white/10 bg-[#3A4A3F] p-5"><p className="text-sm font-semibold">{pillar.name}</p><p className="mt-2 text-xs leading-5 text-white/45">{pillar.description}</p></div>)}
              </div>
              <div className="mt-4 rounded-2xl border border-[#AE8F60]/25 bg-[#AE8F60]/10 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#EAE2D3]"><Sparkles className="h-4 w-4"/> Intelligence across the operation</div><p className="mt-2 text-xs leading-5 text-white/55">A connected view of the guest journey, property activity and management decisions.</p></div>
              <p className="mt-4 text-[10px] text-white/35">Conceptual platform overview · Not a live operational dashboard</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
        <div className="max-w-2xl"><Eyebrow>One connected platform</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">The systems behind a better-run property.</h2><p className="mt-5 text-base leading-7 text-[#3A4A3F]">Hospitality teams should not have to coordinate their entire operation across disconnected tools. StayNas brings the core work of running a property into one environment.</p></div>
        <div className="mt-10 grid gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">{STAYNAS_PILLARS.map((pillar)=><div key={pillar.name} className="site-editorial-item p-7"><h3 className="text-lg font-semibold">{pillar.name}</h3><p className="mt-2 text-sm leading-6 text-[#3A4A3F]">{pillar.description}</p></div>)}</div>
        <div className="mt-8"><Link to="/platform" className="inline-flex items-center gap-2 text-sm font-semibold text-[#3A4A3F]">Explore platform capabilities <ArrowRight className="h-4 w-4"/></Link></div>
      </section>
      <section className="bg-[#EAE2D3]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:px-10">
          <div><Eyebrow>From first enquiry to departure</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A guest journey that connects to the operation.</h2><p className="mt-5 text-base leading-7 text-[#3A4A3F]">A reservation is not an isolated transaction. It creates work across reception, rooms, housekeeping, guest communication and finance. StayNas is designed to connect those steps.</p><Link to="/platform" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#3A4A3F]">See how the platform works <ArrowRight className="h-4 w-4"/></Link></div>
          <div className="space-y-3">{[{t:"Discover & book",d:"Direct booking and reservation capture."},{t:"Prepare for arrival",d:"Guest details and online check-in."},{t:"Welcome & operate",d:"Reception, room readiness and service coordination."},{t:"Manage & improve",d:"Financial visibility, guest context and operational intelligence."}].map(step=><div key={step.t} className="flex gap-4 border-b border-[#EAE2D3] py-7"><div><h3 className="font-semibold">{step.t}</h3><p className="mt-1 text-sm text-[#3A4A3F]">{step.d}</p></div></div>)}</div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="max-w-2xl"><Eyebrow>Built for hospitality teams</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A clearer way to run hospitality.</h2><p className="mt-4 text-base leading-7 text-[#3A4A3F]">For independent properties, lodges, resorts and multi-property operators.</p></div><Link to="/solutions" className="inline-flex items-center gap-2 text-sm font-semibold text-[#3A4A3F]">Explore solutions <ArrowRight className="h-4 w-4"/></Link></div>
        <div className="mt-10 grid gap-x-8 gap-y-0 md:grid-cols-3">{[{icon:House,title:"Independent properties",desc:"Connect reservations, front desk, housekeeping and guest relationships."},{icon:Building2,title:"Lodges & resorts",desc:"Coordinate guest journeys and property operations around the character of each stay."},{icon:Layers3,title:"Hospitality groups",desc:"Build a foundation for property-level operations and broader management visibility."}].map(item=><article key={item.title} className="site-editorial-item p-6"><item.icon className="h-6 w-6 text-[#AE8F60]"/><h3 className="mt-5 text-lg font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[#3A4A3F]">{item.desc}</p></article>)}</div>
      </section>
      <StayNasModulePreview/>
      <section className="bg-[#3A4A3F] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div className="max-w-2xl"><Eyebrow>See StayNas in context</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Explore what one connected operating system can do.</h2><p className="mt-4 text-sm leading-7 text-white/60">Arrange a product walkthrough focused on your property type, operating model and priorities.</p></div><Link to="/request-demo" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#AE8F60] px-7 py-4 text-sm font-semibold text-[#2A2725]">Request a demo <ArrowRight className="h-4 w-4"/></Link></div></section>
    </main>
  </SiteShell>;
}

export function ProductInfoPage({ page }: { page: "platform" | "solutions" | "integrations" | "demo" }) {
  if (page === "platform") return <SiteShell><main>
    <section className="bg-[#3A4A3F] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Platform capabilities</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">The operating system behind every part of the stay.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">Explore the capabilities StayNas brings together. Availability and activation can vary by property configuration, deployment and connected provider.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24"><ScrollEmphasis><div className="mb-12 max-w-2xl"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#AE8F60]">A connected operating environment</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Every capability works toward a smoother stay.</h2><p className="mt-5 text-base leading-8 text-[#3A4A3F]">Explore the capabilities that bring the guest journey and property operation together. Open any capability to see what it brings into the day-to-day workflow.</p></div></ScrollEmphasis><div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">{[...STAYNAS_PUBLIC_CAPABILITIES].sort((a,b)=>["ai-concierge","reservations","front-desk","property","guest","housekeeping","finance","automation","payments","multi-property","distribution","ecosystem"].indexOf(a.id)-["ai-concierge","reservations","front-desk","property","guest","housekeeping","finance","automation","payments","multi-property","distribution","ecosystem"].indexOf(b.id)).map((item,index)=><CapabilityCard key={item.id} item={item} index={index}/>)}</div></section>
    <section className="bg-[#EAE2D3]"><div className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="max-w-2xl"><Eyebrow>One operating model</Eyebrow><h2 className="mt-4 text-3xl font-semibold">Six connected pillars.</h2></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{STAYNAS_PILLARS.map(p=><div key={p.name} className="site-editorial-item p-5"><h3 className="font-semibold">{p.name}</h3><p className="mt-2 text-sm leading-6 text-[#3A4A3F]">{p.description}</p></div>)}</div></div></section>
    <CallToAction/>
  </main></SiteShell>;

  if (page === "solutions") return <SiteShell><main>
    <section className="bg-[#3A4A3F] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Solutions by operating model</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Designed around the realities of hospitality.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas provides a connected operating foundation for different property types and management structures.</p></div></section>
    <section className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-2 lg:px-10">{[{title:"Hotels & boutique properties",desc:"Bring reservations, front desk, guest profiles, housekeeping and financial visibility into one daily operating environment.",features:["Reservation and room workflows","Digital guest check-in","Housekeeping coordination","Guest relationship context"]},{title:"Lodges & safari camps",desc:"Coordinate distinctive guest journeys with room readiness, pre-arrival information and property-aware guest assistance.",features:["Pre-arrival guest journey","Property knowledge and concierge","Room and housekeeping operations","Management visibility"]},{title:"Resorts & retreats",desc:"Connect accommodation operations with guest services and a consistent view of the stay.",features:["Guest profiles and service context","Front desk and room operations","Operational tasks and exceptions","Revenue visibility"]},{title:"Multi-property operators",desc:"Establish property-level operating environments within a wider organisational structure.",features:["Property-scoped configuration","Role-aware access","Group management direction","Cross-property intelligence direction"]}].map(s=><article key={s.title} className="site-editorial-item p-7"><h2 className="text-xl font-semibold">{s.title}</h2><p className="mt-3 text-sm leading-7 text-[#3A4A3F]">{s.desc}</p><ul className="mt-5 space-y-3">{s.features.map(f=><li key={f} className="flex items-start gap-2 text-sm text-[#3A4A3F]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#91A673]"/>{f}</li>)}</ul></article>)}</section>
    <CallToAction/>
  </main></SiteShell>;

  if (page === "integrations") return <SiteShell><main>
    <section className="bg-[#3A4A3F] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Connected hospitality ecosystem</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Connect the systems around your property.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas is designed to operate as the central property context while connecting specialist services through explicit integrations.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="grid gap-x-8 gap-y-0 md:grid-cols-2">{[{name:"Public Booking Network & channel distribution",kind:"Distribution",state:"Channel-specific connector implementation and verification required",desc:"A distribution layer for connecting external demand channels to property availability and reservation workflows. OTA and channel-manager connectivity is not claimed as universally live."},{name:"Payment providers",kind:"Payments",state:"Provider activation is deployment and tenant-configuration dependent",desc:"Property-configured payment services, including payment lifecycle handling and reconciliation. Availability depends on the selected provider and deployment."},{name:"Property websites & direct booking",kind:"Guest acquisition",state:"Direct booking foundation present; property publication is controlled",desc:"Guest-facing property pages and booking journeys connected to StayNas property configuration and availability."},{name:"Guest CRM & engagement",kind:"Guest data",state:"StayNas guest CRM implemented; external CRM connectors are integration-dependent",desc:"Guest profiles, stay context and service workflows inside StayNas, with external CRM connections subject to connector-specific delivery."},{name:"Email, SMS & WhatsApp",kind:"Communications",state:"Provider and channel configuration dependent",desc:"Guest communications around enquiries, pre-arrival information and the stay lifecycle. Each channel requires provider credentials, consent and operational verification."},{name:"Accounting & external finance",kind:"Finance",state:"Connector roadmap; no native accounting sync claimed",desc:"Potential connections to accounting and finance platforms through explicit ledger, settlement and reconciliation contracts."},{name:"LexiBite & food service",kind:"Food & beverage",state:"Ecosystem integration direction",desc:"A potential connection to the specialist LexiBite FnB operating system while preserving LexiBite as an independent product."},{name:"External APIs & analytics",kind:"Extensibility",state:"Integration-specific",desc:"Connect additional systems, reporting tools and data services through defined contracts, authentication, event handling and property-scoped data boundaries."}].map(x=><article key={x.name} className="site-editorial-item p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#AE8F60]">{x.kind}</p><h2 className="mt-2 text-xl font-semibold">{x.name}</h2></div><Globe2 className="h-5 w-5 text-[#AE8F60]"/></div><p className="mt-3 text-sm leading-7 text-[#3A4A3F]">{x.desc}</p><p className="mt-5 border-t border-[#EAE2D3] pt-4 text-xs font-medium text-[#3A4A3F]">{x.state}</p></article>)}</div><div className="mt-10 rounded-2xl bg-[#EAE2D3] p-7"><h2 className="text-lg font-semibold">Integration governance matters.</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-[#3A4A3F]">Each connection should define its data contract, property scope, authentication, event handling, error recovery and reconciliation responsibilities. A connector is only described as available after its implementation and operational verification are complete.</p></div></section>
    <CallToAction/>
  </main></SiteShell>;

  return <SiteShell><main>
    <section className="bg-[#3A4A3F] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Product demonstration</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">See how StayNas fits your operation.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">A product walkthrough should reflect your property type, team structure, guest journey and integration priorities.</p></div></section>
    <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1fr_.85fr] lg:px-10"><div><Eyebrow>What we can walk through</Eyebrow><h2 className="mt-4 text-3xl font-semibold">A demonstration built around your operating priorities.</h2><div className="mt-8 space-y-5">{[{t:"Reservations to arrival",d:"Explore the connection between booking, guest details, online check-in and reception."},{t:"Daily property operations",d:"See how rooms, housekeeping tasks, inspections and exceptions fit together."},{t:"Management visibility",d:"Review operational, guest and revenue information available to property leaders."},{t:"Your integration landscape",d:"Discuss payment providers, booking distribution, websites and specialist systems."}].map(x=><div key={x.t} className="flex gap-4"><span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAE2D3] text-[#3A4A3F]"><Check className="h-4 w-4"/></span><div><h3 className="font-semibold">{x.t}</h3><p className="mt-1 text-sm leading-6 text-[#3A4A3F]">{x.d}</p></div></div>)}</div></div><StayNasDemoRequestForm/></section>
  </main></SiteShell>;
}

function CallToAction() {
  return <section className="bg-[#3A4A3F] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#AE8F60]">See StayNas in context</p><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Explore a more connected way to operate.</h2></div><Link to="/request-demo" className="inline-flex items-center gap-2 self-start rounded-full bg-[#AE8F60] px-6 py-3.5 text-sm font-semibold text-[#2A2725]">Request a demo <ArrowRight className="h-4 w-4"/></Link></div></section>;
}
