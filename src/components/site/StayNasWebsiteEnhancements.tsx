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
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {modules.slice(0,8).map((item) => <article key={item.name} className="rounded-2xl border border-[#deded4] bg-white p-5"><item.icon className="h-5 w-5 text-[#a1844f]"/><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9a835b]">{item.group}</p><h3 className="mt-2 font-semibold">{item.name}</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">{item.description}</p></article>)}
      </div>
    </div>
  </section>;
}

export function StayNasModulesPage() {
  return <main>
    <section className="bg-[#0c211b] px-6 py-16 text-white lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#d7bd85]">Product modules</p><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">The workspaces behind the whole stay.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-white/65">StayNas connects the functions a hospitality team needs to manage the guest journey and operate the property. Module availability depends on the deployment, configuration and release status.</p></div></section>
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map((item) => <article key={item.name} className="rounded-2xl border border-[#deded4] bg-white p-6"><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf1eb] text-[#315744]"><item.icon className="h-5 w-5"/></span><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9a835b]">{item.group}</span></div><h2 className="mt-5 text-lg font-semibold">{item.name}</h2><p className="mt-3 text-sm leading-6 text-[#69756e]">{item.description}</p><ul className="mt-5 space-y-2">{item.outcomes.map((x) => <li key={x} className="flex gap-2 text-xs leading-5 text-[#526057]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#53765c]"/>{x}</li>)}</ul></article>)}</div><p className="mt-8 text-xs leading-6 text-[#7a847e]">This catalogue describes the product's functional scope. It does not imply that every module is enabled, fully certified or included in every subscription.</p></section>
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
        <article className="rounded-3xl border border-[#deded4] bg-white p-7 sm:p-9"><div className="flex items-center justify-between"><span className="rounded-full bg-[#edf1eb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#315744]">{current.label}</span><current.icon className="h-6 w-6 text-[#a1844f]"/></div><p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a835b]">Stage 0{active+1}</p><h2 className="mt-2 text-2xl font-semibold">{current.title}</h2><p className="mt-4 text-sm leading-7 text-[#69756e]">{current.detail}</p><h3 className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-[#526057]">Operational outputs</h3><ul className="mt-4 space-y-3">{current.outputs.map((x) => <li key={x} className="flex items-center gap-3 text-sm text-[#46554c]"><BadgeCheck className="h-4 w-4 text-[#53765c]"/>{x}</li>)}</ul><div className="mt-10 flex items-center justify-between border-t border-[#ecece5] pt-5"><button type="button" onClick={() => setActive((active + journey.length - 1) % journey.length)} className="text-sm font-semibold text-[#52665a]">Previous stage</button><button type="button" onClick={() => setActive((active + 1) % journey.length)} className="inline-flex items-center gap-2 rounded-full bg-[#173d2d] px-5 py-3 text-sm font-semibold text-white">Next stage <ArrowRight className="h-4 w-4"/></button></div><p className="mt-5 text-[10px] leading-5 text-[#8b958e]">Illustrative workflow explanation, not a live customer transaction or production-system simulation.</p></article>
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
    <section className="mx-auto max-w-5xl px-6 py-16 lg:px-10"><div className="space-y-3">{layers.map((layer,index) => <div key={layer.title}><article className="rounded-2xl border border-[#deded4] bg-white p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf1eb] text-sm font-semibold text-[#315744]">0{index+1}</span><div><h2 className="font-semibold">{layer.title}</h2><p className="mt-1 text-sm leading-6 text-[#69756e]">{layer.desc}</p></div></div></article>{index < layers.length-1 && <div className="flex justify-center py-1"><ChevronRight className="h-5 w-5 rotate-90 text-[#a1844f]"/></div>}</div>)}</div>
      <div className="mt-10 grid gap-4 md:grid-cols-2"><article className="rounded-2xl bg-[#e9ede6] p-6"><Network className="h-5 w-5 text-[#315744]"/><h3 className="mt-4 font-semibold">Tenant-aware operations</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">Property-scoped records, membership and configuration are central to the operating model. Cross-property visibility must be explicitly authorised.</p></article><article className="rounded-2xl bg-[#e9ede6] p-6"><CreditCard className="h-5 w-5 text-[#315744]"/><h3 className="mt-4 font-semibold">Commercial separation</h3><p className="mt-2 text-sm leading-6 text-[#69756e]">Subscriptions, invoices, payments and provider credentials have distinct responsibilities and should not be conflated with property operations.</p></article></div>
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
  const [showDetails, setShowDetails] = useState(false);
  const plans = [
    {
      name: "Essential",
      eyebrow: "For independent properties",
      fit: "A focused operating foundation for a single property or a smaller hospitality business.",
      price: "Pricing on request",
      detail: "Base subscription with additional-property pricing where applicable.",
      action: "Discuss Essential",
    },
    {
      name: "Professional",
      eyebrow: "For growing operations",
      fit: "For properties and operators that need broader coordination and room to expand.",
      price: "Pricing on request",
      detail: "Hybrid property pricing with independently selected add-ons where compatible.",
      action: "Discuss Professional",
      featured: true,
    },
    {
      name: "Enterprise",
      eyebrow: "For groups and complex operations",
      fit: "For multi-property groups with tailored governance, integration and service requirements.",
      price: "Custom quotation",
      detail: "Quote-required commercial terms based on the agreed group scope.",
      action: "Talk to Enterprise",
    },
  ];

  const comparison = [
    {
      group: "Commercial structure",
      rows: [
        { label: "Billing frequency", values: ["Monthly or annual", "Monthly or annual", "Monthly or annual by agreement"] },
        { label: "Billing currency", values: ["TZS or USD", "TZS or USD", "TZS or USD by agreement"] },
        { label: "Property pricing", values: ["Base + additional properties", "Base + additional properties", "Defined in enterprise quote"] },
        { label: "Price publication", values: ["Confirmed quotation", "Confirmed quotation", "Quote required"] },
      ],
    },
    {
      group: "Platform expansion",
      rows: [
        { label: "Independent add-ons", values: ["Available where compatible", "Available where compatible", "Scoped in the agreement"] },
        { label: "Package composition", values: ["Published plan version", "Published plan version", "Agreed enterprise composition"] },
        { label: "Property allowance", values: ["Set by published plan", "Set by published plan", "Defined in enterprise quote"] },
      ],
    },
  ];

  return <main className="bg-[#f7f4ec] text-[#17271f]">
    <section className="px-6 pb-14 pt-16 sm:pb-20 sm:pt-24 lg:px-10">
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#a16d4d]">StayNas plans & pricing</p>
        <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">The right operating plan for <span className="font-serif italic text-[#b56f50]">every stage.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-[#68756d] sm:text-base">Choose the commercial structure that fits your property today, with room to extend your platform as your operation grows.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-[#59675e]">
          <span className="rounded-full border border-[#d9d7cc] bg-white/70 px-4 py-2">TZS and USD</span>
          <span className="rounded-full border border-[#d9d7cc] bg-white/70 px-4 py-2">Monthly or annual</span>
          <span className="rounded-full border border-[#d9d7cc] bg-white/70 px-4 py-2">Hybrid property pricing</span>
          <span className="rounded-full border border-[#d9d7cc] bg-white/70 px-4 py-2">Independent add-ons</span>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => <article key={plan.name} className={"relative flex h-full flex-col rounded-2xl border p-6 sm:p-7 " + (plan.featured ? "border-[#b88762] bg-[#fffdf7] shadow-[0_18px_50px_-36px_rgba(45,54,39,.45)]" : "border-[#e0ddd2] bg-[#fffdf8]")}>
          {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-[#f2e7d9] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9a6547]">Growing teams</span>}
          <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#a16d4d]">{plan.eyebrow}</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{plan.name}</h2>
          <p className="mt-3 min-h-[4.5rem] text-sm leading-6 text-[#68756d]">{plan.fit}</p>
          <div className="mt-7 border-y border-[#e9e5da] py-5">
            <p className="text-2xl font-serif text-[#b56f50]">{plan.price}</p>
            <p className="mt-2 text-xs leading-5 text-[#7b857e]">{plan.detail}</p>
          </div>
          <Link to="/request-demo" className={"mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold transition " + (plan.featured ? "bg-[#244b38] text-white hover:bg-[#183b2a]" : "border border-[#315744] text-[#315744] hover:bg-[#edf0e8]")}>{plan.action}<ArrowRight className="h-4 w-4"/></Link>
        </article>)}
      </div>
      <p className="mx-auto mt-5 max-w-4xl text-center text-[11px] leading-5 text-[#7b857e]">Final fees and allowances are confirmed against the current published commercial schedule and your selected property footprint. Enterprise pricing is quotation-led.</p>
    </section>

    <section className="border-y border-[#e4dfd3] bg-[#fbf9f2] px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#a16d4d]">Compare the structure</p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">What each plan is built around.</h2>
          <p className="mt-4 text-sm leading-7 text-[#68756d]">A clear view of billing, property pricing and how your platform can be extended. Exact module access is governed by the published plan and package version.</p>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-[#e0ddd2] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8e4da] bg-[#f7f4ec]">
                  <th className="w-[28%] px-5 py-5 text-xs font-semibold text-[#35463b]">Commercial feature</th>
                  {plans.map((plan) => <th key={plan.name} className="px-5 py-5 text-sm font-semibold text-[#26392e]">{plan.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {comparison.map((group) => <React.Fragment key={group.group}>
                  <tr className="bg-[#f3f0e7]"><th colSpan={4} className="px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9a7657]">{group.group}</th></tr>
                  {group.rows.map((row) => <tr key={row.label} className="border-t border-[#eeebe3]">
                    <th scope="row" className="px-5 py-4 text-xs font-medium text-[#526057]">{row.label}</th>
                    {row.values.map((value,index) => <td key={index} className="px-5 py-4 text-xs leading-5 text-[#68756d]">{value}</td>)}
                  </tr>)}
                </React.Fragment>)}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#e8e4da] px-5 py-4 text-center sm:hidden"><p className="text-[10px] text-[#7b857e]">Swipe horizontally to compare all three plans.</p></div>
        </div>
        <div className="mt-6 text-center">
          <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails((value) => !value)} className="inline-flex items-center gap-2 rounded-full border border-[#9e9b8e] px-6 py-3 text-xs font-medium text-[#39483e] transition hover:bg-[#f0ede4]">{showDetails ? "Show less" : "Show more"} <ChevronRight className={"h-3.5 w-3.5 transition-transform " + (showDetails ? "rotate-[-90deg]" : "rotate-90")}/></button>
        </div>
        {showDetails && <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-[#e0ddd2] bg-white p-5"><h3 className="text-sm font-semibold">Property footprint</h3><p className="mt-2 text-xs leading-6 text-[#68756d]">Essential and Professional use a hybrid model: a base subscription plus separately priced additional properties where the allowance is exceeded.</p></article>
          <article className="rounded-xl border border-[#e0ddd2] bg-white p-5"><h3 className="text-sm font-semibold">Independent add-ons</h3><p className="mt-2 text-xs leading-6 text-[#68756d]">Optional capabilities are priced separately. Availability depends on the published package and its explicit compatibility rules.</p></article>
          <article className="rounded-xl border border-[#e0ddd2] bg-white p-5"><h3 className="text-sm font-semibold">Currency and term</h3><p className="mt-2 text-xs leading-6 text-[#68756d]">Choose TZS or USD and a monthly or annual term. Each currency is quoted independently; no automatic exchange-rate conversion is applied.</p></article>
        </div>}
      </div>
    </section>

    <section className="bg-[#f0e8dc] px-6 py-16 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.23em] text-[#a16d4d]">Expand your platform</p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Add capability as your operation grows.</h2>
          <p className="mt-4 text-sm leading-7 text-[#68756d]">Keep the core plan aligned to your operation and extend it with separately scoped commercial options.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/70 bg-[#fffdf7] p-6"><Building2 className="h-5 w-5 text-[#a16d4d]"/><h3 className="mt-5 text-base font-semibold">Additional properties</h3><p className="mt-2 text-sm leading-6 text-[#68756d]">Extend your property footprint through separately priced property allowances, according to the selected plan version.</p><p className="mt-5 text-xs font-semibold text-[#b56f50]">Property-based pricing</p></article>
          <article className="rounded-2xl border border-white/70 bg-[#fffdf7] p-6"><Layers3 className="h-5 w-5 text-[#a16d4d]"/><h3 className="mt-5 text-base font-semibold">Independent add-ons</h3><p className="mt-2 text-sm leading-6 text-[#68756d]">Select additional capabilities independently where the published package confirms compatibility.</p><p className="mt-5 text-xs font-semibold text-[#b56f50]">Priced separately</p></article>
          <article className="rounded-2xl border border-white/70 bg-[#fffdf7] p-6"><Network className="h-5 w-5 text-[#a16d4d]"/><h3 className="mt-5 text-base font-semibold">Integration requirements</h3><p className="mt-2 text-sm leading-6 text-[#68756d]">Discuss your payment, distribution and specialist-system landscape so the integration scope can be assessed accurately.</p><p className="mt-5 text-xs font-semibold text-[#b56f50]">Scoped to your operation</p></article>
        </div>
      </div>
    </section>

    <section className="bg-[#10271f] px-6 py-14 text-white lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d7bd85]">Build your StayNas package</p><h2 className="mt-3 max-w-2xl text-2xl font-semibold sm:text-3xl">Get a quotation shaped around your property operation.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Tell us how many properties you manage, which capabilities matter and which systems you need to connect.</p></div>
        <Link to="/request-demo" className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-[#d7bd85] px-6 py-3.5 text-sm font-semibold text-[#17271f]">Request pricing <ArrowRight className="h-4 w-4"/></Link>
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
