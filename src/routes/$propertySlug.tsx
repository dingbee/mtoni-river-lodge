/* eslint-disable @typescript-eslint/no-explicit-any -- existing public room catalog payload is dynamically shaped */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight, BedDouble, CalendarDays, Check, CheckCircle2, ChevronDown,
  Globe2, Minus, Plus, ShieldCheck, Users,
} from "lucide-react";
import {
  createPublicDemoBooking,
  getPublicDemoQuote,
  getPublicDemoProperty,
  searchPublicDemoAvailability,
} from "@/lib/public-booking.functions";

export const Route = createFileRoute("/$propertySlug")({
  loader: async ({ params }) => {
    try {
      const propertyData = await getPublicDemoProperty({ data: { propertySlug: params.propertySlug } });
      return { propertyData, pageError: "" };
    } catch (error) {
      return {
        propertyData: null,
        pageError: error instanceof Error ? error.message : "This booking page is unavailable.",
      };
    }
  },
  head: ({ params }) => {
    const title = `${params.propertySlug} — Direct Booking | StayNas`;
    const description = "Check availability and book directly with this property, powered by StayNas.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:site_name", content: "StayNas" },
        { name: "theme-color", content: "#1e352a" },
        { name: "robots", content: "noindex,nofollow" },
      ],
    };
  },
  component: PublicPropertyBookingPage,
});
type PropertyPageData = Awaited<ReturnType<typeof getPublicDemoProperty>>;
type PublicBookingQuote = {
  quote_id: string;
  quote_expires_at: string;
  accommodation_subtotal?: number;
  extras_total?: number;
  fee_total?: number;
  discount_total?: number;
  taxes?: number;
  tax_addition?: number;
  total: number;
  currency: string;
};

type RatePlanOption = { rate_plan_id: string; name: string; description: string | null; meal_plan: string | null; refundable: boolean; currency: string; total: number; average_nightly_rate: number; minimum_stay: number; nightly_breakdown: Array<{ date: string; nightly_rate: number; currency: string; source_label: string; pricing_basis: string; source_rate: number }>; publication_id: string; publication_number: number; rate_plan_version: number; snapshot_hash: string };
type AvailableRoom = {
  room_id: string; slug: string; name: string; base_price: number; currency: string;
  max_occupancy: number; nightly_total: number | null; nights: number; min_available: number;
  is_available: boolean; fits_guests: boolean; rate_plan_options?: RatePlanOption[];
  pricing_quote?: { ok?: boolean; error_code?: string; total?: number };
};

const isoDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
};
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const prettyDate = (value: string) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${value}T00:00:00Z`))
      .toLocaleUpperCase("en-GB")
  : "Select date";


function PublicPropertyBookingPage() {
  const { propertySlug } = Route.useParams();
  const { propertyData, pageError } = Route.useLoaderData();
  const searchAvailability = useServerFn(searchPublicDemoAvailability);
  const createBooking = useServerFn(createPublicDemoBooking);
  const getQuote = useServerFn(getPublicDemoQuote);

  const [checkIn, setCheckIn] = useState(addDays(7));
  const [checkOut, setCheckOut] = useState(addDays(9));
  const [guests, setGuests] = useState(2);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(null);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState("");
  const [selectedRatePlans, setSelectedRatePlans] = useState<Record<string, string>>({});
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [country, setCountry] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [confirmation, setConfirmation] = useState<Awaited<ReturnType<typeof createPublicDemoBooking>> | null>(null);
  const [bookingQuote, setBookingQuote] = useState<PublicBookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, Math.round((new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86400000));
  }, [checkIn, checkOut]);

  const availabilityMutation = useMutation({
    mutationFn: () => searchAvailability({ data: { propertySlug, checkIn, checkOut, guests } }),
    onSuccess: (rooms) => {
      setAvailableRooms(rooms as AvailableRoom[]);
      setHasSearched(true);
      setSelectedRoom(null);
      setSelectedRatePlanId("");
      setSelectedRatePlans({});
      setBookingQuote(null);
      setQuoteError("");
      setConfirmation(null);
      window.setTimeout(() => document.getElementById("room-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    },
  });

  const bookingMutation = useMutation({
    mutationFn: () => {
      if (!selectedRoom) throw new Error("Select a room to continue.");
      if (!bookingQuote?.quote_id) throw new Error("Enter a valid guest email and wait for the final quote before booking.");
      if (bookingQuote.quote_expires_at && Date.parse(bookingQuote.quote_expires_at) <= Date.now()) throw new Error("The quote expired. Refresh the price before submitting.");
      return createBooking({
        data: {
          propertySlug, quoteId: bookingQuote.quote_id, roomSlug: selectedRoom.slug, ratePlanId: selectedRatePlanId || undefined, checkIn, checkOut,
          adults: guests, children: 0, guestName, guestEmail, guestPhone, country, specialRequests,
        },
      });
    },
    onSuccess: (result) => {
      setConfirmation(result);
      window.setTimeout(() => document.getElementById("booking-confirmation")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    },
  });

  const resolvedRatePlanId = selectedRatePlanId || (selectedRoom?.rate_plan_options?.length === 1 ? selectedRoom.rate_plan_options[0].rate_plan_id : "");
  const validGuestEmail = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(guestEmail.trim()) ? guestEmail.trim() : "";

  useEffect(() => {
    if (!selectedRoom || !resolvedRatePlanId || !validGuestEmail || nights < 1) {
      setBookingQuote(null);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setBookingQuote(null);
    setQuoteError("");
    getQuote({ data: {
      propertySlug,
      roomSlug: selectedRoom.slug,
      checkIn,
      checkOut,
      adults: guests,
      ratePlanId: resolvedRatePlanId,
      guestEmail: validGuestEmail,
    } }).then((quote) => {
      if (!cancelled) {
        setBookingQuote(quote as PublicBookingQuote);
        setQuoteLoading(false);
      }
    }).catch((error) => {
      if (!cancelled) {
        setBookingQuote(null);
        setQuoteError(error instanceof Error ? error.message : "The final quote could not be calculated.");
        setQuoteLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [getQuote, propertySlug, selectedRoom?.slug, resolvedRatePlanId, checkIn, checkOut, guests, validGuestEmail, nights]);

  const runAvailability = () => {
    if (nights > 0) availabilityMutation.mutate();
  };

  if (!propertyData) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f5f4ef] px-5"><div className="max-w-md rounded-[2rem] border border-stone-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-slate-900">Booking page unavailable</h1><p className="mt-3 text-sm text-slate-600">{pageError || "This property is not currently published on StayNas."}</p><a href="/" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">StayNas home</a></div></main>;
  }

  const { property, rooms, branding } = propertyData;
  const currency = property.currency;
  const brandStyle = {
    "--direct-primary": branding.primaryColor,
    "--direct-secondary": branding.secondaryColor,
    "--direct-background": branding.backgroundColor,
    "--direct-text": branding.textColor,
  } as React.CSSProperties;
  const selectedPlan = selectedRoom?.rate_plan_options?.find((plan) => plan.rate_plan_id === selectedRatePlanId) ?? (selectedRoom?.rate_plan_options?.length === 1 ? selectedRoom.rate_plan_options[0] : undefined);
  const selectedTotal = selectedRoom ? Number(selectedPlan?.total ?? selectedRoom.nightly_total) : 0;

  return (
    <main style={brandStyle} className="min-h-screen bg-[var(--direct-background)] pb-28 text-[var(--direct-text)] selection:bg-[#dce8df]">
      <header className="relative z-10 border-b border-black/[0.06] bg-[#f5f4ef]/95">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-2.5" aria-label="StayNas home">
            {branding.logoUrl ? <img src={branding.logoUrl} alt={property.name} className="h-9 max-w-32 object-contain" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--direct-primary)] text-sm font-semibold tracking-tight text-white">S</span>}
            <span className="text-[17px] font-semibold tracking-[-0.04em] text-[var(--direct-primary)]">{branding.logoUrl ? property.name : <>staynas<span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[#718078]">direct</span></>}</span>
          </a>
          <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-[#68766d]"><ShieldCheck className="h-4 w-4"/><span className="hidden sm:inline">BOOK DIRECT · BOOK SECURE</span><span className="sm:hidden">BOOK DIRECT</span></div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-8 sm:pt-7">
        <div className="relative isolate flex min-h-[290px] items-end overflow-hidden rounded-[1.65rem] bg-[#293b31] sm:min-h-[390px] sm:rounded-[2rem]">
          <img src={branding.heroImageUrl || "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=2200&q=88"} alt="Relaxed boutique hospitality setting" className="absolute inset-0 -z-20 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#101d18]/80 via-[#15231c]/45 to-[#15231c]/10"/>
          <div className="max-w-2xl px-6 pb-8 pt-16 text-white sm:px-10 sm:pb-11">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--direct-secondary)] sm:text-xs">{branding.tagline || "A more personal way to stay"}</p>
            <h1 className="mt-3 max-w-xl text-[2.35rem] font-medium leading-[1.05] tracking-[-0.055em] sm:text-6xl">{property.name}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/85 sm:mt-4 sm:text-base">{branding.description || "Find your dates. Choose your room. Book directly."}</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/15 px-3 py-1.5 text-[10px] font-medium tracking-wide text-white/90 backdrop-blur-sm"><Globe2 className="h-3.5 w-3.5"/> DIRECT RESERVATIONS · POWERED BY STAYNAS</div>
          </div>
          
        </div>

        <section id="availability" className="relative z-10 mx-auto -mt-5 max-w-5xl rounded-[1.4rem] border border-[#e6e4dc] bg-white p-4 shadow-[0_18px_55px_rgba(33,43,36,0.10)] sm:-mt-8 sm:rounded-[1.7rem] sm:p-6">
          <div className="mb-4 flex items-center justify-between px-1">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#718078]">Plan your stay</p><h2 className="mt-1 text-lg font-semibold tracking-[-0.035em] text-[#202820] sm:text-xl">When would you like to arrive?</h2></div>
            <span className="hidden items-center gap-1.5 text-[11px] text-[#78847c] sm:flex"><CalendarDays className="h-4 w-4"/> Flexible dates</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_.8fr_auto] sm:items-end sm:gap-3">
            <label className="relative block min-w-0 rounded-xl border border-[#e8e8e1] bg-[#fafaf8] px-3 py-2.5 transition focus-within:border-[#758a7d] focus-within:bg-white">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-[#7b877e]">Check-in</span>
              <span aria-hidden="true" className="mt-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-[#26352c]">
                <span>{prettyDate(checkIn).toLocaleUpperCase("en-GB")}</span><ChevronDown className="h-4 w-4 shrink-0 text-[#526257]"/>
              </span>
              <input aria-label="Check-in date" type="date" min={isoDate(new Date())} value={checkIn} onChange={(event) => { setCheckIn(event.target.value); if (checkOut <= event.target.value) setCheckOut(addDays(2)); setHasSearched(false); setSelectedRoom(null); setSelectedRatePlanId(""); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/>
            </label>
            <label className="relative block min-w-0 rounded-xl border border-[#e8e8e1] bg-[#fafaf8] px-3 py-2.5 transition focus-within:border-[#758a7d] focus-within:bg-white">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-[#7b877e]">Check-out</span>
              <span aria-hidden="true" className="mt-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-[#26352c]">
                <span>{prettyDate(checkOut).toLocaleUpperCase("en-GB")}</span><ChevronDown className="h-4 w-4 shrink-0 text-[#526257]"/>
              </span>
              <input aria-label="Check-out date" type="date" min={checkIn || isoDate(new Date())} value={checkOut} onChange={(event) => { setCheckOut(event.target.value); setHasSearched(false); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/>
            </label>
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-[#e8e8e1] bg-[#fafaf8] px-3 py-2.5 sm:col-span-1">
              <div><span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-[#7b877e]">Guests</span><span className="mt-1 block text-[13px] font-semibold text-[#26352c]">{guests} {guests === 1 ? "guest" : "guests"}</span></div>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Remove guest" disabled={guests <= 1} onClick={() => { setGuests((value) => Math.max(1, value - 1)); setHasSearched(false); setSelectedRoom(null); setSelectedRatePlanId(""); }} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#dedfd7] text-[#526257] disabled:opacity-30"><Minus className="h-3.5 w-3.5"/></button>
                <button type="button" aria-label="Add guest" disabled={guests >= 8} onClick={() => { setGuests((value) => Math.min(8, value + 1)); setHasSearched(false); setSelectedRoom(null); setSelectedRatePlanId(""); }} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#dedfd7] text-[#526257] disabled:opacity-30"><Plus className="h-3.5 w-3.5"/></button>
              </div>
            </div>
            <button type="button" disabled={nights < 1 || availabilityMutation.isPending} onClick={runAvailability} className="col-span-2 flex h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--direct-primary)] px-5 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1">
              {availabilityMutation.isPending ? "Checking…" : "Find a room"}<ArrowRight className="h-4 w-4"/>
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#efefe9] px-1 pt-3 text-[11px] text-[#7b877e]"><span>{prettyDate(checkIn)} — {prettyDate(checkOut)}</span><span className="font-semibold text-[#3f5146]">{nights} {nights === 1 ? "night" : "nights"}</span></div>
          {availabilityMutation.isError && <p role="alert" className="mt-3 text-xs text-red-700">{(availabilityMutation.error as Error).message}</p>}
        </section>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-8 sm:pb-16 sm:pt-14">
        <div id="room-results" className="mb-5 flex scroll-mt-5 items-end justify-between gap-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7a8a7e]">The accommodation</p><h2 className="mt-1.5 text-[1.65rem] font-medium tracking-[-0.05em] text-[#202820] sm:text-3xl">Find your room</h2><p className="mt-1 text-xs text-[#7b877e] sm:text-sm">{hasSearched ? `Options for ${nights} nights · ${guests} guests` : "Thoughtful spaces for a comfortable stay"}</p></div>
          <span className="pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#879187]">{rooms.length} room types</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room: any) => {
            const live = availableRooms.find((item) => item.slug === room.slug);
            const isSelected = selectedRoom?.slug === room.slug;
            const planOptions: RatePlanOption[] = live?.rate_plan_options ?? [];
            const selectedPlanForRoom = planOptions.find((plan) => plan.rate_plan_id === (selectedRatePlans[room.slug] ?? "")) ?? (planOptions.length === 1 ? planOptions[0] : undefined);
            const needsPlanChoice = live?.pricing_quote?.error_code === "RATE_PLAN_REQUIRED";
            const notReturned = hasSearched && !live;
            return <article key={room.id} className={`group overflow-hidden rounded-[1.4rem] border bg-white transition duration-200 ${isSelected ? "border-[#68816f] ring-2 ring-[#dce7dd]" : "border-[#e8e7df] hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(33,43,36,0.08)]"}`}>
              <div className="relative aspect-[16/10] overflow-hidden bg-[#e9e9e1]">
                {(room.image_url || room.gallery_urls?.[0]) ? <img src={room.image_url || room.gallery_urls?.[0]} alt={`${room.name} at ${property.name}`} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"/> : <div className="flex h-full w-full items-center justify-center bg-[#e9e9e1] text-xs text-[#7a857d]">Room image not provided</div>}
                <span className="absolute left-3 top-3 rounded-full border border-white/40 bg-white/90 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#35483b] backdrop-blur-sm">{room.category?.name || property.name}</span>
                {isSelected && <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#244331] text-white"><Check className="h-4 w-4"/></span>}
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="text-[17px] font-semibold tracking-[-0.035em] text-[#253229]">{room.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#7a857d]">{room.short_description || room.hero_line || room.description?.[0] || "A comfortable space for your stay."}</p></div>
                  <div className="shrink-0 text-right"><p className="text-[17px] font-semibold tracking-tight text-[#253229]">{hasSearched && live && needsPlanChoice && !selectedPlanForRoom ? "Choose a plan" : hasSearched && live && selectedPlanForRoom ? money(Number(selectedPlanForRoom.total), selectedPlanForRoom.currency) : money(room.base_price, room.currency || currency)}</p><p className="text-[10px] text-[#899188]">{hasSearched && live && selectedPlanForRoom ? "accommodation subtotal" : hasSearched && live && needsPlanChoice ? "to view pricing" : "per night · indicative"}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-[#f0f0eb] pt-3 text-[10px] text-[#758078]">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5"/>{room.max_occupancy} guests max</span>
                  {room.bed_label && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5"/>{room.bed_label}</span>}{room.size_label && <span>{room.size_label}</span>}{room.view_label && <span>{room.view_label}</span>}
                </div>
                {live ? <div className="mt-4 border-t border-[#f0f0eb] pt-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium text-[#4d7059]">{live.min_available} available</span><span className="text-xs font-semibold text-[#26382d]">{needsPlanChoice && planOptions.length === 0 ? "Rates unavailable" : needsPlanChoice && planOptions.length > 1 && !selectedPlanForRoom ? "Choose a rate plan" : money(Number(selectedPlanForRoom?.total ?? live.nightly_total ?? 0), selectedPlanForRoom?.currency ?? live.currency)} <span className="font-normal text-[#899188]">accommodation subtotal</span></span></div>
                  {planOptions.length > 1 && <div className="mt-3"><label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#718078]">Choose a rate plan</label><select value={selectedRatePlans[room.slug] ?? ""} onChange={(event) => { const nextPlanId = event.target.value; setSelectedRatePlans((current) => ({ ...current, [room.slug]: nextPlanId })); if (isSelected) setSelectedRatePlanId(nextPlanId); }} className="mt-1.5 h-10 w-full rounded-lg border border-[#e5e6df] bg-[#fcfcfa] px-3 text-xs text-[#253229]"><option value="">Select a rate plan</option>{planOptions.map((plan) => <option key={plan.rate_plan_id} value={plan.rate_plan_id}>{plan.name} — {money(Number(plan.total), plan.currency)}</option>)}</select>{selectedPlanForRoom && <p className="mt-1.5 text-[10px] text-[#7b877e]">{selectedPlanForRoom.description || selectedPlanForRoom.meal_plan || "Published rate plan"} · {selectedPlanForRoom.refundable ? "Refundable" : "Non-refundable"}</p>}</div>}
                  {planOptions.length === 1 && selectedPlanForRoom && <p className="mt-2 text-[10px] text-[#7b877e]">{selectedPlanForRoom.name} · {selectedPlanForRoom.meal_plan || "No meal plan"} · {selectedPlanForRoom.refundable ? "Refundable" : "Non-refundable"}</p>}
                  <button type="button" disabled={needsPlanChoice && planOptions.length === 0 || planOptions.length > 1 && !selectedRatePlans[room.slug]} onClick={() => { setSelectedRoom(live); setSelectedRatePlanId(selectedRatePlans[room.slug] ?? ""); setConfirmation(null); window.setTimeout(() => document.getElementById("guest-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${isSelected ? "bg-[#e5eee6] text-[#31523b]" : "bg-[var(--direct-primary)] text-white hover:opacity-90"}`}>{isSelected ? "Room selected" : "Choose this room"}<ArrowRight className="h-3.5 w-3.5"/></button>
                </div> : notReturned ? <div className="mt-4 border-t border-[#f0f0eb] pt-3"><p className="text-xs text-[#8b7460]">Not available for these dates</p></div> : <p className="mt-4 border-t border-[#f0f0eb] pt-3 text-[10px] text-[#9a9f97]">Search dates to check availability</p>}
              </div>
            </article>;
          })}
        </div>

        {hasSearched && availableRooms.length === 0 && <div className="mt-5 rounded-2xl border border-[#e6e4dc] bg-white p-6 text-center"><CalendarDays className="mx-auto h-7 w-7 text-[#829087]"/><h3 className="mt-3 text-base font-semibold text-[#29372e]">No rooms available for these dates</h3><p className="mt-1 text-xs text-[#7c877f]">Try different dates or adjust the number of guests.</p></div>}

        {selectedRoom && !confirmation && <form id="guest-details" onSubmit={(event) => { event.preventDefault(); bookingMutation.mutate(); }} className="mt-7 scroll-mt-5 rounded-[1.5rem] border border-[#e6e4dc] bg-white p-5 shadow-[0_12px_35px_rgba(33,43,36,0.06)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#718078]">Your reservation</p><h2 className="mt-1 text-2xl font-medium tracking-[-0.045em] text-[#202820]">A few details before we confirm</h2></div><span className="rounded-full bg-[#edf3ed] px-3 py-1.5 text-[10px] font-semibold text-[#416149]">Room selected</span></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f7f2] p-4"><div><p className="text-sm font-semibold text-[#29372e]">{selectedRoom.name}</p>{selectedPlan && <p className="mt-1 text-[11px] text-[#65776a]">{selectedPlan.name} · {selectedPlan.meal_plan || "No meal plan"} · {selectedPlan.refundable ? "Refundable" : "Non-refundable"}</p>}<p className="mt-1 text-[11px] text-[#7d887f]">{prettyDate(checkIn)} — {prettyDate(checkOut)} · {guests} guests</p></div><div className="text-right"><p className="text-lg font-semibold text-[#29372e]">{money(selectedTotal, selectedPlan?.currency ?? selectedRoom.currency)}</p><p className="text-[10px] text-[#7d887f]">accommodation subtotal · before taxes</p></div></div>{selectedPlan?.nightly_breakdown?.length ? <div className="mt-3 rounded-xl border border-[#e8e9e2] bg-white p-4"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#718078]">Nightly price breakdown</p><span className="text-[10px] text-[#899188]">{selectedPlan.nightly_breakdown.length} nights</span></div><div className="mt-2 divide-y divide-[#f0f0eb]">{selectedPlan.nightly_breakdown.map((night) => <div key={night.date} className="flex items-center justify-between gap-3 py-2 text-xs"><div><p className="font-medium text-[#35463a]">{prettyDate(night.date)}</p><p className="mt-0.5 text-[10px] text-[#899188]">{night.source_label} · {night.pricing_basis.replaceAll("_", " ")}</p></div><span className="font-semibold tabular-nums text-[#29372e]">{money(Number(night.nightly_rate), night.currency)}</span></div>)}</div><div className="mt-2 flex items-center justify-between border-t border-[#e9eae3] pt-3 text-xs"><span className="font-semibold text-[#536258]">Accommodation subtotal</span><span className="font-semibold tabular-nums text-[#29372e]">{money(selectedTotal, selectedPlan.currency)}</span></div></div> : null}
          <div className="mt-4 rounded-xl border border-[#e8e9e2] bg-white p-4">
            <div className="flex items-center justify-between text-xs"><span className="text-[#718078]">Final price calculation</span><span className="text-[10px] text-[#899188]">{quoteLoading ? "Calculating…" : bookingQuote?.quote_expires_at ? `Valid until ${new Date(bookingQuote.quote_expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting guest email"}</span></div>
            {bookingQuote ? <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span>Accommodation</span><span>{money(Number(bookingQuote.accommodation_subtotal ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Extras</span><span>{money(Number(bookingQuote.extras_total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Fees</span><span>{money(Number(bookingQuote.fee_total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Discounts</span><span>−{money(Number(bookingQuote.discount_total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Included taxes</span><span>{money(Number(bookingQuote.taxes ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Additional taxes</span><span>{money(Number(bookingQuote.tax_addition ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3 border-t border-[#e9eae3] pt-3 text-sm font-semibold text-[#29372e]"><span>Total</span><span>{money(Number(bookingQuote.total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
            </div> : <p className="mt-2 text-[11px] text-[#7d887f]">{quoteLoading ? "Resolving published rates, fees, promotions and taxes…" : "Enter a valid email address to resolve the final guest quote."}</p>}
            {quoteError && <p role="alert" className="mt-2 text-[11px] text-red-700">{quoteError}</p>}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#526057]">Full name<input required minLength={2} maxLength={100} value={guestName} onChange={(event) => setGuestName(event.target.value)} className="h-11 rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3 text-sm font-normal text-[#253229] outline-none focus:border-[#78917e]" placeholder="Your full name"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#526057]">Email address<input required type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="h-11 rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3 text-sm font-normal text-[#253229] outline-none focus:border-[#78917e]" placeholder="you@example.com"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#526057]">Phone number <span className="font-normal text-[#929a93]">Optional</span><input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="h-11 rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3 text-sm font-normal text-[#253229] outline-none focus:border-[#78917e]" placeholder="+255…"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#526057]">Country <span className="font-normal text-[#929a93]">Optional</span><input value={country} onChange={(event) => setCountry(event.target.value)} className="h-11 rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3 text-sm font-normal text-[#253229] outline-none focus:border-[#78917e]" placeholder="Country"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[#526057] sm:col-span-2">Special requests <span className="font-normal text-[#929a93]">Optional</span><textarea value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} className="min-h-20 rounded-xl border border-[#e5e6df] bg-[#fcfcfa] p-3 text-sm font-normal text-[#253229] outline-none focus:border-[#78917e]" maxLength={1000} placeholder="Let the property know if you have any requests…"/></label>
          </div>
          {bookingMutation.isError && <p role="alert" className="mt-4 text-xs text-red-700">{(bookingMutation.error as Error).message}</p>}
          <button type="submit" disabled={bookingMutation.isPending || quoteLoading || !bookingQuote?.quote_id} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1e352a] px-5 text-xs font-semibold text-white transition hover:bg-[#294536] disabled:opacity-50">{bookingMutation.isPending ? "Submitting reservation…" : "Request this reservation"}<ArrowRight className="h-4 w-4"/></button>
          <p className="mt-3 text-center text-[10px] text-[#899188]">Your reservation request will be sent to the property for confirmation.</p>
        </form>}

        {confirmation && <section id="booking-confirmation" className="mt-7 scroll-mt-6 rounded-[1.5rem] border border-[#cbdccf] bg-[#edf4ed] p-6 sm:p-8">
          <CheckCircle2 className="h-9 w-9 text-[#3d7650]"/><h2 className="mt-3 text-2xl font-medium tracking-tight text-[#21392a]">Your reservation is recorded</h2><p className="mt-2 text-sm text-[#536b59]">The reservation has been saved to {confirmation.propertyName}.</p>
          <div className="mt-5 grid gap-4 rounded-xl bg-white/80 p-4 text-sm sm:grid-cols-2"><div><p className="text-[10px] text-[#7e8a80]">BOOKING REFERENCE</p><p className="mt-1 font-semibold">{confirmation.reference}</p></div><div><p className="text-[10px] text-[#7e8a80]">RESERVATION TOTAL</p><p className="mt-1 font-semibold">{money(confirmation.total, confirmation.currency)}</p></div><div><p className="text-[10px] text-[#7e8a80]">PAYMENT STATUS</p><p className="mt-1 font-semibold">Unpaid · No payment gateway</p></div><div><p className="text-[10px] text-[#7e8a80]">PROPERTY</p><p className="mt-1 font-semibold">{confirmation.propertyName}</p></div></div>
          <button type="button" onClick={() => { setConfirmation(null); setSelectedRoom(null); setGuestName(""); setGuestEmail(""); setGuestPhone(""); setCountry(""); setSpecialRequests(""); setAvailableRooms([]); setHasSearched(false); }} className="mt-5 rounded-full border border-[#78917e] px-5 py-2.5 text-xs font-semibold text-[#31523b]">Make another reservation</button>
        </section>}
      </section>

      <footer className="border-t border-[#e7e5dd] bg-[#eeeee7] px-5 py-7 text-center">{branding.logoUrl ? <img src={branding.logoUrl} alt={property.name} className="mx-auto h-8 max-w-32 object-contain"/> : <p className="text-sm font-semibold tracking-tight text-[#314338]">{property.name}</p>}{branding.showStayNasAttribution && <p className="mt-2 text-[10px] text-[#879188]">Property-owned reservations · Powered by StayNas</p>}</footer>

      {!confirmation && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e6e4dc] bg-[#fafaf7]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7d897f]">{selectedRoom ? "Selected room" : "Your stay"}</p><p className="truncate text-xs font-semibold text-[#29372e]">{selectedRoom ? money(selectedTotal, selectedRoom.currency) + " · " + selectedRoom.name : `${nights} nights · ${guests} guests`}</p></div>
          <button type="button" onClick={() => selectedRoom ? document.getElementById("guest-details")?.scrollIntoView({ behavior: "smooth", block: "start" }) : runAvailability()} disabled={availabilityMutation.isPending || (selectedRoom === null && nights < 1)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--direct-primary)] px-5 text-xs font-semibold text-white disabled:opacity-50">{selectedRoom ? "Continue" : availabilityMutation.isPending ? "Checking…" : "Find a room"}<ArrowRight className="h-3.5 w-3.5"/></button>
        </div>
      </div>}
    </main>
  );
}
