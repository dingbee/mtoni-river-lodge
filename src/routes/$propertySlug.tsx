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
import { formatMoney } from "@/lib/money";
import { plausibleGuestEmail, quoteRatePlanId, searchedNightlyRate } from "@/lib/public-availability";
import { deriveDirectTheme } from "@/lib/direct-booking-theme";
import { DirectHighlights, DirectOfferBanner, DirectPhotoCards, DirectValueWords } from "@/components/direct-booking/DirectSections";
import { directHeroPhotos } from "@/lib/direct-booking-content";

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
  head: ({ params, loaderData }) => {
    const title = `${params.propertySlug} — Direct Booking | StayNas`;
    const description = "Check availability and book directly with this property, powered by StayNas.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:site_name", content: "StayNas" },
        { name: "theme-color", content: deriveDirectTheme(loaderData?.propertyData?.branding ?? {})["--direct-primary"] },
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
  room_id: string; slug: string; name: string; base_price: number | null; currency: string;
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
// Every amount is rendered with the ISO currency it was priced in, at that
// currency's minor-unit precision.
const money = (value: number | string | null | undefined, currency: string | null | undefined) => formatMoney(value, currency);
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

  // Single-plan rooms carry their plan in the availability price evidence, not in the
  // choice list; without it the final quote (and so booking) was never requested.
  const resolvedRatePlanId = selectedRoom ? quoteRatePlanId(selectedRoom, selectedRatePlanId) : "";
  // The previous inline pattern was double-escaped ("\\s", "\\.") and rejected every
  // real address, so no quote was ever requested and booking could not be submitted.
  const validGuestEmail = plausibleGuestEmail(guestEmail);

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
    return <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5"><div className="max-w-md rounded-[2rem] border border-stone-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-slate-900">Booking page unavailable</h1><p className="mt-3 text-sm text-slate-600">{pageError || "This property is not currently published on StayNas."}</p><a href="/" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">StayNas home</a></div></main>;
  }

  const { property, rooms, branding } = propertyData;
  const currency = property.currency;
  // All page colours derive from the property's four branding colours.
  const brandStyle = deriveDirectTheme(branding) as React.CSSProperties;
  const heroPhotos = directHeroPhotos(branding.galleryImageUrls, rooms);
  const selectedPlan = selectedRoom?.rate_plan_options?.find((plan) => plan.rate_plan_id === selectedRatePlanId) ?? (selectedRoom?.rate_plan_options?.length === 1 ? selectedRoom.rate_plan_options[0] : undefined);
  const selectedTotal = selectedRoom ? Number(selectedPlan?.total ?? selectedRoom.nightly_total) : 0;

  return (
    <main style={brandStyle} className="direct-booking min-h-screen bg-[var(--direct-background)] pb-28 text-[var(--direct-text)] selection:bg-[var(--direct-primary-soft)]">
      <header className="relative z-10 border-b border-[var(--direct-border)] bg-[var(--direct-background)]/95">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-2.5" aria-label="StayNas home">
            {branding.logoUrl ? <img src={branding.logoUrl} alt={property.name} className="h-9 max-w-32 object-contain" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--direct-primary)] text-sm font-semibold tracking-tight text-[var(--direct-on-primary)]">S</span>}
            <span className="text-[17px] font-semibold tracking-[-0.04em] text-[var(--direct-on-primary-soft)]">{branding.logoUrl ? property.name : <>staynas<span className="ml-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--direct-muted)]">direct</span></>}</span>
          </a>
          <div className="flex items-center gap-4"><span className="hidden items-center gap-2 text-[11px] font-medium tracking-wide text-[var(--direct-text-subtle)] md:flex"><ShieldCheck className="h-4 w-4"/>BOOK DIRECT · BOOK SECURE</span><a href="#availability" className="inline-flex h-10 items-center rounded-full bg-[var(--direct-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--direct-on-primary)] transition hover:bg-[var(--direct-primary-hover)] sm:px-5">Book your stay</a></div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-8 sm:pt-7">
        <div className="relative isolate flex min-h-[420px] items-end overflow-hidden rounded-[1.65rem] bg-[var(--direct-overlay)] sm:min-h-[540px] sm:rounded-[2rem] lg:min-h-[600px]">
          {branding.heroImageUrl
            ? <img src={branding.heroImageUrl} alt={`${property.name}`} className="absolute inset-0 -z-20 h-full w-full object-cover" />
            : <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[radial-gradient(120%_90%_at_85%_10%,var(--direct-primary)_0%,var(--direct-overlay)_70%)]" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--direct-overlay)]/85 via-[var(--direct-overlay)]/45 to-[var(--direct-overlay)]/5"/>
          <div className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-[var(--direct-overlay)]/60 to-transparent"/>
          <div className={`w-full px-6 pt-20 text-white sm:px-10 lg:flex lg:items-end lg:justify-between lg:gap-10 ${heroPhotos.length ? "pb-24 sm:pb-36" : "pb-12 sm:pb-16"}`}>
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80 sm:text-xs">{branding.tagline || "A more personal way to stay"}</p>
              <h1 className="direct-display mt-3 max-w-xl text-[2.9rem] font-medium leading-[0.98] sm:text-7xl">{property.name}</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/85 sm:text-base">Find your dates. Choose your room. Book directly.</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a href="#room-results" className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--direct-primary)] px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--direct-on-primary)] ring-1 ring-white/20 transition hover:bg-[var(--direct-primary-hover)]">View rooms<ArrowRight className="h-3.5 w-3.5"/></a>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/15 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white/90 backdrop-blur-sm"><Globe2 className="h-3.5 w-3.5"/>DIRECT RESERVATIONS{branding.showStayNasAttribution ? " · POWERED BY STAYNAS" : ""}</span>
              </div>
            </div>
            <DirectValueWords words={branding.valueWords} className="mt-7 text-white/90 lg:mt-0 lg:pb-2" />
          </div>
        </div>
        <DirectPhotoCards photos={heroPhotos} propertyName={property.name} intro={branding.description} />
      </section>

      <section aria-label="Plan your stay" className="mx-auto max-w-7xl px-4 pt-10 sm:px-8 sm:pt-16">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.9fr)] lg:items-center lg:gap-10">
          <div className="px-1">
            <h2 className="direct-display text-[2.4rem] font-medium leading-[1.02] text-[var(--direct-text)] sm:text-5xl">Discover<br />your stay</h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--direct-muted)]">Choose your dates and guests, compare rooms and live rates, and send your reservation directly to {property.name}.</p>
            <a href="#room-results" className="mt-6 hidden h-11 items-center gap-2 rounded-full border border-[var(--direct-border-strong)] px-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--direct-text)] transition hover:bg-[var(--direct-surface)] lg:inline-flex">View rooms<ArrowRight className="h-3.5 w-3.5"/></a>
          </div>
          <div className="relative lg:flex lg:items-center">
        <section id="availability" className="relative z-10 rounded-[1.4rem] border border-[var(--direct-border)] bg-[var(--direct-surface)] p-4 shadow-[0_18px_55px_var(--direct-shadow)] sm:rounded-[1.7rem] sm:p-5 lg:w-[330px] lg:shrink-0">
          <div className="mb-4 flex items-start justify-between gap-3 px-1">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--direct-muted)]">Plan your stay</p><h2 className="direct-display mt-1 text-2xl font-medium leading-tight text-[var(--direct-text)] sm:text-[1.7rem]">When would you like to arrive?</h2></div>
            {heroPhotos[0] && <img src={branding.heroImageUrl || heroPhotos[0].url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />}
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
            <label className="relative block min-w-0 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 py-2.5 transition focus-within:border-[var(--direct-border-strong)] focus-within:bg-[var(--direct-surface)]">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.17em] text-[var(--direct-muted)]">Check-in</span>
              <span aria-hidden="true" className="mt-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-[var(--direct-text)]">
                <span>{prettyDate(checkIn).toLocaleUpperCase("en-GB")}</span><ChevronDown className="h-4 w-4 shrink-0 text-[var(--direct-text-subtle)]"/>
              </span>
              <input aria-label="Check-in date" type="date" min={isoDate(new Date())} value={checkIn} onChange={(event) => { setCheckIn(event.target.value); if (checkOut <= event.target.value) setCheckOut(addDays(2)); setHasSearched(false); setSelectedRoom(null); setSelectedRatePlanId(""); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/>
            </label>
            <label className="relative block min-w-0 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 py-2.5 transition focus-within:border-[var(--direct-border-strong)] focus-within:bg-[var(--direct-surface)]">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.17em] text-[var(--direct-muted)]">Check-out</span>
              <span aria-hidden="true" className="mt-1 flex items-center justify-between gap-2 text-[13px] font-semibold text-[var(--direct-text)]">
                <span>{prettyDate(checkOut).toLocaleUpperCase("en-GB")}</span><ChevronDown className="h-4 w-4 shrink-0 text-[var(--direct-text-subtle)]"/>
              </span>
              <input aria-label="Check-out date" type="date" min={checkIn || isoDate(new Date())} value={checkOut} onChange={(event) => { setCheckOut(event.target.value); setHasSearched(false); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/>
            </label>
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 py-2.5 lg:col-span-1">
              <div><span className="block text-[11px] font-semibold uppercase tracking-[0.17em] text-[var(--direct-muted)]">Guests</span><span className="mt-1 block text-[13px] font-semibold text-[var(--direct-text)]">{guests} {guests === 1 ? "guest" : "guests"}</span></div>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Remove guest" disabled={guests <= 1} onClick={() => { setGuests((value) => Math.max(1, value - 1)); setHasSearched(false); setSelectedRoom(null); setSelectedRatePlanId(""); }} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--direct-border)] text-[var(--direct-text-subtle)] disabled:opacity-30"><Minus className="h-3.5 w-3.5"/></button>
                <button type="button" aria-label="Add guest" disabled={guests >= 8} onClick={() => { setGuests((value) => Math.min(8, value + 1)); setHasSearched(false); setSelectedRoom(null); setSelectedRatePlanId(""); }} className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--direct-border)] text-[var(--direct-text-subtle)] disabled:opacity-30"><Plus className="h-3.5 w-3.5"/></button>
              </div>
            </div>
            <button type="button" disabled={nights < 1 || availabilityMutation.isPending} onClick={runAvailability} className="col-span-2 flex h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--direct-primary)] px-5 text-[13px] font-semibold text-[var(--direct-on-primary)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-1">
              {availabilityMutation.isPending ? "Checking…" : "Find a room"}<ArrowRight className="h-4 w-4"/>
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[var(--direct-border)] px-1 pt-3 text-[11px] text-[var(--direct-muted)]"><span>{prettyDate(checkIn)} — {prettyDate(checkOut)}</span><span className="font-semibold text-[var(--direct-text)]">{nights} {nights === 1 ? "night" : "nights"}</span></div>
          {availabilityMutation.isError && <p role="alert" className="mt-3 text-xs text-red-700">{(availabilityMutation.error as Error).message}</p>}
        </section>
            {(branding.heroImageUrl || heroPhotos[0]) && <div className="hidden lg:-ml-16 lg:block lg:min-w-0 lg:flex-1">
              <img src={heroPhotos[1]?.url ?? heroPhotos[0]?.url ?? branding.heroImageUrl} alt="" loading="lazy" className="aspect-[16/10] w-full rounded-[1.6rem] object-cover" />
            </div>}
          </div>
        </div>
      </section>

      <DirectHighlights highlights={branding.highlights} className="mx-auto mt-8 max-w-7xl px-4 sm:mt-12 sm:px-8" />

      <section className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-8 sm:pb-16 sm:pt-14">
        <div id="room-results" className="mb-5 flex scroll-mt-5 items-end justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--direct-muted)]">The accommodation</p><h2 className="direct-display mt-1.5 text-[2.1rem] font-medium leading-none text-[var(--direct-text)] sm:text-[2.6rem]">Find your room</h2><p className="mt-1 text-xs text-[var(--direct-muted)] sm:text-sm">{hasSearched ? `Options for ${nights} nights · ${guests} guests` : "Thoughtful spaces for a comfortable stay"}</p></div>
          <span className="pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--direct-muted)]">{rooms.length} room types</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room: any) => {
            const live = availableRooms.find((item) => item.slug === room.slug);
            const isSelected = selectedRoom?.slug === room.slug;
            const planOptions: RatePlanOption[] = live?.rate_plan_options ?? [];
            const selectedPlanForRoom = planOptions.find((plan) => plan.rate_plan_id === (selectedRatePlans[room.slug] ?? "")) ?? (planOptions.length === 1 ? planOptions[0] : undefined);
            const needsPlanChoice = live?.pricing_quote?.error_code === "RATE_PLAN_REQUIRED";
            // After a search, the card shows the live rate for the searched dates (in the
            // quote currency), never the stored indicative "from" price.
            const livePerNight = live && !needsPlanChoice ? searchedNightlyRate(live) : null;
            const notReturned = hasSearched && !live;
            return <article key={room.id} className={`group overflow-hidden rounded-[1.4rem] border bg-[var(--direct-surface)] transition duration-200 ${isSelected ? "border-[var(--direct-border-strong)] ring-2 ring-[var(--direct-primary-soft)]" : "border-[var(--direct-border)] hover:-translate-y-0.5 hover:shadow-[0_14px_35px_var(--direct-shadow)]"}`}>
              <div className="relative aspect-[16/10] overflow-hidden bg-[var(--direct-surface-sunken)]">
                {(room.image_url || room.gallery_urls?.[0]) ? <img src={room.image_url || room.gallery_urls?.[0]} alt={`${room.name} at ${property.name}`} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"/> : <div className="flex h-full w-full items-center justify-center bg-[var(--direct-surface-sunken)] text-xs text-[var(--direct-muted)]">Room image not provided</div>}
                <span className="absolute left-3 top-3 rounded-full border border-white/40 bg-[var(--direct-surface)]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--direct-text)] backdrop-blur-sm">{room.category?.name || property.name}</span>
                {isSelected && <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--direct-primary)] text-[var(--direct-on-primary)]"><Check className="h-4 w-4"/></span>}
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="direct-display text-[1.35rem] font-semibold leading-tight text-[var(--direct-text)]">{room.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--direct-muted)]">{room.short_description || room.hero_line || room.description?.[0] || "A comfortable space for your stay."}</p></div>
                  <div className="shrink-0 text-right"><p className="text-[17px] font-semibold tracking-tight text-[var(--direct-text)]">{hasSearched && live && needsPlanChoice && !selectedPlanForRoom ? "Choose a plan" : hasSearched && live && selectedPlanForRoom ? money(Number(selectedPlanForRoom.total), selectedPlanForRoom.currency) : hasSearched && livePerNight ? `${livePerNight.uniform ? "" : "from "}${money(livePerNight.amount, livePerNight.currency)}` : room.base_price !== null && room.base_price !== undefined && Number(room.base_price) > 0 ? money(room.base_price, currency) : "Select dates"}</p><p className="text-[11px] text-[var(--direct-muted)]">{hasSearched && live && selectedPlanForRoom ? "accommodation subtotal" : hasSearched && live && needsPlanChoice ? "to view pricing" : hasSearched && livePerNight ? "per night · your dates" : room.base_price !== null && room.base_price !== undefined && Number(room.base_price) > 0 ? "per night · indicative" : "to see live rates"}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-[var(--direct-border)] pt-3 text-[11px] text-[var(--direct-muted)]">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5"/>{room.max_occupancy} guests max</span>
                  {room.bed_label && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5"/>{room.bed_label}</span>}{room.size_label && <span>{room.size_label}</span>}{room.view_label && <span>{room.view_label}</span>}
                </div>
                {Array.isArray(room.amenities) && room.amenities.filter(Boolean).length > 0 && <ul aria-label={`${room.name} amenities`} className="mt-3 flex flex-wrap gap-1.5">
                  {room.amenities.filter(Boolean).slice(0, 4).map((item: string) => <li key={item} className="rounded-full bg-[var(--direct-surface-muted)] px-2.5 py-1 text-[11px] text-[var(--direct-text-subtle)]">{item}</li>)}
                  {room.amenities.filter(Boolean).length > 4 && <li className="px-1 py-1 text-[11px] text-[var(--direct-muted)]">+{room.amenities.filter(Boolean).length - 4} more</li>}
                </ul>}
                {live ? <div className="mt-4 border-t border-[var(--direct-border)] pt-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-[var(--direct-on-primary-soft)]">{live.min_available} available</span><span className="text-xs font-semibold text-[var(--direct-text)]">{needsPlanChoice && planOptions.length === 0 ? "Rates unavailable" : needsPlanChoice && planOptions.length > 1 && !selectedPlanForRoom ? "Choose a rate plan" : money(selectedPlanForRoom?.total ?? live.nightly_total, selectedPlanForRoom?.currency ?? live.currency)} <span className="font-normal text-[var(--direct-muted)]">accommodation subtotal</span></span></div>
                  {planOptions.length > 1 && <div className="mt-3"><label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--direct-muted)]">Choose a rate plan</label><select value={selectedRatePlans[room.slug] ?? ""} onChange={(event) => { const nextPlanId = event.target.value; setSelectedRatePlans((current) => ({ ...current, [room.slug]: nextPlanId })); if (isSelected) setSelectedRatePlanId(nextPlanId); }} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 text-xs text-[var(--direct-text)]"><option value="">Select a rate plan</option>{planOptions.map((plan) => <option key={plan.rate_plan_id} value={plan.rate_plan_id}>{plan.name} — {money(Number(plan.total), plan.currency)}</option>)}</select>{selectedPlanForRoom && <p className="mt-1.5 text-[11px] text-[var(--direct-muted)]">{selectedPlanForRoom.description || selectedPlanForRoom.meal_plan || "Published rate plan"} · {selectedPlanForRoom.refundable ? "Refundable" : "Non-refundable"}</p>}</div>}
                  {planOptions.length === 1 && selectedPlanForRoom && <p className="mt-2 text-[11px] text-[var(--direct-muted)]">{selectedPlanForRoom.name} · {selectedPlanForRoom.meal_plan || "No meal plan"} · {selectedPlanForRoom.refundable ? "Refundable" : "Non-refundable"}</p>}
                  <button type="button" disabled={needsPlanChoice && planOptions.length === 0 || planOptions.length > 1 && !selectedRatePlans[room.slug]} onClick={() => { setSelectedRoom(live); setSelectedRatePlanId(selectedRatePlans[room.slug] ?? ""); setConfirmation(null); window.setTimeout(() => document.getElementById("guest-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${isSelected ? "bg-[var(--direct-primary-soft)] text-[var(--direct-on-primary-soft)]" : "bg-[var(--direct-primary)] text-[var(--direct-on-primary)] hover:opacity-90"}`}>{isSelected ? "Room selected" : "Choose this room"}<ArrowRight className="h-3.5 w-3.5"/></button>
                </div> : notReturned ? <div className="mt-4 border-t border-[var(--direct-border)] pt-3"><p className="text-xs text-[var(--direct-muted)]">Not available for these dates</p></div> : <p className="mt-4 border-t border-[var(--direct-border)] pt-3 text-[11px] text-[var(--direct-muted)]">Search dates to check availability</p>}
              </div>
            </article>;
          })}
        </div>

        {hasSearched && availableRooms.length === 0 && <div className="mt-5 rounded-2xl border border-[var(--direct-border)] bg-[var(--direct-surface)] p-6 text-center"><CalendarDays className="mx-auto h-7 w-7 text-[var(--direct-muted)]"/><h3 className="mt-3 text-base font-semibold text-[var(--direct-text)]">No rooms available for these dates</h3><p className="mt-1 text-xs text-[var(--direct-muted)]">Try different dates or adjust the number of guests.</p></div>}

        {selectedRoom && !confirmation && <form id="guest-details" onSubmit={(event) => { event.preventDefault(); bookingMutation.mutate(); }} className="mt-7 scroll-mt-5 rounded-[1.5rem] border border-[var(--direct-border)] bg-[var(--direct-surface)] p-5 shadow-[0_12px_35px_var(--direct-shadow-soft)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--direct-muted)]">Your reservation</p><h2 className="direct-display mt-1 text-[1.9rem] font-medium leading-tight text-[var(--direct-text)]">A few details before we confirm</h2></div><span className="rounded-full bg-[var(--direct-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--direct-on-primary-soft)]">Room selected</span></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--direct-surface-muted)] p-4"><div><p className="text-sm font-semibold text-[var(--direct-text)]">{selectedRoom.name}</p>{selectedPlan && <p className="mt-1 text-[11px] text-[var(--direct-text-subtle)]">{selectedPlan.name} · {selectedPlan.meal_plan || "No meal plan"} · {selectedPlan.refundable ? "Refundable" : "Non-refundable"}</p>}<p className="mt-1 text-[11px] text-[var(--direct-muted)]">{prettyDate(checkIn)} — {prettyDate(checkOut)} · {guests} guests</p></div><div className="text-right"><p className="text-lg font-semibold text-[var(--direct-text)]">{money(selectedTotal, selectedPlan?.currency ?? selectedRoom.currency)}</p><p className="text-[11px] text-[var(--direct-muted)]">accommodation subtotal · before taxes</p></div></div>{selectedPlan?.nightly_breakdown?.length ? <div className="mt-3 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface)] p-4"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--direct-muted)]">Nightly price breakdown</p><span className="text-[11px] text-[var(--direct-muted)]">{selectedPlan.nightly_breakdown.length} nights</span></div><div className="mt-2 divide-y divide-[var(--direct-border)]">{selectedPlan.nightly_breakdown.map((night) => <div key={night.date} className="flex items-center justify-between gap-3 py-2 text-xs"><div><p className="font-medium text-[var(--direct-text)]">{prettyDate(night.date)}</p><p className="mt-0.5 text-[11px] text-[var(--direct-muted)]">{night.source_label} · {night.pricing_basis.replaceAll("_", " ")}</p></div><span className="font-semibold tabular-nums text-[var(--direct-text)]">{money(Number(night.nightly_rate), night.currency)}</span></div>)}</div><div className="mt-2 flex items-center justify-between border-t border-[var(--direct-border)] pt-3 text-xs"><span className="font-semibold text-[var(--direct-text-subtle)]">Accommodation subtotal</span><span className="font-semibold tabular-nums text-[var(--direct-text)]">{money(selectedTotal, selectedPlan.currency)}</span></div></div> : null}
          <div className="mt-4 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface)] p-4">
            <div className="flex items-center justify-between text-xs"><span className="text-[var(--direct-muted)]">Final price calculation</span><span className="text-[11px] text-[var(--direct-muted)]">{quoteLoading ? "Calculating…" : bookingQuote?.quote_expires_at ? `Valid until ${new Date(bookingQuote.quote_expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting guest email"}</span></div>
            {bookingQuote ? <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span>Accommodation</span><span>{money(Number(bookingQuote.accommodation_subtotal ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Extras</span><span>{money(Number(bookingQuote.extras_total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Fees</span><span>{money(Number(bookingQuote.fee_total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Discounts</span><span>−{money(Number(bookingQuote.discount_total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Included taxes</span><span>{money(Number(bookingQuote.taxes ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3"><span>Additional taxes</span><span>{money(Number(bookingQuote.tax_addition ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
              <div className="flex justify-between gap-3 border-t border-[var(--direct-border)] pt-3 text-sm font-semibold text-[var(--direct-text)]"><span>Total</span><span>{money(Number(bookingQuote.total ?? 0), bookingQuote.currency ?? selectedRoom.currency)}</span></div>
            </div> : <p className="mt-2 text-[11px] text-[var(--direct-muted)]">{quoteLoading ? "Resolving published rates, fees, promotions and taxes…" : "Enter a valid email address to resolve the final guest quote."}</p>}
            {quoteError && <p role="alert" className="mt-2 text-[11px] text-red-700">{quoteError}</p>}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[11px] font-semibold text-[var(--direct-text-subtle)]">Full name<input required minLength={2} maxLength={100} value={guestName} onChange={(event) => setGuestName(event.target.value)} className="h-11 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 text-sm font-normal text-[var(--direct-text)] outline-none focus:border-[var(--direct-border-strong)]" placeholder="Your full name"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[var(--direct-text-subtle)]">Email address<input required type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="h-11 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 text-sm font-normal text-[var(--direct-text)] outline-none focus:border-[var(--direct-border-strong)]" placeholder="you@example.com"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[var(--direct-text-subtle)]">Phone number <span className="font-normal text-[var(--direct-muted)]">Optional</span><input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="h-11 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 text-sm font-normal text-[var(--direct-text)] outline-none focus:border-[var(--direct-border-strong)]" placeholder="+255…"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[var(--direct-text-subtle)]">Country <span className="font-normal text-[var(--direct-muted)]">Optional</span><input value={country} onChange={(event) => setCountry(event.target.value)} className="h-11 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] px-3 text-sm font-normal text-[var(--direct-text)] outline-none focus:border-[var(--direct-border-strong)]" placeholder="Country"/></label>
            <label className="grid gap-1.5 text-[11px] font-semibold text-[var(--direct-text-subtle)] sm:col-span-2">Special requests <span className="font-normal text-[var(--direct-muted)]">Optional</span><textarea value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} className="min-h-20 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] p-3 text-sm font-normal text-[var(--direct-text)] outline-none focus:border-[var(--direct-border-strong)]" maxLength={1000} placeholder="Let the property know if you have any requests…"/></label>
          </div>
          {bookingMutation.isError && <p role="alert" className="mt-4 text-xs text-red-700">{(bookingMutation.error as Error).message}</p>}
          <button type="submit" disabled={bookingMutation.isPending || quoteLoading || !bookingQuote?.quote_id} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--direct-primary)] px-5 text-xs font-semibold text-[var(--direct-on-primary)] transition hover:bg-[var(--direct-primary-hover)] disabled:opacity-50">{bookingMutation.isPending ? "Submitting reservation…" : "Request this reservation"}<ArrowRight className="h-4 w-4"/></button>
          <p className="mt-3 text-center text-[11px] text-[var(--direct-muted)]">Your reservation request will be sent to the property for confirmation.</p>
        </form>}

        {confirmation && <section id="booking-confirmation" className="mt-7 scroll-mt-6 rounded-[1.5rem] border border-[var(--direct-primary-soft-border)] bg-[var(--direct-primary-soft)] p-6 sm:p-8">
          <CheckCircle2 className="h-9 w-9 text-[var(--direct-on-primary-soft)]"/><h2 className="direct-display mt-3 text-[1.9rem] font-medium leading-tight text-[var(--direct-text)]">Your reservation is recorded</h2><p className="mt-2 text-sm text-[var(--direct-text-subtle)]">The reservation has been saved to {confirmation.propertyName}.</p>
          <div className="mt-5 grid gap-4 rounded-xl bg-[var(--direct-surface)]/80 p-4 text-sm sm:grid-cols-2"><div><p className="text-[11px] text-[var(--direct-muted)]">BOOKING REFERENCE</p><p className="mt-1 font-semibold">{confirmation.reference}</p></div><div><p className="text-[11px] text-[var(--direct-muted)]">RESERVATION TOTAL</p><p className="mt-1 font-semibold">{money(confirmation.total, confirmation.currency)}</p></div><div><p className="text-[11px] text-[var(--direct-muted)]">PAYMENT STATUS</p><p className="mt-1 font-semibold">Unpaid · No payment gateway</p></div><div><p className="text-[11px] text-[var(--direct-muted)]">PROPERTY</p><p className="mt-1 font-semibold">{confirmation.propertyName}</p></div></div>
          <button type="button" onClick={() => { setConfirmation(null); setSelectedRoom(null); setGuestName(""); setGuestEmail(""); setGuestPhone(""); setCountry(""); setSpecialRequests(""); setAvailableRooms([]); setHasSearched(false); }} className="mt-5 rounded-full border border-[var(--direct-border-strong)] px-5 py-2.5 text-xs font-semibold text-[var(--direct-on-primary-soft)]">Make another reservation</button>
        </section>}

        <DirectOfferBanner offer={branding.offer} className="mt-10 sm:mt-14" />
      </section>

      <footer className="border-t border-[var(--direct-border)] bg-[var(--direct-surface-sunken)] px-5 py-7 text-center">{branding.logoUrl ? <img src={branding.logoUrl} alt={property.name} className="mx-auto h-8 max-w-32 object-contain"/> : <p className="text-sm font-semibold tracking-tight text-[var(--direct-text)]">{property.name}</p>}{branding.showStayNasAttribution && <p className="mt-2 text-[11px] text-[var(--direct-muted)]">Property-owned reservations · Powered by StayNas</p>}</footer>

      {!confirmation && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--direct-border)] bg-[var(--direct-background)]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--direct-muted)]">{selectedRoom ? "Selected room" : "Your stay"}</p><p className="truncate text-xs font-semibold text-[var(--direct-text)]">{selectedRoom ? money(selectedTotal, selectedPlan?.currency ?? selectedRoom.currency) + " · " + selectedRoom.name : `${nights} nights · ${guests} guests`}</p></div>
          <button type="button" onClick={() => selectedRoom ? document.getElementById("guest-details")?.scrollIntoView({ behavior: "smooth", block: "start" }) : runAvailability()} disabled={availabilityMutation.isPending || (selectedRoom === null && nights < 1)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--direct-primary)] px-5 text-xs font-semibold text-[var(--direct-on-primary)] disabled:opacity-50">{selectedRoom ? "Continue" : availabilityMutation.isPending ? "Checking…" : "Find a room"}<ArrowRight className="h-3.5 w-3.5"/></button>
        </div>
      </div>}
    </main>
  );
}
