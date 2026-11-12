import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { trackGAEvent, trackPageView } from "@/lib/analytics";
import { ArrowRight, ArrowUpRight, BedDouble, Building2, CalendarCheck, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, CircleDot, CreditCard, ExternalLink, Globe2, House, Layers3, Menu, Network, ShieldCheck, Sparkles, Users, Workflow, Wrench, X } from "lucide-react";
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

export function ProductSiteHeader() {
  const [open, setOpen] = useState(false);
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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0c211b]/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link to="/" onClick={closeMenu} className="flex items-center gap-3" aria-label="StayNas home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c7a96b] text-lg font-semibold text-[#10251e]">S</span>
          <span className="text-lg font-semibold tracking-[0.12em]">STAYNAS</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">
          {links.map((item) => <Link key={item.to} to={item.to} className="text-sm text-white/70 transition hover:text-white">{item.label}</Link>)}
          <Link to="/solutions" className="text-sm text-white/70 transition hover:text-white">Solutions</Link>
          <Link to="/pricing" className="text-sm text-white/70 transition hover:text-white">Pricing</Link>
          <a href="https://nolmark.co" target="_blank" rel="noreferrer" className="text-sm text-white/70 transition hover:text-white">Company <ExternalLink className="ml-1 inline h-3 w-3"/></a>
          <Link to="/request-demo" className="inline-flex items-center gap-2 rounded-full bg-[#d7bd85] px-5 py-3 text-sm font-semibold text-[#14271f] transition hover:bg-[#e5d0a4]">Book a Demo <ArrowUpRight className="h-4 w-4"/></Link>
        </nav>
        <button type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="staynas-mobile-navigation" onClick={() => setOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 lg:hidden">
          <Menu className="h-5 w-5"/>
        </button>
      </div>

      {open && <div className="fixed inset-0 z-[100] lg:hidden">
        <button type="button" aria-label="Close navigation overlay" onClick={closeMenu} className="absolute inset-0 h-full w-full cursor-default bg-[#071710]/55 backdrop-blur-[2px]"/>
        <aside id="staynas-mobile-navigation" role="dialog" aria-modal="true" aria-label="StayNas navigation" onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 flex h-[100dvh] w-[min(100%,440px)] flex-col overflow-hidden bg-[#f6f5ef] text-[#15251f] shadow-2xl">
          <div className="flex min-h-[88px] items-center justify-between border-b border-[#deded4] px-6 sm:px-8">
            {activeMenu === "platform" ? <>
              <div className="flex min-w-0 items-center gap-4">
                <button type="button" aria-label="Back to main navigation" onClick={() => setActiveMenu("root")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#29242c] transition hover:bg-[#e9ede6]"><ChevronRight className="h-6 w-6 rotate-180"/></button>
                <span className="text-[22px] font-medium text-[#25232a]">Platform</span>
              </div>
              <button type="button" aria-label="Close navigation menu" onClick={closeMenu} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#29242c] transition hover:bg-[#e9ede6]"><X className="h-7 w-7"/></button>
            </> : <>
              <Link to="/" onClick={closeMenu} className="flex min-w-0 items-center gap-3" aria-label="StayNas home">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c7a96b] text-lg font-semibold text-[#10251e]">S</span>
                <span className="truncate text-[17px] font-semibold tracking-[0.1em] text-[#25232a]">STAYNAS <span className="font-normal tracking-normal text-[#8b8278]">Hospitality OS</span></span>
              </Link>
              <button type="button" aria-label="Close navigation menu" onClick={closeMenu} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#29242c] transition hover:bg-[#e9ede6]"><X className="h-7 w-7"/></button>
            </>}
          </div>

          <nav aria-label="Mobile navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 pt-3 sm:px-8">
            {activeMenu === "platform" ? <>
              <Link to="/platform" onClick={closeMenu} className="flex min-h-[112px] items-center border-b border-[#e8e1d5] text-[25px] font-medium text-[#25232a] transition hover:text-[#315744]">Overview</Link>
              {platformSections.map(section => <section key={section.heading} className="border-b border-[#e8e1d5] py-7">
                <h3 className="mb-5 text-[17px] font-medium text-[#8d8580]">{section.heading}</h3>
                <div className="space-y-1">{section.items.map(item => <a key={item.label} href={item.to} onClick={closeMenu} className="flex min-h-[58px] items-center py-3 text-[21px] font-normal tracking-tight text-[#25232a] transition-colors hover:text-[#315744]">{item.label}</a>)}</div>
              </section>)}
              <Link to="/architecture" onClick={closeMenu} className="flex min-h-[76px] items-center border-b border-[#e8e1d5] text-[20px] text-[#25232a]">Architecture</Link>
            </> : <>
              <button type="button" onClick={() => setActiveMenu("platform")} className="flex min-h-[76px] w-full items-center justify-between border-b border-[#e8e1d5] text-left text-[22px] font-medium text-[#25232a] transition hover:text-[#315744]">Platform<ChevronRight className="h-6 w-6"/></button>
              {groups.map(group => {
                const isExpanded = expanded === group.label;
                return <section key={group.label} className="border-b border-[#e8e1d5]">
                  <button type="button" aria-expanded={isExpanded} onClick={() => setExpanded(current => current === group.label ? null : group.label)} className={"flex min-h-[76px] w-full items-center justify-between text-left text-[22px] font-medium transition-colors " + (isExpanded ? "text-[#315744]" : "text-[#25232a] hover:text-[#a88a52]")}>{group.label}{isExpanded ? <ChevronDown className="h-6 w-6"/> : <ChevronRight className="h-6 w-6"/>}</button>
                  {isExpanded && <div className="space-y-1 pb-5 pl-1">{group.items.map(item => <Link key={item.to} to={item.to} onClick={closeMenu} className="flex items-center justify-between rounded-lg px-3 py-3 text-base text-[#625d61] transition hover:bg-[#e9ede6] hover:text-[#315744]">{item.label}<ArrowUpRight className="h-4 w-4 opacity-60"/></Link>)}</div>}
                </section>;
              })}
              <Link to="/pricing" onClick={closeMenu} className="flex min-h-[76px] items-center justify-between border-b border-[#e8e1d5] text-[22px] font-medium text-[#25232a] transition hover:text-[#c65a36]">Pricing<ArrowUpRight className="h-5 w-5"/></Link>
              <Link to="/admin" onClick={closeMenu} className="mt-6 flex min-h-[54px] items-center justify-center rounded-full border border-[#8f877d] px-6 text-base font-medium text-[#37323a] transition hover:bg-[#f3eee4]">Login</Link>
            </>}
          </nav>

          <div className="shrink-0 border-t border-[#e8e1d5] bg-[#f6f5ef] px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 sm:px-8">
            <Link to="/request-demo" onClick={closeMenu} className="flex min-h-[58px] w-full items-center justify-center rounded-full bg-[#c7a96b] px-6 text-base font-semibold text-[#10251e] shadow-sm transition hover:bg-[#d7bd85]">Book a Demo</Link>
          </div>
        </aside>
      </div>}
    <style>{`
      .staynas-public-site main article[class*="rounded-2xl"],
      .staynas-public-site main article[class*="rounded-3xl"] {
        border: 0 !important;
        border-bottom: 1px solid #deded4 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      .staynas-public-site main article[class*="rounded-2xl"]:last-child,
      .staynas-public-site main article[class*="rounded-3xl"]:last-child {
        border-bottom: 0 !important;
      }
      .staynas-public-site main .site-editorial-item {
        border-bottom: 1px solid #deded4;
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
      .capability-reveal:hover { border-color: #c7a96b; }
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
  return (
    <footer className="bg-[#091914] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr] lg:px-10">
        <div>
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c7a96b] font-semibold text-[#10251e]">S</span><span className="font-semibold tracking-[0.16em]">STAYNAS</span></div>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/55">A connected Hospitality Operating System for reservations, guest experience, property operations, financial control and intelligence.</p>
          <p className="mt-5 text-xs text-white/40">A hospitality technology product by Nolmark CDMA.</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Explore</p>
          <div className="mt-5 flex flex-col gap-3 text-sm text-white/70"><Link to="/platform">Platform</Link><Link to="/modules">Modules</Link><Link to="/product-tour">Product walkthrough</Link><Link to="/solutions">Solutions</Link><Link to="/integrations">Integrations</Link><Link to="/pricing">Plans & pricing</Link><Link to="/request-demo">Request a demo</Link></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Company</p>
          <div className="mt-5 flex flex-col gap-3 text-sm text-white/70"><Link to="/architecture">Architecture</Link><Link to="/security">Trust & security</Link><a href="https://nolmark.co" target="_blank" rel="noreferrer">Nolmark CDMA</a></div>
        </div>
      </div>
      <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between lg:px-10"><span>© {new Date().getFullYear()} StayNas. All rights reserved.</span><span>Hospitality Operating System · staynas.com</span></div></div>
    </footer>
  );
}

function SiteShell({ children }: { children: ReactNode }) {
  return <div className="staynas-public-site min-h-screen bg-[#f6f5ef] text-[#15251f]"><ProductSiteHeader/><StayNasAnalytics/>{children}<ProductSiteFooter/></div>;
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
  return <aside aria-label="Analytics preferences" className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-[#d8ddd5] bg-white p-5 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
    <div><p className="text-sm font-semibold text-[#15251f]">Help improve StayNas</p><p className="mt-1 text-xs leading-5 text-[#69756e]">With your permission, we use analytics to understand website visits and demo interest. Form details and personal contact information are not sent to analytics.</p></div>
    <div className="flex shrink-0 gap-2"><button type="button" onClick={() => choose(false)} className="rounded-full border border-[#d8ddd5] px-4 py-2.5 text-xs font-semibold text-[#526057]">Essential only</button><button type="button" onClick={() => choose(true)} className="rounded-full bg-[#173d2d] px-4 py-2.5 text-xs font-semibold text-white">Allow analytics</button></div>
  </aside>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#967747]">{children}</p>;
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
        <div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9ede6] text-[#315744] transition duration-300 group-hover:-translate-y-1 group-hover:bg-[#d7bd85]"><Icon className="h-5 w-5"/></span><span className="mt-2 text-xs font-medium text-[#9a835b] transition group-hover:text-[#315744]">{expanded ? "Close details −" : "Explore capability +"}</span></div>
        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a835b]">{item.pillar}</p>
        <h3 className="mt-3 text-lg font-semibold tracking-tight transition-colors duration-300 group-hover:text-[#315744]">{item.name}</h3>
        <p className="mt-3 text-sm leading-7 text-[#68746d]">{item.summary}</p>
      </button>
      {expanded && <div className="mt-5 rounded-2xl bg-[#e9ede6] p-5 motion-safe:animate-[fadeIn_.25s_ease-out]">
        <p className="text-xs font-semibold text-[#315744]">Inside this capability</p>
        <ul className="mt-3 space-y-2.5">{item.details.map(detail => <li key={detail} className="flex gap-2 text-sm leading-6 text-[#526057]"><Check className="mt-1 h-4 w-4 shrink-0 text-[#53765c]"/>{detail}</li>)}</ul>
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
      <section className="relative overflow-hidden bg-[#0c211b] text-white">
        <div className="absolute inset-0 opacity-30" style={{backgroundImage:"radial-gradient(ellipse at 78% 18%, rgba(199,169,107,.42), transparent 34%), radial-gradient(ellipse at 12% 90%, rgba(65,116,83,.5), transparent 40%)"}}/>
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-28">
          <div>
            <Eyebrow>Hospitality Operating System</Eyebrow>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[4.5rem]">Every stay.<br/><span className="text-[#d7bd85]">Every operation.</span><br/>One intelligent system.</h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-white/65 sm:text-lg">StayNas connects reservations, guest experience, property operations, financial control and hospitality intelligence in one operating environment.</p>
            <div className="mt-9 flex flex-wrap gap-3"><Link to="/platform" className="inline-flex items-center gap-2 rounded-full bg-[#d7bd85] px-6 py-4 text-sm font-semibold text-[#14271f] transition hover:bg-[#e5d0a4]">Explore the platform <ArrowRight className="h-4 w-4"/></Link><Link to="/request-demo" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-4 text-sm font-semibold text-white transition hover:bg-white/10">Request a demonstration</Link><Link to="/product-tour" className="inline-flex items-center gap-2 px-3 py-4 text-sm font-semibold text-white/75 hover:text-white">Take the product walkthrough <ArrowRight className="h-4 w-4"/></Link></div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#d7bd85]"/> Property-aware architecture</span><span className="flex items-center gap-2"><Network className="h-4 w-4 text-[#d7bd85]"/> Connected workflows</span></div>
          </div>
          <div className="relative">
            <div className="rounded-[28px] border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-sm sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs uppercase tracking-[0.2em] text-white/45">The connected property</p><p className="mt-1 text-lg font-semibold">One operating environment</p></div><span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] text-emerald-200">Platform overview</span></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {STAYNAS_PILLARS.map((pillar)=><div key={pillar.name} className="rounded-2xl border border-white/10 bg-[#102c23] p-5"><p className="text-sm font-semibold">{pillar.name}</p><p className="mt-2 text-xs leading-5 text-white/45">{pillar.description}</p></div>)}
              </div>
              <div className="mt-4 rounded-2xl border border-[#d7bd85]/25 bg-[#d7bd85]/10 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#ead8b3]"><Sparkles className="h-4 w-4"/> Intelligence across the operation</div><p className="mt-2 text-xs leading-5 text-white/55">A connected view of the guest journey, property activity and management decisions.</p></div>
              <p className="mt-4 text-[10px] text-white/35">Conceptual platform overview · Not a live operational dashboard</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
        <div className="max-w-2xl"><Eyebrow>One connected platform</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">The systems behind a better-run property.</h2><p className="mt-5 text-base leading-7 text-[#69756e]">Hospitality teams should not have to coordinate their entire operation across disconnected tools. StayNas brings the core work of running a property into one environment.</p></div>
        <div className="mt-10 grid gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">{STAYNAS_PILLARS.map((pillar)=><div key={pillar.name} className="site-editorial-item p-7"><h3 className="text-lg font-semibold">{pillar.name}</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">{pillar.description}</p></div>)}</div>
        <div className="mt-8"><Link to="/platform" className="inline-flex items-center gap-2 text-sm font-semibold text-[#315744]">Explore platform capabilities <ArrowRight className="h-4 w-4"/></Link></div>
      </section>
      <section className="bg-[#e9ede6]">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:px-10">
          <div><Eyebrow>From first enquiry to departure</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A guest journey that connects to the operation.</h2><p className="mt-5 text-base leading-7 text-[#647169]">A reservation is not an isolated transaction. It creates work across reception, rooms, housekeeping, guest communication and finance. StayNas is designed to connect those steps.</p><Link to="/platform" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#315744]">See how the platform works <ArrowRight className="h-4 w-4"/></Link></div>
          <div className="space-y-3">{[{t:"Discover & book",d:"Direct booking and reservation capture."},{t:"Prepare for arrival",d:"Guest details and online check-in."},{t:"Welcome & operate",d:"Reception, room readiness and service coordination."},{t:"Manage & improve",d:"Financial visibility, guest context and operational intelligence."}].map(step=><div key={step.t} className="flex gap-4 border-b border-[#d4dbd1] py-7"><div><h3 className="font-semibold">{step.t}</h3><p className="mt-1 text-sm text-[#69756e]">{step.d}</p></div></div>)}</div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div className="max-w-2xl"><Eyebrow>Built for hospitality teams</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A clearer way to run hospitality.</h2><p className="mt-4 text-base leading-7 text-[#69756e]">For independent properties, lodges, resorts and multi-property operators.</p></div><Link to="/solutions" className="inline-flex items-center gap-2 text-sm font-semibold text-[#315744]">Explore solutions <ArrowRight className="h-4 w-4"/></Link></div>
        <div className="mt-10 grid gap-x-8 gap-y-0 md:grid-cols-3">{[{icon:House,title:"Independent properties",desc:"Connect reservations, front desk, housekeeping and guest relationships."},{icon:Building2,title:"Lodges & resorts",desc:"Coordinate guest journeys and property operations around the character of each stay."},{icon:Layers3,title:"Hospitality groups",desc:"Build a foundation for property-level operations and broader management visibility."}].map(item=><article key={item.title} className="site-editorial-item p-6"><item.icon className="h-6 w-6 text-[#a1844f]"/><h3 className="mt-5 text-lg font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">{item.desc}</p></article>)}</div>
      </section>
      <StayNasModulePreview/>
      <section className="bg-[#10271f] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div className="max-w-2xl"><Eyebrow>See StayNas in context</Eyebrow><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Explore what one connected operating system can do.</h2><p className="mt-4 text-sm leading-7 text-white/60">Arrange a product walkthrough focused on your property type, operating model and priorities.</p></div><Link to="/request-demo" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#d7bd85] px-7 py-4 text-sm font-semibold text-[#14271f]">Request a demo <ArrowRight className="h-4 w-4"/></Link></div></section>
    </main>
  </SiteShell>;
}

export function ProductInfoPage({ page }: { page: "platform" | "solutions" | "integrations" | "demo" }) {
  if (page === "platform") return <SiteShell><main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Platform capabilities</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">The operating system behind every part of the stay.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">Explore the capabilities StayNas brings together. Availability and activation can vary by property configuration, deployment and connected provider.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24"><ScrollEmphasis><div className="mb-12 max-w-2xl"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9a835b]">A connected operating environment</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Every capability works toward a smoother stay.</h2><p className="mt-5 text-base leading-8 text-[#69756e]">Explore the capabilities that bring the guest journey and property operation together. Open any capability to see what it brings into the day-to-day workflow.</p></div></ScrollEmphasis><div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">{[...STAYNAS_PUBLIC_CAPABILITIES].sort((a,b)=>["ai-concierge","reservations","front-desk","property","guest","housekeeping","finance","automation","payments","multi-property","distribution","ecosystem"].indexOf(a.id)-["ai-concierge","reservations","front-desk","property","guest","housekeeping","finance","automation","payments","multi-property","distribution","ecosystem"].indexOf(b.id)).map((item,index)=><CapabilityCard key={item.id} item={item} index={index}/>)}</div></section>
    <section className="bg-[#e9ede6]"><div className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="max-w-2xl"><Eyebrow>One operating model</Eyebrow><h2 className="mt-4 text-3xl font-semibold">Six connected pillars.</h2></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{STAYNAS_PILLARS.map(p=><div key={p.name} className="site-editorial-item p-5"><h3 className="font-semibold">{p.name}</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">{p.description}</p></div>)}</div></div></section>
    <CallToAction/>
  </main></SiteShell>;

  if (page === "solutions") return <SiteShell><main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Solutions by operating model</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Designed around the realities of hospitality.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas provides a connected operating foundation for different property types and management structures.</p></div></section>
    <section className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-2 lg:px-10">{[{title:"Hotels & boutique properties",desc:"Bring reservations, front desk, guest profiles, housekeeping and financial visibility into one daily operating environment.",features:["Reservation and room workflows","Digital guest check-in","Housekeeping coordination","Guest relationship context"]},{title:"Lodges & safari camps",desc:"Coordinate distinctive guest journeys with room readiness, pre-arrival information and property-aware guest assistance.",features:["Pre-arrival guest journey","Property knowledge and concierge","Room and housekeeping operations","Management visibility"]},{title:"Resorts & retreats",desc:"Connect accommodation operations with guest services and a consistent view of the stay.",features:["Guest profiles and service context","Front desk and room operations","Operational tasks and exceptions","Revenue visibility"]},{title:"Multi-property operators",desc:"Establish property-level operating environments within a wider organisational structure.",features:["Property-scoped configuration","Role-aware access","Group management direction","Cross-property intelligence direction"]}].map(s=><article key={s.title} className="site-editorial-item p-7"><h2 className="text-xl font-semibold">{s.title}</h2><p className="mt-3 text-sm leading-7 text-[#69756e]">{s.desc}</p><ul className="mt-5 space-y-3">{s.features.map(f=><li key={f} className="flex items-start gap-2 text-sm text-[#46554c]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#53765c]"/>{f}</li>)}</ul></article>)}</section>
    <CallToAction/>
  </main></SiteShell>;

  if (page === "integrations") return <SiteShell><main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Connected hospitality ecosystem</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Connect the systems around your property.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas is designed to operate as the central property context while connecting specialist services through explicit integrations.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="grid gap-x-8 gap-y-0 md:grid-cols-2">{[{name:"Public Booking Network & channel distribution",kind:"Distribution",state:"Channel-specific connector implementation and verification required",desc:"A distribution layer for connecting external demand channels to property availability and reservation workflows. OTA and channel-manager connectivity is not claimed as universally live."},{name:"Payment providers",kind:"Payments",state:"Provider activation is deployment and tenant-configuration dependent",desc:"Property-configured payment services, including payment lifecycle handling and reconciliation. Availability depends on the selected provider and deployment."},{name:"Property websites & direct booking",kind:"Guest acquisition",state:"Direct booking foundation present; property publication is controlled",desc:"Guest-facing property pages and booking journeys connected to StayNas property configuration and availability."},{name:"Guest CRM & engagement",kind:"Guest data",state:"StayNas guest CRM implemented; external CRM connectors are integration-dependent",desc:"Guest profiles, stay context and service workflows inside StayNas, with external CRM connections subject to connector-specific delivery."},{name:"Email, SMS & WhatsApp",kind:"Communications",state:"Provider and channel configuration dependent",desc:"Guest communications around enquiries, pre-arrival information and the stay lifecycle. Each channel requires provider credentials, consent and operational verification."},{name:"Accounting & external finance",kind:"Finance",state:"Connector roadmap; no native accounting sync claimed",desc:"Potential connections to accounting and finance platforms through explicit ledger, settlement and reconciliation contracts."},{name:"LexiBite & food service",kind:"Food & beverage",state:"Ecosystem integration direction",desc:"A potential connection to the specialist LexiBite FnB operating system while preserving LexiBite as an independent product."},{name:"External APIs & analytics",kind:"Extensibility",state:"Integration-specific",desc:"Connect additional systems, reporting tools and data services through defined contracts, authentication, event handling and property-scoped data boundaries."}].map(x=><article key={x.name} className="site-editorial-item p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a835b]">{x.kind}</p><h2 className="mt-2 text-xl font-semibold">{x.name}</h2></div><Globe2 className="h-5 w-5 text-[#a1844f]"/></div><p className="mt-3 text-sm leading-7 text-[#69756e]">{x.desc}</p><p className="mt-5 border-t border-[#ecece5] pt-4 text-xs font-medium text-[#52665a]">{x.state}</p></article>)}</div><div className="mt-10 rounded-2xl bg-[#e9ede6] p-7"><h2 className="text-lg font-semibold">Integration governance matters.</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-[#69756e]">Each connection should define its data contract, property scope, authentication, event handling, error recovery and reconciliation responsibilities. A connector is only described as available after its implementation and operational verification are complete.</p></div></section>
    <CallToAction/>
  </main></SiteShell>;

  return <SiteShell><main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><Eyebrow>Product demonstration</Eyebrow><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">See how StayNas fits your operation.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">A product walkthrough should reflect your property type, team structure, guest journey and integration priorities.</p></div></section>
    <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1fr_.85fr] lg:px-10"><div><Eyebrow>What we can walk through</Eyebrow><h2 className="mt-4 text-3xl font-semibold">A demonstration built around your operating priorities.</h2><div className="mt-8 space-y-5">{[{t:"Reservations to arrival",d:"Explore the connection between booking, guest details, online check-in and reception."},{t:"Daily property operations",d:"See how rooms, housekeeping tasks, inspections and exceptions fit together."},{t:"Management visibility",d:"Review operational, guest and revenue information available to property leaders."},{t:"Your integration landscape",d:"Discuss payment providers, booking distribution, websites and specialist systems."}].map(x=><div key={x.t} className="flex gap-4"><span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8ede6] text-[#42634d]"><Check className="h-4 w-4"/></span><div><h3 className="font-semibold">{x.t}</h3><p className="mt-1 text-sm leading-6 text-[#69756e]">{x.d}</p></div></div>)}</div></div><StayNasDemoRequestForm/></section>
  </main></SiteShell>;
}

function CallToAction() {
  return <section className="bg-[#10271f] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7bd85]">See StayNas in context</p><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Explore a more connected way to operate.</h2></div><Link to="/request-demo" className="inline-flex items-center gap-2 self-start rounded-full bg-[#d7bd85] px-6 py-3.5 text-sm font-semibold text-[#14271f]">Request a demo <ArrowRight className="h-4 w-4"/></Link></div></section>;
}
