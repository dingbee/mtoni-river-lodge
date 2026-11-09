import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, BedDouble, Building2, CalendarCheck, ChartNoAxesCombined, Check, ChevronRight, CircleDollarSign, ClipboardCheck, CreditCard, House, Layers3, LockKeyhole, Network, ShieldCheck, Sparkles, Users, Workflow } from "lucide-react";

const modules = [
  { name: "Reservations", group: "Commercial", icon: CalendarCheck, description: "Manage enquiries, availability, booking records, reservation changes and the guest booking lifecycle.", outcomes: ["Availability and booking workflows", "Reservation status and amendments", "Guest and property context"] },
  { name: "Rooms & inventory", group: "Property operations", icon: BedDouble, description: "Maintain room categories, room inventory, allocation and live room status for the property.", outcomes: ["Room and category configuration", "Room readiness and allocation", "Guest-facing accommodation catalogue"] },
  { name: "Front desk", group: "Guest experience", icon: House, description: "Give reception a connected workspace for arrivals, departures, guest requests and daily service.", outcomes: ["Arrival and departure workflows", "Digital check-in and arrival passes", "Reservation and guest lookup"] },
  { name: "Housekeeping", group: "Property operations", icon: ClipboardCheck, description: "Coordinate room cleaning, inspections, task ownership and readiness exceptions.", outcomes: ["Task queues and assignment", "Inspection checklists", "Room-readiness signals"] },
  { name: "Guest intelligence", group: "Guest experience", icon: Users, description: "Bring guest profiles, stay history and service context into the operating workflow.", outcomes: ["Guest profiles and CRM", "Stay and preference context", "Guest communications and requests"] },
  { name: "Finance", group: "Financial control", icon: CircleDollarSign, description: "Connect reservation financials, payments, balances and financial workflows.", outcomes: ["Reservation financial summaries", "Payment and balance visibility", "Invoice and reconciliation workflows"] },
  { name: "Revenue", group: "Commercial", icon: ChartNoAxesCombined, description: "Support pricing and revenue decisions with rate plans, restrictions, performance indicators and controlled pricing workflows.", outcomes: ["Rate plans and pricing calendar", "Pricing rules and restrictions", "ADR and RevPAR visibility"] },
  { name: "StayNas AI", group: "Intelligence", icon: Sparkles, description: "Use property-aware knowledge and AI assistance to support guest service and operational decisions.", outcomes: ["Property knowledge and concierge", "Contextual assistance", "Governed AI configuration"] },
  { name: "Automation", group: "Intelligence", icon: Workflow, description: "Coordinate recurring and event-driven work with clear operational ownership and exception handling.", outcomes: ["Workflow and event foundations", "Operational notifications", "Monitoring and approval surfaces"] },
  { name: "Multi-property", group: "Administration", icon: Building2, description: "Organise multiple properties under an organisation while maintaining property-level boundaries.", outcomes: ["Organisation and property structure", "Property-scoped access", "Group-level management direction"] },
  { name: "Integrations", group: "Connected ecosystem", icon: Network, description: "Connect payment, distribution, communication and specialist systems through explicit contracts.", outcomes: ["Provider connectivity", "API and event contracts", "Integration health and reconciliation"] },
  { name: "Reporting & intelligence", group: "Management", icon: Layers3, description: "Bring operational, commercial and guest signals together for better management visibility.", outcomes: ["Operational performance views", "Financial and revenue indicators", "Decision-support foundations"] },
];

const journey = [
  { title: "Discover & reserve", label: "Commercial", detail: "A guest finds the property, checks availability and submits a booking. StayNas creates a reservation record connected to the selected property and room inventory.", outputs: ["Availability result", "Reservation record", "Guest contact context"], icon: CalendarCheck },
  { title: "Prepare the arrival", label: "Pre-arrival", detail: "The property reviews guest information, prepares arrival communication and receives the online check-in information where enabled.", outputs: ["Guest details", "Pre-arrival checklist", "Arrival readiness"], icon: ClipboardCheck },
  { title: "Welcome & operate", label: "Property operations", detail: "Front desk, room status and housekeeping activity connect around the guest's stay, with tasks and exceptions visible to the responsible team.", outputs: ["Arrival workflow", "Room readiness", "Operational task ownership"], icon: House },
  { title: "Serve & assist", label: "Guest experience", detail: "Guest profiles, property knowledge and concierge capabilities help staff and guests access relevant information during the stay.", outputs: ["Guest context", "Property-aware assistance", "Service request visibility"], icon: Sparkles },
  { title: "Close & improve", label: "Management", detail: "Departure, payment status and management indicators contribute to a clearer view of the stay and the property's operation.", outputs: ["Departure workflow", "Financial status", "Management indicators"], icon: ChartNoAxesCombined },
];

export function StayNasModulePreview() {
  return <section className="bg-[#f0f1e9]">
    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#967747]">The StayNas modules</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">One operating system. Purpose-built workspaces.</h2><p className="mt-4 text-base leading-7 text-[#69756e]">Explore the functional areas that connect commercial activity, guest service, property operations and management.</p></div>
        <Link to="/modules" className="inline-flex items-center gap-2 text-sm font-semibold text-[#315744]">Explore all modules <ArrowRight className="h-4 w-4"/></Link>
      </div>
      <div className="mt-10 grid gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-4">
        {modules.slice(0,8).map((item) => <article key={item.name} className="site-editorial-item p-5"><item.icon className="h-5 w-5 text-[#a1844f]"/><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9a835b]">{item.group}</p><h3 className="mt-2 font-semibold">{item.name}</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">{item.description}</p></article>)}
      </div>
    </div>
  </section>;
}

export function StayNasModulesPage() {
  return <main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7bd85]">Product modules</p><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">The workspaces behind the whole stay.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas connects the functions a hospitality team needs to manage the guest journey and operate the property. Module availability depends on the deployment, configuration and release status.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="grid gap-x-8 gap-y-0 md:grid-cols-2 xl:grid-cols-3">{modules.map((item) => <article key={item.name} className="site-editorial-item p-6"><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf1eb] text-[#315744]"><item.icon className="h-5 w-5"/></span><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9a835b]">{item.group}</span></div><h2 className="mt-5 text-lg font-semibold">{item.name}</h2><p className="mt-3 text-sm leading-6 text-[#69756e]">{item.description}</p><ul className="mt-5 space-y-2">{item.outcomes.map((x) => <li key={x} className="flex gap-2 text-xs leading-5 text-[#526057]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#53765c]"/>{x}</li>)}</ul></article>)}</div><p className="mt-8 text-xs leading-6 text-[#7a847e]">This catalogue describes the product's functional scope. It does not imply that every module is enabled, fully certified or included in every subscription.</p></section>
    <section className="bg-[#10271f] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7bd85]">See the modules in context</p><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Walk through your property's operating model.</h2></div><Link to="/request-demo" className="inline-flex items-center gap-2 self-start rounded-full bg-[#d7bd85] px-6 py-3.5 text-sm font-semibold text-[#14271f]">Request a demo <ArrowRight className="h-4 w-4"/></Link></div></section>
  </main>;
}

export function StayNasProductTourPage() {
  const [active, setActive] = useState(0);
  const current = journey[active];
  return <main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7bd85]">Interactive product walkthrough</p><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Follow one stay through the operating system.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">Select each stage to see how guest-facing activity connects with the work happening inside the property.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-2">{journey.map((step,index) => <button key={step.title} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className={"flex w-full items-center gap-4 rounded-xl border p-4 text-left transition " + (active === index ? "border-[#315744] bg-[#e9ede6]" : "border-[#deded4] bg-white hover:bg-[#f6f5ef]")}><span className={"flex h-9 w-9 items-center justify-center rounded-lg " + (active === index ? "bg-[#315744] text-white" : "bg-[#edf1eb] text-[#315744]")}>{index+1}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{step.title}</span><span className="mt-1 block text-xs text-[#7a847e]">{step.label}</span></span><ChevronRight className="h-4 w-4 text-[#8c978f]"/></button>)}</div>
        <article className="site-editorial-item p-7 sm:p-9"><div className="flex items-center justify-between"><span className="rounded-full bg-[#edf1eb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#315744]">{current.label}</span><current.icon className="h-6 w-6 text-[#a1844f]"/></div><p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a835b]">Stage 0{active+1}</p><h2 className="mt-2 text-2xl font-semibold">{current.title}</h2><p className="mt-4 text-sm leading-7 text-[#69756e]">{current.detail}</p><h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-[#526057]">Operational outputs</h3><ul className="mt-4 space-y-3">{current.outputs.map((x) => <li key={x} className="flex items-center gap-3 text-sm text-[#46554c]"><BadgeCheck className="h-4 w-4 text-[#53765c]"/>{x}</li>)}</ul><div className="mt-10 flex items-center justify-between border-t border-[#ecece5] pt-5"><button type="button" onClick={() => setActive((active + journey.length - 1) % journey.length)} className="text-sm font-semibold text-[#52665a]">Previous stage</button><button type="button" onClick={() => setActive((active + 1) % journey.length)} className="inline-flex items-center gap-2 rounded-full bg-[#173d2d] px-5 py-3 text-sm font-semibold text-white">Next stage <ArrowRight className="h-4 w-4"/></button></div><p className="mt-5 text-[10px] leading-5 text-[#8b958e]">Illustrative workflow explanation, not a live customer transaction or production-system simulation.</p></article>
      </div>
    </section>
  </main>;
}

export function StayNasArchitecturePage() {
  const layers = [
    { title: "Nolmark CDMA · commercial owner", desc: "Product governance, commercial ownership and founder-level control." },
    { title: "Organisation / tenant", desc: "A hospitality business with its own subscription, commercial relationship and operating context." },
    { title: "Property", desc: "Property-specific identity, currency, timezone, staff membership, configuration and guest-facing experience." },
    { title: "Operational modules", desc: "Reservations, rooms, front desk, housekeeping, guests, finance, revenue and automation." },
    { title: "Connected services", desc: "Payment providers, distribution channels, communication services and specialist applications." },
  ];
  return <main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7bd85]">Platform architecture</p><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">One platform. Clear organisational and property boundaries.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas is designed as a property-neutral, multi-tenant hospitality operating system. Each deployment connects commercial governance, organisations, properties and specialist services without treating every property as the same operation.</p></div></section>
    <section className="mx-auto max-w-5xl px-6 py-16 lg:px-10"><div className="space-y-3">{layers.map((layer,index) => <div key={layer.title}><article className="site-editorial-item p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf1eb] text-sm font-semibold text-[#315744]">0{index+1}</span><div><h2 className="font-semibold">{layer.title}</h2><p className="mt-1 text-sm leading-6 text-[#69756e]">{layer.desc}</p></div></div></article>{index < layers.length-1 && <div className="flex justify-center py-1"><ChevronRight className="h-5 w-5 rotate-90 text-[#a1844f]"/></div>}</div>)}</div>
      <div className="mt-10 grid gap-4 md:grid-cols-2"><article className="border-y border-[#d5ddd3] py-6"><Network className="h-5 w-5 text-[#315744]"/><h3 className="mt-4 font-semibold">Tenant-aware operations</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">Property-scoped records, membership and configuration are central to the operating model. Cross-property visibility must be explicitly authorised.</p></article><article className="rounded-2xl bg-[#e9ede6] p-6"><CreditCard className="h-5 w-5 text-[#315744]"/><h3 className="mt-4 font-semibold">Commercial separation</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">Subscriptions, invoices, payments and provider credentials have distinct responsibilities and should not be conflated with property operations.</p></article></div>
      <p className="mt-8 text-xs leading-6 text-[#7a847e]">This is a conceptual architecture view based on the current product direction. It is not a substitute for a deployment-specific security or integration audit.</p>
    </section>
  </main>;
}

export function StayNasSecurityPage() {
  const controls = [
    ["Property-scoped access", "Staff membership and active-property context determine which property data a user can access."],
    ["Role-aware permissions", "Operational roles define access to guest, finance, housekeeping and administrative workflows."],
    ["Founder-only platform controls", "Global AI and commercial governance controls remain separate from tenant-level property settings."],
    ["Server-side secrets", "Provider credentials and privileged operations stay on the server and are not exposed to public website code."],
    ["Integration boundaries", "External connections require explicit data contracts, authentication, property scope and reconciliation responsibilities."],
    ["Release and audit discipline", "Production changes should pass CI, security review, migration review and release verification."],
  ];
  return <main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7bd85]">Trust & security</p><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Security boundaries are part of the product architecture.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas is being built around clear tenant separation, property-aware permissions and controlled integration access.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{controls.map(([title,desc]) => <article key={title} className="rounded-2xl border border-[#deded4] bg-white p-6"><LockKeyhole className="h-5 w-5 text-[#a1844f]"/><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#69756e]">{desc}</p></article>)}</div><div className="mt-10 rounded-2xl border border-[#deded4] bg-[#f0f1e9] p-7"><div className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-[#315744]"/><div><h2 className="font-semibold">A note on assurance</h2><p className="mt-2 text-sm leading-7 text-[#69756e]">Security controls are implemented and verified progressively. This page describes design principles and repository-level controls; it does not claim an external certification, penetration-test result or universal compliance status. Customers should request the current deployment-specific assurance pack.</p></div></div></div></section>
  </main>;
}

export function StayNasCommercialPage() {
  const tiers = [
    {
      name: "Essential",
      label: "Complete property operations",
      fit: "For independent hotels, lodges and hospitality properties that need a complete operating foundation.",
      allowance: "1 property",
      groups: [
        { title: "Core hospitality operations", items: ["Reservations and booking lifecycle", "Rooms, inventory and availability", "Front desk and digital check-in", "Housekeeping, inspections and room readiness", "Guest profiles and stay history", "Finance, folios and payment visibility"] },
        { title: "Property management", items: ["Basic room rates and pricing rules", "Seasonal and date-specific rate management", "Basic guest marketing and communications", "Operational dashboards and standard reports", "Basic payment-provider connection"] },
      ],
    },
    {
      name: "Professional",
      label: "Intelligence and multi-property growth",
      fit: "For growing operators coordinating multiple properties and seeking stronger commercial and operational intelligence.",
      allowance: "3 properties included",
      featured: true,
      groups: [
        { title: "Everything in Essential", items: ["Complete core hospitality operations", "Property-level operating controls", "Basic payment-provider connection"] },
        { title: "Professional capabilities", items: ["Multi-property administration and visibility", "AI Concierge with monthly credit allocation", "Advanced revenue management and pricing intelligence", "Advanced marketing, segmentation and campaigns", "Advanced workflow automation", "Enhanced analytics and management reporting", "Expanded integration capabilities"] },
      ],
    },
    {
      name: "Enterprise",
      label: "Portfolio governance and extensibility",
      fit: "For hospitality groups requiring centralised governance, consolidated intelligence and tailored integration arrangements.",
      allowance: "Property scope by agreement",
      groups: [
        { title: "Everything in Professional", items: ["Multi-property operations", "AI Concierge with negotiated credit allocation", "Advanced revenue and marketing capabilities"] },
        { title: "Enterprise capabilities", items: ["Group-wide administration and governance", "Consolidated financial and portfolio reporting", "Centralised commercial controls", "Advanced role, access and audit controls", "Custom integrations, APIs and workflows", "Negotiated support and service agreement"] },
      ],
    },
  ];

  const addons = [
    { name: "Website Builder", detail: "A property website and direct-booking experience connected to StayNas property content and reservation workflows.", model: "Separately configured add-on" },
    { name: "OTA Distribution", detail: "External booking-channel connectivity, with connector-specific setup, availability and operating requirements.", model: "Per-connector commercial arrangement" },
    { name: "Open API", detail: "Controlled API access for approved external systems, subject to access scope, integration requirements and commercial approval.", model: "Separately scoped" },
    { name: "LexiBite Integration", detail: "Connect eligible food-and-beverage operations with hospitality workflows through a separately scoped ecosystem integration.", model: "Integration add-on" },
    { name: "Custom Integrations", detail: "Specialist connectors and bespoke data exchange for systems beyond the standard integration catalogue.", model: "Enterprise / quoted scope" },
  ];

  const faqs = [
    { q: "Are subscription prices published on this page?", a: "No monetary figures are published here. The public page explains plan scope and commercial structure. Fees, discounts, billing arrangements and customer-specific terms are confirmed through an authorised quotation." },
    { q: "Who controls StayNas pricing and plan configuration?", a: "Commercial configuration is controlled by authorised StayNas Founder Administrators. This includes plan composition, pricing, property allowances, add-on terms, AI credit allocations and approved commercial exceptions. Tenant users cannot change platform-wide commercial settings." },
    { q: "How many properties are included in each plan?", a: "Essential is structured for one property. Professional includes three properties in its base subscription. Enterprise property scope is agreed individually. Additional-property terms are confirmed by Founder Administration." },
    { q: "Can a property use StayNas without purchasing add-ons?", a: "Yes. Essential is designed to provide complete core hospitality operations for a property. Optional products such as Website Builder and OTA Distribution extend the platform but are not prerequisites for core reservation, room, front-desk or housekeeping workflows." },
    { q: "Is AI Concierge included in every plan?", a: "AI Concierge is positioned in Professional and Enterprise, using a credit-based consumption model. Credit allocations, top-ups, usage rules and any negotiated arrangements are controlled by Founder Administration and confirmed for the applicable subscription." },
    { q: "How does OTA Distribution work commercially?", a: "OTA Distribution is an optional connector-based add-on. Connector availability, configuration, third-party requirements and applicable commercial terms are confirmed for each requested channel. Third-party channel fees or commissions, where applicable, are separate from StayNas fees." },
    { q: "Are payment integrations available on all plans?", a: "All plans are designed to include a basic payment-provider connection. Provider activation remains subject to supported integrations, property or tenant configuration, credentials and provider requirements. Transaction charges are separate where imposed by the provider." },
    { q: "Can I add Website Builder or other integrations later?", a: "Yes. Eligible add-ons can be discussed as the operation grows. Compatibility, property scope, implementation requirements and commercial terms are confirmed by the StayNas team before activation." },
    { q: "Does Professional include advanced revenue management and marketing?", a: "Professional is positioned to include advanced revenue management, marketing, segmentation, automation and multi-property visibility. Essential retains basic room pricing rules and basic marketing functionality." },
    { q: "What support is included with Enterprise?", a: "Enterprise support is not represented as a fixed public entitlement. Support scope, service levels, response commitments and escalation arrangements are negotiated and documented in the individual enterprise agreement." },
    { q: "Can I change my plan or property count?", a: "Plan changes and property-count adjustments are handled through the authorised commercial process. Effective dates, billing adjustments, eligibility and any resulting changes to access are confirmed by Founder Administration." },
    { q: "How do we get a proposal for our property?", a: "Submit a demonstration or commercial enquiry with your property count, operating model and integration requirements. The StayNas team will review the scope and coordinate an authorised commercial response." },
  ];

  return <main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7bd85]">Plans & commercial model</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">A hospitality operating system that grows with your operation.</h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-white/65">Choose a complete property operating foundation, expand into multi-property intelligence or agree an enterprise operating model. Optional capabilities extend the platform as your requirements evolve.</p>
        <div className="mt-8 flex flex-wrap gap-2 text-[11px] font-medium text-white/75">
          <span className="rounded-full border border-white/20 px-4 py-2">Monthly or annual arrangements</span>
          <span className="rounded-full border border-white/20 px-4 py-2">TZS or USD commercial options</span>
          <span className="rounded-full border border-white/20 px-4 py-2">Founder-administered terms</span>
          <span className="rounded-full border border-white/20 px-4 py-2">Optional add-ons</span>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#9a835b]">Choose your operating model</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Three plans. A clear path to grow.</h2>
        <p className="mt-4 text-sm leading-7 text-[#69756e]">Plan capabilities are described below. Monetary fees and final commercial configuration are not published; they are administered by authorised StayNas Founder Administrators.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {tiers.map((tier) => <article key={tier.name} className={"flex flex-col rounded-2xl border bg-white p-6 sm:p-7 " + (tier.featured ? "border-[#bda16d] shadow-[0_12px_40px_-28px_rgba(18,40,31,.4)]" : "border-[#deded4]")}>
          {tier.featured && <span className="mb-4 self-start rounded-full bg-[#edf1eb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315744]">For growing operators</span>}
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a835b]">StayNas {tier.name}</p>
          <h3 className="mt-3 text-2xl font-semibold">{tier.name}</h3>
          <p className="mt-2 text-xs font-semibold text-[#315744]">{tier.label}</p>
          <p className="mt-3 min-h-14 text-sm leading-6 text-[#69756e]">{tier.fit}</p>
          <div className="mt-5 border-y border-[#deded4] py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8a795b]">Property scope</p><p className="mt-1 text-sm font-semibold text-[#26392e]">{tier.allowance}</p></div>
          <div className="mt-6 flex-1 space-y-5">
            {tier.groups.map((group) => <div key={group.title}><h4 className="text-xs font-semibold text-[#35463b]">{group.title}</h4><ul className="mt-3 space-y-2.5">{group.items.map((item) => <li key={item} className="flex items-start gap-2 text-xs leading-5 text-[#526057]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#53765c]"/>{item}</li>)}</ul></div>)}
          </div>
          <Link to="/request-demo" className={"mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold " + (tier.featured ? "bg-[#244b38] text-white hover:bg-[#183b2a]" : "border border-[#315744] text-[#315744] hover:bg-[#edf0e8]")}>Discuss {tier.name} <ArrowRight className="h-4 w-4"/></Link>
        </article>)}
      </div>
      <p className="mx-auto mt-6 max-w-4xl text-center text-[11px] leading-5 text-[#7a847e]">Published plan descriptions communicate intended capability positioning. Final fees, enabled entitlements, property allowances, credit allocations and effective terms are confirmed through Founder Administration and the applicable customer agreement.</p>
    </section>

    <section className="border-y border-[#e4dfd3] bg-[#fbf9f2] px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#9a835b]">Compare plan capabilities</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Know what each operating tier is designed to deliver.</h2>
          <p className="mt-4 text-sm leading-7 text-[#69756e]">This comparison communicates the current commercial direction. The final published entitlement configuration remains under Founder Administration.</p>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-[#e0ddd2] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-[#e8e4da] bg-[#f7f4ec]"><th className="w-[25%] px-5 py-5 text-xs font-semibold text-[#35463b]">Capability</th>{tiers.map((tier) => <th key={tier.name} className="px-5 py-5 text-sm font-semibold text-[#26392e]">{tier.name}</th>)}</tr></thead>
              <tbody>
                {[
                  ["Core operations", "Reservations, rooms, front desk and housekeeping", "Complete property operations", "Complete multi-property operations", "Group-wide operations"],
                  ["Guest management", "Profiles, stay history and service context", "Included", "Advanced guest intelligence", "Portfolio-wide guest context"],
                  ["Finance", "Folios, payment visibility and standard reporting", "Included", "Advanced reporting", "Consolidated finance"],
                  ["Revenue management", "Basic room rates and pricing rules", "Included", "Advanced revenue management", "Group-wide revenue intelligence"],
                  ["Marketing", "Basic guest marketing", "Included", "Advanced campaigns and segmentation", "Group-wide marketing"],
                  ["Automation", "Basic operational workflows", "Basic", "Advanced automation", "Custom enterprise workflows"],
                  ["AI Concierge", "Not included", "Not included", "Monthly credit allocation", "Negotiated credit allocation"],
                  ["Multi-property", "Single-property scope", "Not included", "3 properties included", "Negotiated portfolio scope"],
                  ["Payment connectivity", "Basic provider connection", "Included", "Included", "Included"],
                  ["Integrations", "Basic payment connectivity", "Included", "Expanded integrations", "Custom integration scope"],
                  ["Support", "Standard arrangements confirmed commercially", "Standard arrangements confirmed commercially", "Standard arrangements confirmed commercially", "Entirely negotiated agreement"],
                ].map((row) => <tr key={row[0]} className="border-t border-[#eeebe3]"><th scope="row" className="px-5 py-4 text-xs font-medium text-[#526057]">{row[0]}</th>{row.slice(1).map((value,index) => <td key={index} className="px-5 py-4 text-xs leading-5 text-[#68756d]">{value}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#e8e4da] px-5 py-3 text-center text-[10px] text-[#7b857e] sm:hidden">Swipe horizontally to compare all three plans.</p>
        </div>
      </div>
    </section>

    <section className="bg-[#f0e8dc] px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#9a835b]">Extend your platform</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Optional capabilities for your operating model.</h2><p className="mt-4 text-sm leading-7 text-[#69756e]">Add-ons are separately scoped. Availability, compatibility, connector setup and commercial terms are confirmed before activation.</p></div>
        <div className="mt-10 grid gap-x-8 gap-y-0 md:grid-cols-2 xl:grid-cols-3">
          {addons.map((addon) => <article key={addon.name} className="site-editorial-item p-6"><div className="flex items-start justify-between gap-3"><h3 className="text-base font-semibold">{addon.name}</h3><Layers3 className="h-5 w-5 shrink-0 text-[#a16d4d]"/></div><p className="mt-3 text-sm leading-6 text-[#68756d]">{addon.detail}</p><p className="mt-5 border-t border-[#e9e5da] pt-4 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9a7657]">{addon.model}</p></article>)}
        </div>
        <p className="mt-6 text-center text-[11px] leading-5 text-[#7a847e]">Basic payment-provider connectivity is part of the plan direction. Provider activation, third-party fees and advanced payment requirements remain subject to configuration and agreement.</p>
      </div>
    </section>

    <section className="bg-[#10271f] px-6 py-14 text-white lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d7bd85]">Build your StayNas operating model</p><h2 className="mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl">Discuss the right plan and capabilities for your property.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Share your property footprint, operating priorities and integration requirements. An authorised StayNas representative will coordinate the commercial discussion.</p></div><Link to="/request-demo" className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-[#d7bd85] px-6 py-3.5 text-sm font-semibold text-[#17271f]">Discuss your requirements <ArrowRight className="h-4 w-4"/></Link></div>
    </section>

    <section className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-2xl text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#9a835b]">Frequently asked questions</p><h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Questions about StayNas plans and commercial options.</h2><p className="mt-4 text-sm leading-7 text-[#69756e]">The answers below explain the current plan direction. Final commercial configuration is confirmed by authorised Founder Administration.</p></div>
      <div className="mt-10 divide-y divide-[#e6e2d8] border-y border-[#e6e2d8]">
        {faqs.map((faq,index) => <details key={faq.q} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left text-sm font-semibold text-[#26392e] marker:content-none"><span><span className="mr-3 text-[10px] font-semibold tracking-widest text-[#a1844f]">0{index+1}</span>{faq.q}</span><ChevronRight className="h-4 w-4 shrink-0 text-[#8b958e] transition-transform group-open:rotate-90"/></summary><p className="max-w-4xl pb-1 pl-9 pt-4 text-sm leading-7 text-[#69756e]">{faq.a}</p></details>)}
      </div>
    </section>
  </main>;
}

type DemoFormState = { name: string; email: string; phone: string; company: string; country: string; propertyType: string; properties: string; interests: string[]; message: string; website: string; consent: boolean };
const initialDemoForm: DemoFormState = { name: "", email: "", phone: "", company: "", country: "", propertyType: "Hotel / boutique property", properties: "1", interests: ["Reservations & booking"], message: "", website: "", consent: false };

export function StayNasDemoRequestForm() {
  const [form, setForm] = useState<DemoFormState>(initialDemoForm);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const interestOptions = ["Reservations & booking", "Front desk & check-in", "Housekeeping & operations", "Finance & revenue", "AI concierge & automation", "Multi-property management", "Payments & integrations"];
  const update = (key: keyof DemoFormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const toggleInterest = (value: string) => setForm((current) => ({ ...current, interests: current.interests.includes(value) ? current.interests.filter((x) => x !== value) : [...current.interests, value] }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/public/staynas-demo-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "We could not submit your request. Please try again.");
      window.dispatchEvent(new CustomEvent("staynas:demo-request-success", { detail: { propertyType: form.propertyType, propertyCount: form.properties } }));
      setResult({ kind: "success", message: "Your demo request has been received. The StayNas team will follow up using the contact details you provided." });
      setForm(initialDemoForm);
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : "We could not submit your request. Please try again." });
    } finally {
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="rounded-2xl border border-[#deded4] bg-white p-6 shadow-[0_8px_32px_-24px_rgba(18,40,31,.35)] sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a835b]">Demo request</p><h2 className="mt-3 text-2xl font-semibold">Tell us about your operation.</h2><p className="mt-3 text-sm leading-6 text-[#69756e]">Share a few details so the demonstration can focus on your property and priorities.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-[#526057]">Full name *<input required maxLength={120} autoComplete="name" value={form.name} onChange={(e)=>update("name",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] px-3 py-3 text-sm font-normal text-[#15251f] outline-none focus:border-[#315744]" /></label>
      <label className="text-xs font-semibold text-[#526057]">Work email *<input required type="email" maxLength={255} autoComplete="email" value={form.email} onChange={(e)=>update("email",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] px-3 py-3 text-sm font-normal text-[#15251f] outline-none focus:border-[#315744]" /></label>
      <label className="text-xs font-semibold text-[#526057]">Phone / WhatsApp<input maxLength={40} autoComplete="tel" value={form.phone} onChange={(e)=>update("phone",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] px-3 py-3 text-sm font-normal text-[#15251f] outline-none focus:border-[#315744]" /></label>
      <label className="text-xs font-semibold text-[#526057]">Business / group name<input maxLength={160} autoComplete="organization" value={form.company} onChange={(e)=>update("company",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] px-3 py-3 text-sm font-normal text-[#15251f] outline-none focus:border-[#315744]" /></label>
      <label className="text-xs font-semibold text-[#526057]">Country<input maxLength={100} autoComplete="country-name" value={form.country} onChange={(e)=>update("country",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] px-3 py-3 text-sm font-normal text-[#15251f] outline-none focus:border-[#315744]" /></label>
      <label className="text-xs font-semibold text-[#526057]">Property type<select value={form.propertyType} onChange={(e)=>update("propertyType",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] bg-white px-3 py-3 text-sm font-normal text-[#15251f]"><option>Hotel / boutique property</option><option>Lodge / safari camp</option><option>Resort / retreat</option><option>Serviced apartments</option><option>Multi-property group</option><option>Other hospitality business</option></select></label>
      <label className="text-xs font-semibold text-[#526057]">Number of properties<select value={form.properties} onChange={(e)=>update("properties",e.target.value)} className="mt-2 w-full rounded-lg border border-[#d8ddd5] bg-white px-3 py-3 text-sm font-normal text-[#15251f]"><option value="1">1</option><option value="2-5">2–5</option><option value="6-20">6–20</option><option value="21+">21+</option></select></label>
    </div>
    <fieldset className="mt-6"><legend className="text-xs font-semibold text-[#526057]">What would you like to explore?</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{interestOptions.map((item)=><label key={item} className="flex items-center gap-2 text-xs text-[#526057]"><input type="checkbox" checked={form.interests.includes(item)} onChange={()=>toggleInterest(item)} className="h-4 w-4 accent-[#315744]"/>{item}</label>)}</div></fieldset>
    <label className="mt-6 block text-xs font-semibold text-[#526057]">Anything else we should know?<textarea rows={4} maxLength={2000} value={form.message} onChange={(e)=>update("message",e.target.value)} placeholder="Current systems, operational priorities, integrations or questions…" className="mt-2 w-full rounded-lg border border-[#d8ddd5] px-3 py-3 text-sm font-normal text-[#15251f] outline-none focus:border-[#315744]"/></label>
    <label aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e)=>update("website",e.target.value)}/></label>
    <label className="mt-6 flex items-start gap-3 text-xs leading-5 text-[#526057]"><input required type="checkbox" checked={form.consent} onChange={(e)=>setForm((current)=>({...current,consent:e.target.checked}))} className="mt-1 h-4 w-4 accent-[#315744]"/><span>I agree that Nolmark CDMA may use these details to respond to my StayNas enquiry and arrange a product demonstration.</span></label>
    <button disabled={busy} type="submit" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#173d2d] px-7 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Submitting…" : "Submit demo request"} <ArrowRight className="h-4 w-4"/></button>
    {result && <p role="status" aria-live="polite" className={"mt-4 rounded-lg p-3 text-sm " + (result.kind==="success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{result.message}</p>}
    <p className="mt-4 text-[10px] leading-5 text-[#8b958e]">Your information will be used by Nolmark CDMA to respond to this StayNas enquiry. Do not include passwords, payment card data or sensitive guest information.</p>
  </form>;
}
