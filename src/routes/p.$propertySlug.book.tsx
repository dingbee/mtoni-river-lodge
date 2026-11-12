import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { BreadcrumbsBar } from "@/components/site/Breadcrumbs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackGAEvent } from "@/lib/analytics";
import {
  trackAvailabilityChecked,
  trackRoomSelected,
  trackAddOnSelected,
} from "@/lib/analytics";
import {
  checkAvailability,
  createBooking,
  listExtras,
  type AvailabilityRoom,
} from "@/lib/booking.functions";
import { newBookingSessionId } from "@/lib/booking-session";
import { createBookingHold, releaseBookingHold } from "@/lib/availability.functions";
import { getBookingQuote, type BookingPricingQuote } from "@/lib/booking.functions";
import { DatePickerField } from "@/components/os/DatePickerField";
import { validateBookingSearch } from "@/lib/booking-search";
import { getPublicBookingProperty, recordPublicDirectBookingAnalyticsEvent } from "@/domains/booking-campaigns/public-campaign.functions";

export const Route = createFileRoute("/p/$propertySlug/book")({
  loader: ({ params }) => getPublicBookingProperty({ data: { propertySlug: params.propertySlug } }),
  validateSearch: validateBookingSearch,
  head: () => ({
    meta: [
      { title: "Reserve Your Stay — StayNas" },
      {
        name: "description",
        content:
          "Check availability and reserve a room through the StayNas Hospitality Operating System.",
      },
      { property: "og:title", content: "Reserve Your Stay — StayNas" },
      {
        property: "og:description",
        content:
          "Reserve your room through the StayNas Hospitality Operating System.",
      },
    ],
  }),
  component: BookPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) =>
  a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)) : 0;

type Step = "search" | "select" | "guest" | "confirmation";

const STEP_TO_NUM: Record<Step, 1 | 2 | 3 | 4> = {
  search: 1,
  select: 2,
  guest: 3,
  confirmation: 4,
};
const NUM_TO_STEP: Record<1 | 2 | 3 | 4, Step> = {
  1: "search",
  2: "select",
  3: "guest",
  4: "confirmation",
};

type AvailabilityResult = AvailabilityRoom[];

type SelectedExtra = { slug: string; quantity: number };

const STORAGE_KEY = "staynas.booking.wizard.v2";

type PersistedState = {
  sessionId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  childrenBelow6: number;
  children7Plus: number;
  results: AvailabilityResult;
  selectedRoom: AvailabilityRoom | null;
  extras: Array<{ slug: string; name: string; price: number; unit: string; description: string | null; category?: "transfers" | "experiences" }>;
  selectedExtras: SelectedExtra[];
  guest: { name: string; email: string; phone: string; country: string; requests: string; purpose: string };
};

function readPersisted(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedState>) : {};
  } catch (err) {
    console.warn("[book] failed to read persisted wizard state", err);
    return {};
  }
}

function BookPage() {
  const { propertySlug } = Route.useParams();
  const { property, branding } = Route.useLoaderData();
  // Step + session live in the URL so back/forward is always explicit
  // routing, never a browser-history pop into a different session.
  const {
    step: stepNum = 1,
    session: incomingSession,
    room: incomingRoom,
    check_in: incomingCheckIn,
    check_out: incomingCheckOut,
    adults: incomingAdults,
    children_below_6: incomingChildrenBelow6,
    children_7_plus: incomingChildren7Plus,
    campaign,
    offer,
    ratePlan,
    campaignSession,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    utmTerm,
    referrer,
  } = Route.useSearch();
  const validIncomingSession =
    typeof incomingSession === "string" && /^[a-zA-Z0-9_-]{24,120}$/.test(incomingSession)
      ? incomingSession
      : undefined;
  const navigate = Route.useNavigate();
  const step: Step = NUM_TO_STEP[stepNum as 1 | 2 | 3 | 4];

  // Bootstrap: decide on mount whether to resume the persisted draft or
  // start a completely fresh booking session.
  //
  // We ONLY auto-populate the form from sessionStorage when ALL of these
  // hold true:
  //   1. The URL carries a session id.
  //   2. The stored draft's session id matches that URL session id.
  //   3. If the URL carries a room slug, the stored draft is bound to the
  //      same room slug.
  // Any other case (no URL session, mismatched session, mismatched room,
  // or a URL-room that disagrees with the stored draft's room) wipes
  // cached booking data before the form renders — no auto-fill bleed-over
  // between rooms or sessions.
  const bootstrapRef = useRef<{ sessionId: string; state: Partial<PersistedState> } | null>(null);
  if (!bootstrapRef.current) {
    const stored = readPersisted();
    const storedRoomSlug = stored.selectedRoom?.slug;

    const sessionMatches =
      !!validIncomingSession && !!stored.sessionId && stored.sessionId === validIncomingSession;
    const roomMatches = !incomingRoom
      ? true
      : !!storedRoomSlug && storedRoomSlug === incomingRoom;

    const canResume = sessionMatches && roomMatches;

    if (!canResume) {
      try {
        if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY);
      } catch { /* sessionStorage can be unavailable in private browsing contexts */ }
      bootstrapRef.current = {
        sessionId: validIncomingSession ?? newBookingSessionId(),
        state: {},
      };
    } else {
      bootstrapRef.current = {
        sessionId: validIncomingSession!,
        state: stored,
      };
    }
  }
  const p = bootstrapRef.current.state;

  const [sessionId, setSessionId] = useState<string>(bootstrapRef.current.sessionId);
  const [checkIn, setCheckIn] = useState(p.checkIn || incomingCheckIn || "");
  const [checkOut, setCheckOut] = useState(p.checkOut || incomingCheckOut || "");
  const [adults, setAdults] = useState(p.adults ?? incomingAdults ?? 2);
  const [childrenBelow6, setChildrenBelow6] = useState(p.childrenBelow6 ?? incomingChildrenBelow6 ?? 0);
  const [children7Plus, setChildren7Plus] = useState(p.children7Plus ?? incomingChildren7Plus ?? 0);
  const [results, setResults] = useState<AvailabilityResult>(p.results ?? []);
  const [selectedRoom, setSelectedRoom] = useState<AvailabilityRoom | null>(p.selectedRoom ?? null);
  const [extras, setExtras] = useState<Array<{ slug: string; name: string; price: number; unit: string; description: string | null; category?: "transfers" | "experiences" }>>(p.extras ?? []);
  const [selectedExtras, setSelectedExtras] = useState<SelectedExtra[]>(p.selectedExtras ?? []);
  const [guest, setGuest] = useState(p.guest ?? { name: "", email: "", phone: "", country: "", requests: "", purpose: "" });
  const [confirmation, setConfirmation] = useState<{ reference: string; total: number; currency: string; paymentStatus: "unpaid"; paymentState: "not_configured" } | null>(null);
  const [bookingQuote, setBookingQuote] = useState<BookingPricingQuote | null>(p.selectedRoom?.pricing_quote ?? null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromoCode, setAppliedPromoCode] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [hold, setHold] = useState<{ id: string; expiresAt: string; roomSlug: string } | null>(null);
  const [roomInventory, setRoomInventory] = useState<{ available_units: number; total_units: number } | null>(null);

  useEffect(() => {
    if (!sessionId || pageViewRecordedFor.current === sessionId) return;
    pageViewRecordedFor.current = sessionId;
    const eventId = window.crypto.randomUUID();
    pageViewEventId.current = eventId;
    recordPageViewFn({
      data: {
        propertySlug,
        sessionKey: sessionId,
        eventId,
        source: utmSource,
        medium: utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        referrer,
        landingPage: `/p/${propertySlug}/book`,
      },
    }).catch((error) => console.warn("[StayNas analytics] Booking page view could not be recorded", error));
  }, [propertySlug, sessionId, recordPageViewFn, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer]);

  useEffect(() => {
    const slug = selectedRoom?.slug ?? incomingRoom;
    if (!slug) { setRoomInventory(null); return; }
    let cancelled = false;
    fetch("/api/public/rooms/status")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("availability unavailable")))
      .then((payload) => {
        if (cancelled) return;
        const item = payload.rooms?.find((r: { slug: string }) => r.slug === slug);
        const dateRangeResult = results.find((r) => r.slug === slug);
        if (item) {
          setRoomInventory({
            available_units: dateRangeResult ? Number(dateRangeResult.min_available ?? 0) : Number(item.available_units ?? 0),
            total_units: Number(item.total_units ?? 0),
          });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [incomingRoom, selectedRoom?.slug, results]);

  // Mirror critical state in refs so the validation guard can read the
  // freshest values immediately after a navigate(), even if React hasn't
  // flushed the setState batch yet. Without this, the router store update
  // triggered by goToStep() can re-render with the new step before the
  // setResults()/setSelectedRoom() updates commit, which the guard then
  // misreads as "missing prerequisites" and bounces the user back to step 1.
  const resultsRef = useRef(results);
  const selectedRoomRef = useRef(selectedRoom);
  const checkInRef = useRef(checkIn);
  const checkOutRef = useRef(checkOut);
  const confirmationRef = useRef(confirmation);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => { selectedRoomRef.current = selectedRoom; }, [selectedRoom]);
  useEffect(() => { checkInRef.current = checkIn; }, [checkIn]);
  useEffect(() => { checkOutRef.current = checkOut; }, [checkOut]);
  useEffect(() => { confirmationRef.current = confirmation; }, [confirmation]);

  // If the URL session id changes while we're already mounted (e.g. the user
  // clicks "Check Availability" from a different room without a full reload),
  // wipe all wizard state and adopt the new session.
  useEffect(() => {
    if (!validIncomingSession || validIncomingSession === sessionId) return;
    try {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* sessionStorage can be unavailable in private browsing contexts */ }
    setSessionId(validIncomingSession);
    setCheckIn("");
    setCheckOut("");
    setAdults(2);
    setChildrenBelow6(0);
    setChildren7Plus(0);
    setResults([]);
    setSelectedRoom(null);
    setBookingQuote(null);
    setExtras([]);
    setSelectedExtras([]);
    setGuest({ name: "", email: "", phone: "", country: "", requests: "", purpose: "" });
    setConfirmation(null);
  }, [validIncomingSession, sessionId, incomingRoom]);

  // Single source of truth for step transitions — writes the step to the URL
  // via navigate(). Never relies on window.history.back / navigate(-1), so
  // the "back" buttons always route to a known step of the same session.
  const prevStepRef = useRef<Step>(step);
  const goToStep = useCallback(
    (next: Step, reason: string) => {
      const prev = prevStepRef.current;
      if (prev !== next) {
        trackGAEvent("booking_funnel_step", {
          event_category: "conversion",
          from_step: prev,
          to_step: next,
          reason,
        });
      }
      prevStepRef.current = next;
      void navigate({
        // Preserve session/room so the bootstrap + validation guards keep
        // recognising this as the same booking flow across step changes.
        search: (prev: Record<string, unknown>) => ({ ...prev, step: STEP_TO_NUM[next] }),
        replace: false,
        // Step transitions happen in-place — never scroll to top, the user
        // is mid-form and expects to stay where they are.
        resetScroll: false,
      });
    },
    [navigate]
  );

  // Keep prevStepRef in sync if the URL changes from outside goToStep
  // (e.g. user edits ?step= manually, or lands via a deep link).
  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

  // Funnel entry — fires once per mount so we can measure drop-off from the
  // step a guest lands on (e.g. resumed from sessionStorage vs. fresh search).
  useEffect(() => {
    trackGAEvent("booking_funnel_enter", {
      event_category: "conversion",
      entry_step: step,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist wizard state on every meaningful change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const snapshot: PersistedState = {
        sessionId,
        checkIn, checkOut, adults, children: childrenBelow6 + children7Plus,
        childrenBelow6, children7Plus,
        results, selectedRoom, extras, selectedExtras, guest,
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.warn("[book] failed to persist wizard state", err);
    }
  }, [sessionId, checkIn, checkOut, adults, childrenBelow6, children7Plus, results, selectedRoom, extras, selectedExtras, guest]);

  // Validation guard: if the user lands on a step whose prerequisites are
  // missing, or if the session/room context does not match the persisted state,
  // redirect to step 1 automatically so no stale / broken booking UI is shown.
  useEffect(() => {
    // Run on the next tick so any in-flight setState batch from a forward
    // navigation (e.g. search.onSuccess → setResults + goToStep) has flushed
    // before we evaluate prerequisites. Read from refs to avoid a stale
    // snapshot if the URL changed before state committed.
    const id = window.setTimeout(() => {
      let target: Step | null = null;
      const curResults = resultsRef.current;
      const curRoom = selectedRoomRef.current;
      const curIn = checkInRef.current;
      const curOut = checkOutRef.current;
      const curConfirm = confirmationRef.current;

      if (step === "confirmation" && !curConfirm) {
        target = "search";
      } else if (step === "guest" && !curRoom) {
        target = curResults.length > 0 ? "select" : "search";
      } else if ((step === "select" || step === "guest") && (!curIn || !curOut)) {
        target = "search";
      } else if (step === "select" && curResults.length === 0) {
        target = "search";
      }

      if (target && target !== step) {
        void navigate({
          search: (prev: Record<string, unknown>) => ({ ...prev, step: STEP_TO_NUM[target!] }),
          replace: true,
          resetScroll: false,
        });
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [step, confirmation, selectedRoom, checkIn, checkOut, results.length, navigate]);

  const nights = nightsBetween(checkIn, checkOut);
  const totalOccupants = adults + childrenBelow6 + children7Plus;
  const paidOccupants = adults + children7Plus;

  const recordPageViewFn = useServerFn(recordPublicDirectBookingAnalyticsEvent);
  const pageViewRecordedFor = useRef("");
  const pageViewEventId = useRef<string | null>(null);
  const checkAvailabilityFn = useServerFn(checkAvailability);
  const getBookingQuoteFn = useServerFn(getBookingQuote);
  const listExtrasFn = useServerFn(listExtras);
  const createBookingFn = useServerFn(createBooking);
  const createHoldFn = useServerFn(createBookingHold);
  const releaseHoldFn = useServerFn(releaseBookingHold);

  const search = useMutation({
    mutationFn: async () => {
      if (nights < 1) throw new Error("Pick a check-in and check-out date");
      const [rooms, extrasList] = await Promise.all([
        checkAvailabilityFn({ data: {
          checkIn, checkOut, guests: totalOccupants, adults, childrenBelow6, children7Plus,
          propertySlug, campaignSlug: campaign, offerId: offer, ratePlanId: ratePlan,
          sessionKey: campaign ? (campaignSession ?? sessionId) : sessionId,
          utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer,
        } }),
        listExtrasFn(),
      ]);
      return { rooms, extrasList };
    },
    onSuccess: ({ rooms, extrasList }) => {
      setResults(rooms);
      setSelectedRoom(null);
      setBookingQuote(null);
      setSelectedExtras([]);
      setExtras(extrasList);
      trackAvailabilityChecked({
        check_in: checkIn,
        check_out: checkOut,
        guests: totalOccupants,
        nights,
        available_rooms: rooms.filter((r) => r.is_available).length,
        total_rooms: rooms.length,
      });
      goToStep("select", "availability_search_success");
    },
    onError: (err: Error) => {
      console.error("[book] availability search failed", err);
      toast.error(err.message);
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedRoom) throw new Error("Select a room first");
      if (!bookingQuote?.quote_id) throw new Error("A current accepted-price quote is required before booking.");
      if (bookingQuote.quote_expires_at && Date.parse(bookingQuote.quote_expires_at) <= Date.now()) throw new Error("Your quote expired. Review the refreshed price before booking.");
      const created = await createBookingFn({
        data: {
          quoteId: bookingQuote.quote_id,
          roomSlug: selectedRoom.slug,
          ratePlanId: selectedRoom.selected_rate_plan_id,
          promoCode: appliedPromoCode || undefined,
          checkIn,
          checkOut,
          adults,
          children: childrenBelow6 + children7Plus,
          childrenBelow6,
          children7Plus,
          guestName: guest.name,
          guestEmail: guest.email,
          guestPhone: guest.phone,
          country: guest.country,
          specialRequests: guest.requests,
          visitPurpose: guest.purpose,
          extras: selectedExtras,
          holdId: hold && hold.roomSlug === selectedRoom.slug ? hold.id : undefined,
          sessionId,
          propertySlug, campaignSlug: campaign, offerId: offer,
          sessionKey: campaign ? (campaignSession ?? sessionId) : sessionId,
          utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer,
        },
      });
      trackGAEvent("reservation_request_submitted", {
        transaction_id: created.reference,
        currency: created.currency,
        value: created.total,
      });
      return created;
    },
    onSuccess: (res) => {
      setConfirmation({
        reference: res.reference,
        total: res.total,
        currency: res.currency,
        paymentStatus: res.paymentStatus,
        paymentState: res.paymentState,
      });
      try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* sessionStorage can be unavailable in private browsing contexts */ }
      goToStep("confirmation", "booking_submit_success");
    },
    onError: async (err: Error) => {
      console.error("[book] reservation submission failed", err);
      if (err.message.includes("[QUOTE_STALE]") || err.message.includes("[QUOTE_EXPIRED]")) {
        try {
          const refreshed = await getBookingQuoteFn({
            data: {
              roomSlug: selectedRoom?.slug ?? "",
              ratePlanId: selectedRoom?.selected_rate_plan_id,
              promoCode: appliedPromoCode || undefined,
              guestEmail: validGuestEmailForQuote || undefined,
              checkIn, checkOut, adults, childrenBelow6, children7Plus,
              extras: selectedExtras,
              propertySlug, campaignSlug: campaign, offerId: offer,
              sessionKey: campaign ? (campaignSession ?? sessionId) : sessionId,
              utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer,
            },
          });
          setBookingQuote(refreshed as BookingPricingQuote);
          setQuoteError("The previous quote was no longer valid. Review this updated total and submit again to accept it.");
          toast.error("Price refreshed. Review the updated quote before continuing.");
          return;
        } catch (refreshError) {
          setBookingQuote(null);
          setQuoteError(refreshError instanceof Error ? refreshError.message : "A fresh quote could not be calculated.");
        }
      }
      toast.error(err.message);
    },
  });

  // Persist an authoritative quote for the exact guest selection. The server
  // binds booking creation to this quote and rejects expired or stale prices.
  const validGuestEmailForQuote = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(guest.email.trim()) ? guest.email.trim() : "";
  useEffect(() => {
    if (!selectedRoom || nights < 1) {
      setBookingQuote(null);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setBookingQuote(null);
    getBookingQuoteFn({
      data: {
        roomSlug: selectedRoom.slug,
        ratePlanId: selectedRoom.selected_rate_plan_id,
        promoCode: appliedPromoCode || undefined,
        guestEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim()) ? guest.email.trim() : undefined,
        checkIn,
        checkOut,
        adults,
        childrenBelow6,
        children7Plus,
        extras: selectedExtras,
        propertySlug, campaignSlug: campaign, offerId: offer,
        sessionKey: campaign ? (campaignSession ?? sessionId) : sessionId,
        utmSource, utmMedium, utmCampaign, utmContent, utmTerm, referrer,
      },
    }).then((quote) => {
      if (!cancelled) {
        setBookingQuote(quote as BookingPricingQuote);
        setQuoteError("");
        setQuoteLoading(false);
      }
    }).catch((error) => {
      if (!cancelled) {
        setBookingQuote(null);
        setQuoteError(error instanceof Error ? error.message : "Promotion or pricing could not be validated");
        setQuoteLoading(false);
        console.error("[book] authoritative pricing quote failed", error);
      }
    });
    return () => { cancelled = true; };
  }, [getBookingQuoteFn, selectedRoom, checkIn, checkOut, adults, childrenBelow6, children7Plus, selectedExtras, appliedPromoCode, validGuestEmailForQuote, nights]);

  const effectiveQuote = bookingQuote ?? selectedRoom?.pricing_quote ?? null;
  const roomTotal = Number(effectiveQuote?.accommodation_subtotal ?? 0);
  const extrasTotal = Number(effectiveQuote?.extras_total ?? 0);
  const grandTotal = Number(effectiveQuote?.total ?? (roomTotal + extrasTotal));

  return (
    <div className="min-h-screen bg-ivory text-charcoal">
      <header className="border-b border-charcoal/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {branding.logo_url ? <img src={branding.logo_url} alt={property.name} className="h-9 max-w-40 object-contain" /> : <span className="text-sm font-semibold">{property.name}</span>}
            {branding.tagline && <span className="hidden text-xs text-muted-foreground sm:inline">{branding.tagline}</span>}
          </div>
          <span className="text-xs text-muted-foreground">Secure direct booking · {property.currency}</span>
        </div>
      </header>
      <main>
        <section className="min-w-0 overflow-hidden border-b border-charcoal/10 bg-ivory px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-16">
          <div className="mx-auto grid min-w-0 max-w-7xl gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-10 lg:items-end">
            <div>
              <BreadcrumbsBar />
              <p className="mt-8 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-charcoal/55">{property.name} · Direct reservations</p>
              <h1 className="mt-4 max-w-full break-words font-display text-[clamp(2.25rem,7.5vw,3.75rem)] leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Reserve Your Stay at {property.name}</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-charcoal/65 sm:mt-5 sm:text-lg">Select your dates and guests to check real-time availability and published rates.</p>
              <Stepper step={step} />
            </div>
            <SelectedRoomCard room={selectedRoom ?? results.find((r) => r.slug === incomingRoom) ?? null} inventory={roomInventory} />
          </div>
        </section>
        <section className="mx-auto w-full min-w-0 max-w-7xl px-4 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
          <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10 lg:items-start">
            <div>

          {step === "search" && (
            <SearchStep
              checkIn={checkIn} checkOut={checkOut}
              adults={adults} childrenBelow6={childrenBelow6} children7Plus={children7Plus}
              setCheckIn={setCheckIn} setCheckOut={setCheckOut}
              setAdults={setAdults}
              setChildrenBelow6={setChildrenBelow6}
              setChildren7Plus={setChildren7Plus}
              nights={nights}
              loading={search.isPending}
              onSearch={() => search.mutate()}
            />
          )}

          {step === "select" && (
            <SelectStep
              results={results}
              adults={adults}
              childrenBelow6={childrenBelow6}
              children7Plus={children7Plus}
              nights={nights}
              onBack={() => goToStep("search", "user_back_from_select")}
              onSelect={(r, ratePlanId) => {
                // The "room context" for this session is whichever room the
                // session is currently bound to: either the previously
                // selected room, or the URL ?room= slug the user arrived with.
                const currentRoomContext = selectedRoom?.slug ?? incomingRoom ?? null;

                // First-time pick, or re-picking the same room the session is
                // already bound to — just proceed to guest details.
                if (!currentRoomContext || currentRoomContext === r.slug) {
                  const roomWithPlan = { ...r, selected_rate_plan_id: ratePlanId, selected_rate_plan: r.rate_plan_options?.find((plan) => plan.rate_plan_id === ratePlanId) ?? (r.rate_plan_options?.length === 1 ? r.rate_plan_options[0] : undefined) };
                  setSelectedRoom(roomWithPlan);
                  setBookingQuote(r.pricing_quote);
                  // Fire-and-forget hold acquisition — 15-minute inventory lock.
                  // Failures are non-blocking; createBooking still runs the same
                  // atomic availability check server-side.
                  void createHoldFn({
                    data: {
                      roomSlug: r.slug,
                      checkIn,
                      checkOut,
                      sessionId,
                      guestEmail: guest.email || undefined,
                    },
                  })
                    .then((h) => setHold({ id: h.holdId, expiresAt: h.expiresAt, roomSlug: r.slug }))
                    .catch((e) => {
                      console.warn("[book] hold acquire failed", e);
                    });
                  trackRoomSelected({
                    room_slug: r.slug,
                    room_name: r.name,
                    nightly_total: Number(roomWithPlan.selected_rate_plan?.total ?? r.pricing_quote?.total ?? 0) / Math.max(1, nights),
                    currency: r.currency,
                  });
                  // Keep the URL ?room= in sync so refreshes stay consistent.
                  void navigate({
                    search: { step: STEP_TO_NUM.guest, session: sessionId, room: r.slug },
                    resetScroll: false,
                  });
                  prevStepRef.current = "guest";
                  trackGAEvent("booking_funnel_step", {
                    event_category: "conversion",
                    from_step: "select",
                    to_step: "guest",
                    reason: "user_selected_room",
                  });
                  return;
                }
                // Switching to a genuinely different room mid-flow — wipe the
                // stored draft and start a brand-new booking session bound to
                // the new room, routed back to step 1.
                try {
                  if (typeof window !== "undefined")
                    window.sessionStorage.removeItem(STORAGE_KEY);
                } catch { /* sessionStorage can be unavailable in private browsing contexts */ }
                if (hold) {
                  void releaseHoldFn({ data: { holdId: hold.id, sessionId } }).catch(() => undefined);
                  setHold(null);
                }
                const fresh = newBookingSessionId();
                trackGAEvent("booking_room_switch_reset", {
                  event_category: "conversion",
                  from_room: currentRoomContext,
                  to_room: r.slug,
                  new_session: fresh,
                });
                void navigate({
                  to: "/p/$propertySlug/book",
                  params: { propertySlug },
                  search: { step: 1, session: fresh, room: r.slug },
                });
              }}
            />
          )}

          {step === "guest" && selectedRoom && (
            <GuestStep
              room={selectedRoom} nights={nights}
              totalOccupants={totalOccupants}
              paidOccupants={paidOccupants}
              childrenBelow6={childrenBelow6}
              breakdown={effectiveQuote}
              pricingLoading={quoteLoading || !bookingQuote}
              extras={extras} selectedExtras={selectedExtras} setSelectedExtras={setSelectedExtras}
              roomTotal={roomTotal} extrasTotal={extrasTotal} grandTotal={grandTotal}
              promoCodeInput={promoCodeInput} setPromoCodeInput={setPromoCodeInput}
              appliedPromoCode={appliedPromoCode} quoteError={quoteError}
              onApplyPromo={() => setAppliedPromoCode(promoCodeInput.trim().toUpperCase())}
              onRemovePromo={() => { setAppliedPromoCode(""); setPromoCodeInput(""); }}
              guest={guest} setGuest={setGuest}
              submitting={submit.isPending}
              onBack={() => goToStep("select", "user_back_from_guest")}
              onSubmit={() => submit.mutate()}
            />
          )}

          {step === "guest" && !selectedRoom && (
            <div className="rounded-2xl border border-charcoal/10 bg-ivory p-8 text-center">
              <p className="text-sm text-charcoal/70">
                Your room selection was lost. Please pick a room again to continue — your dates and details are preserved.
              </p>
              <button
                onClick={() => goToStep(results.length > 0 ? "select" : "search", "recover_missing_room")}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-charcoal px-5 py-2.5 text-[0.7rem] uppercase tracking-[0.24em] hover:bg-charcoal hover:text-ivory"
              >
                Choose a room →
              </button>
            </div>
          )}

          {step === "confirmation" && confirmation && selectedRoom && (
            <ConfirmationStep
              confirmation={confirmation}
              room={selectedRoom}
              checkIn={checkIn} checkOut={checkOut} nights={nights}
              guestName={guest.name} guestEmail={guest.email}
            />
          )}

          <div className="mt-12 border-t border-charcoal/10 pt-8 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-charcoal/45">StayNas Hospitality Operating System</p>
            <p className="mt-3 text-sm text-charcoal/55">
              Need assistance? Open <span className="font-medium text-charcoal">StayNas AI Concierge</span> for intelligent guest support.
            </p>
            <p className="mt-5 text-[0.7rem] text-charcoal/45">
              By booking you agree to our{" "}
              <Link to="/terms" className="underline underline-offset-4 hover:text-charcoal">Terms &amp; Conditions</Link>.
            </p>
          </div>
            </div>
            <aside className="hidden lg:block">
              <div className="sticky top-28 rounded-[24px] border border-charcoal/10 bg-bone p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-burgundy">A smoother journey</p>
                <h2 className="mt-3 font-display text-3xl leading-tight">Plan with confidence.</h2>
                <div className="mt-6 space-y-5 text-sm text-charcoal/70">
                  <p><strong className="block text-charcoal">Flexible cancellation</strong>Plans change. Cancellation rules are shown before confirmation.</p>
                  <p><strong className="block text-charcoal">Best available rate</strong>Property pricing is configured directly in StayNas.</p>
                  <p><strong className="block text-charcoal">StayNas AI</strong>Intelligent assistance throughout the guest journey.</p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooterMinimal />
    </div>
  );
}

function SelectedRoomCard({ room, inventory }: { room: AvailabilityRoom | null; inventory: { available_units: number; total_units: number } | null }) {
  if (!room) return (
    <div className="min-w-0 rounded-2xl border border-charcoal/10 bg-bone p-5 shadow-sm sm:p-6">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-burgundy">Selected room</p>
      <p className="mt-3 break-words font-display text-xl font-medium leading-snug sm:text-2xl">Choose a room to continue</p>
      <p className="mt-2 break-words text-sm leading-6 text-charcoal/60">Room details will appear here once availability is checked.</p>
    </div>
  );
  const availability = inventory ? inventory.available_units + " of " + inventory.total_units + " available" : room.min_available > 0 ? room.min_available + " available for these dates" : "Live availability after dates are checked";
  return (
    <div className="rounded-[24px] border border-charcoal/10 bg-bone p-7 shadow-deep">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-burgundy">Selected room</p>
      <h2 className="mt-3 break-words font-display text-xl font-medium leading-snug sm:text-2xl">{room.name}</h2>
      <p className="mt-3 text-sm text-charcoal/65">Sleeps up to {room.max_occupancy} · {room.selected_rate_plan ? `${room.selected_rate_plan.currency} ${(Number(room.selected_rate_plan.total) / Math.max(1, room.selected_rate_plan.nightly_breakdown?.length ?? 1)).toLocaleString()} / night` : room.pricing_quote?.ok ? `${room.currency} ${Number(room.pricing_quote.nightly?.[0]?.nightly_rate ?? 0).toLocaleString()} / night` : "Price confirmed from the selected published rate plan"}</p>
      <div className="mt-5 border-t border-charcoal/10 pt-5">
        <div className="flex items-end justify-between gap-3"><p className="font-display text-xl">{availability}</p>{inventory && <span className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-forest">Live</span>}</div>
        {inventory && inventory.total_units > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-charcoal/10"><div className="h-full rounded-full bg-forest transition-all duration-500" style={{ width: Math.max(0, Math.min(100, (inventory.available_units / inventory.total_units) * 100)) + "%" }} /></div>}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Array<{ k: Step; label: string }> = [
    { k: "search", label: "Dates" },
    { k: "select", label: "Room" },
    { k: "guest", label: "Details" },
    { k: "confirmation", label: "Confirmation" },
  ];
  const idx = steps.findIndex((s) => s.k === step);
  return (
    <div className="mt-7 grid w-full max-w-xl grid-cols-4 gap-2 sm:mt-8 sm:gap-3">
      {steps.map((s, i) => (
        <div key={s.k} className="flex min-w-0 flex-col items-center gap-2 text-center">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i <= idx ? "bg-charcoal text-ivory" : "bg-charcoal/10 text-charcoal/50"}`}>
            {i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`max-w-full break-words text-[0.62rem] font-medium uppercase leading-tight tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${i <= idx ? "text-charcoal" : "text-charcoal/50"}`}>{s.label === "Confirmation" ? "Confirm" : s.label}</span>
          
        </div>
      ))}
    </div>
  );
}

const field = "w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm text-charcoal placeholder:text-charcoal/40 outline-none focus:border-charcoal focus:ring-2 focus:ring-charcoal/15";
const labelCls = "text-xs font-medium uppercase tracking-[0.14em] text-charcoal/75";

function SearchStep(props: {
  checkIn: string; checkOut: string;
  adults: number; childrenBelow6: number; children7Plus: number;
  nights: number; loading: boolean;
  setCheckIn: (v: string) => void; setCheckOut: (v: string) => void;
  setAdults: (v: number) => void;
  setChildrenBelow6: (v: number) => void;
  setChildren7Plus: (v: number) => void;
  onSearch: () => void;
}) {
  const totalOccupants = props.adults + props.childrenBelow6 + props.children7Plus;
  const ADULT_MAX = 5;
  const CHILD_MAX = 5;
  return (
    <div className="min-w-0 space-y-5 rounded-2xl border border-charcoal/10 bg-ivory p-5 shadow-sm sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Check-in</label>
          <DatePickerField
            value={props.checkIn}
            minDate={today()}
            onChange={props.setCheckIn}
            placeholder="Select check-in"
            className={`mt-2 h-auto ${field}`}
          />
        </div>
        <div>
          <label className={labelCls}>Check-out</label>
          <DatePickerField
            value={props.checkOut}
            minDate={props.checkIn || today()}
            onChange={props.setCheckOut}
            placeholder="Select check-out"
            className={`mt-2 h-auto ${field}`}
          />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Adults</label>
          <select
            className={`mt-2 ${field}`}
            value={props.adults}
            onChange={(e) => props.setAdults(Number(e.target.value))}
            required
          >
            {Array.from({ length: ADULT_MAX }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Children (under 6)</label>
          <select
            className={`mt-2 ${field}`}
            value={props.childrenBelow6}
            onChange={(e) => props.setChildrenBelow6(Number(e.target.value))}
          >
            {Array.from({ length: CHILD_MAX + 1 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-charcoal/50">Stay free</p>
        </div>
        <div>
          <label className={labelCls}>Children (7 & up)</label>
          <select
            className={`mt-2 ${field}`}
            value={props.children7Plus}
            onChange={(e) => props.setChildren7Plus(Number(e.target.value))}
          >
            {Array.from({ length: CHILD_MAX + 1 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-charcoal/50">Count as occupants</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-dashed border-charcoal/20 bg-bone/30 px-4 py-3">
        <span className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/60">Total occupants</span>
        <span className="font-display text-lg">{totalOccupants}</span>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-dashed border-charcoal/20 bg-bone/30 px-4 py-3">
        <span className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/60">Length of stay</span>
        <span className="font-display text-lg">{props.nights > 0 ? `${props.nights} Night${props.nights === 1 ? "" : "s"}` : "—"}</span>
      </div>
      <button
        onClick={props.onSearch} disabled={props.loading}
        className="group mt-2 inline-flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_18px_40px_-18px_rgba(52,103,57,0.7)] transition-all hover:brightness-110 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #0F3D3A 0%, #0F3D3A 100%)" }}
      >
        {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {props.loading ? "Checking availability…" : "Check Availability"}
      </button>
    </div>
  );
}

function SelectStep({ results, adults, childrenBelow6, children7Plus, nights, onBack, onSelect }: {
  results: AvailabilityResult;
  adults: number; childrenBelow6: number; children7Plus: number;
  nights: number;
  onBack: () => void; onSelect: (r: AvailabilityRoom, ratePlanId?: string) => void;
}) {
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});
  const fmt = (n: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);
  const totalOccupants = adults + childrenBelow6 + children7Plus;
  const paidOccupants = adults + children7Plus;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs uppercase tracking-[0.22em] text-charcoal/60 hover:text-charcoal">← Change dates</button>
      {results.map((r) => {
        const fits = Boolean(r.fits_occupancy);
        const disabled = !r.is_available || !fits;
        // Centralized pricing: per-guest, per-night.
        const options = r.rate_plan_options ?? [];
        const selectedPlanId = selectedPlans[r.room_id] ?? "";
        const selectedPlan = options.find((p) => p.rate_plan_id === selectedPlanId) ?? (options.length === 1 ? options[0] : undefined);
        const requiresPlanChoice = r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED";
        const displayTotal = Number(selectedPlan?.total ?? r.pricing_quote?.total ?? r.nightly_total ?? 0);
        const nightlyRate = selectedPlan ? Number(selectedPlan.total) / Math.max(1, nights) : Number(r.pricing_quote?.nightly?.[0]?.nightly_rate ?? 0);
        return (
          <div key={r.room_id} className="flex flex-col gap-4 rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-xl">{r.name}</h3>
              <p className="mt-1 text-sm text-charcoal/60">Sleeps up to {r.max_occupancy} · {r.min_available > 0 ? `${r.min_available} unit${r.min_available === 1 ? "" : "s"} available` : "Sold out"}</p>
              {!fits && <p className="mt-1 text-xs text-red-600">Does not fit {totalOccupants} occupant{totalOccupants === 1 ? "" : "s"}</p>}
            </div>
            <div className="text-right">
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/60">{nights} night{nights === 1 ? "" : "s"} · accommodation subtotal</p>
              {requiresPlanChoice && options.length === 0 ? (
                <p className="font-display text-base text-red-700">Rate plans unavailable — please try again</p>
              ) : requiresPlanChoice && options.length > 1 && !selectedPlan ? (
                <p className="font-display text-base text-charcoal/65">Choose a rate plan to view the total</p>
              ) : (
                <p className="font-display text-2xl">{fmt(displayTotal, selectedPlan?.currency ?? r.currency)}</p>
              )}
              {options.length > 1 && (
                <div className="mt-3 text-left">
                  <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-charcoal/60">Choose rate plan</label>
                  <select value={selectedPlanId} onChange={(e) => setSelectedPlans((current) => ({ ...current, [r.room_id]: e.target.value }))} className="mt-2 w-full rounded-lg border border-charcoal/20 bg-ivory px-3 py-2 text-sm">
                    <option value="">Select a rate plan</option>
                    {options.map((plan) => <option key={plan.rate_plan_id} value={plan.rate_plan_id}>{plan.name} — {fmt(Number(plan.total), plan.currency)}</option>)}
                  </select>
                  {selectedPlan?.description && <p className="mt-2 text-xs text-charcoal/60">{selectedPlan.description}</p>}
                  {selectedPlan && <p className="mt-1 text-xs text-charcoal/55">{selectedPlan.meal_plan ?? "No meal plan"} · {selectedPlan.refundable ? "Refundable" : "Non-refundable"}</p>}
                  {selectedPlan && <p className="mt-1 text-[0.65rem] text-charcoal/50">Taxes and selected extras are calculated in the next step.</p>}
                </div>
              )}
              {options.length === 1 && selectedPlan && (
                <p className="mt-2 text-xs text-charcoal/55">{selectedPlan.name} · {selectedPlan.meal_plan ?? "No meal plan"} · {selectedPlan.refundable ? "Refundable" : "Non-refundable"}</p>
              )}
              <p className="text-xs text-charcoal/55">{requiresPlanChoice && !selectedPlan ? "Select a rate plan to see nightly pricing" : `${fmt(nightlyRate, selectedPlan?.currency ?? r.currency)} average / night`} · {paidOccupants} paid · {totalOccupants} total</p>
              <button
                onClick={() => onSelect(r, selectedPlanId || undefined)} disabled={disabled || (requiresPlanChoice && options.length === 0) || (options.length > 1 && !selectedPlanId)}
                className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #0F3D3A 0%, #0F3D3A 100%)" }}
              >
                {!r.is_available ? "Unavailable" : options.length > 1 && !selectedPlanId ? "Choose a rate plan" : "Select"} →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GuestStep(props: {
  room: AvailabilityRoom; nights: number;
  totalOccupants: number; paidOccupants: number; childrenBelow6: number;
  breakdown: BookingPricingQuote | null;
  pricingLoading: boolean;
  extras: Array<{ slug: string; name: string; price: number; unit: string; description: string | null; category?: "transfers" | "experiences" }>;
  selectedExtras: SelectedExtra[]; setSelectedExtras: (v: SelectedExtra[]) => void;
  roomTotal: number; extrasTotal: number; grandTotal: number;
  promoCodeInput: string; setPromoCodeInput: (value: string) => void;
  appliedPromoCode: string; quoteError: string;
  onApplyPromo: () => void; onRemovePromo: () => void;
  guest: { name: string; email: string; phone: string; country: string; requests: string; purpose: string };
  setGuest: (g: { name: string; email: string; phone: string; country: string; requests: string; purpose: string }) => void;
  submitting: boolean;
  onBack: () => void; onSubmit: () => void;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: props.room.currency, maximumFractionDigits: 0 }).format(n);
  const toggleExtra = (slug: string) => {
    const existing = props.selectedExtras.find((s) => s.slug === slug);
    const extra = props.extras.find((e) => e.slug === slug);
    if (existing) {
      props.setSelectedExtras(props.selectedExtras.filter((s) => s.slug !== slug));
      trackAddOnSelected({ slug, name: extra?.name, price: extra?.price, action: "removed" });
    } else {
      props.setSelectedExtras([...props.selectedExtras, { slug, quantity: 1 }]);
      trackAddOnSelected({ slug, name: extra?.name, price: extra?.price, action: "added" });
    }
  };
  const unitLabel = (unit: string) => {
    switch (unit) {
      case "per_stay": return "per booking";
      case "per_night": return "per night";
      case "per_person": return "per person";
      case "per_person_per_night": return "per person / night";
      default: return unit.replaceAll("_", " ");
    }
  };
  const transfers = props.extras.filter((e) => (e.category ?? "experiences") === "transfers");
  const experiences = props.extras.filter((e) => (e.category ?? "experiences") === "experiences");
  const renderExtra = (e: typeof props.extras[number]) => {
    const checked = !!props.selectedExtras.find((s) => s.slug === e.slug);
    return (
      <label key={e.slug} className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4 transition ${checked ? "border-charcoal/40 bg-bone/40" : "border-charcoal/10"}`}>
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={checked} onChange={() => toggleExtra(e.slug)} className="mt-1" />
          <div>
            <p className="font-medium">{e.name}</p>
            {e.description && <p className="mt-0.5 text-xs text-charcoal/60">{e.description}</p>}
          </div>
        </div>
        <span className="whitespace-nowrap text-right text-sm">
          {fmt(e.price)}
          <span className="block text-[0.65rem] uppercase tracking-[0.16em] text-charcoal/55">{unitLabel(e.unit)}</span>
        </span>
      </label>
    );
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <button onClick={props.onBack} className="text-xs uppercase tracking-[0.22em] text-charcoal/60 hover:text-charcoal">← Change room</button>

        <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:p-8">
          <h3 className="font-display text-xl">Add Extras</h3>
          <p className="mt-1 text-xs text-charcoal/60">Optional services to elevate your stay. Select as many as you like.</p>
          {transfers.length > 0 && (
            <div className="mt-6">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">Transfers</p>
              <div className="mt-3 space-y-3">{transfers.map(renderExtra)}</div>
            </div>
          )}
          {experiences.length > 0 && (
            <div className="mt-6">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70">Experiences</p>
              <div className="mt-3 space-y-3">{experiences.map(renderExtra)}</div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:p-8">
          <h3 className="font-display text-xl">Promotion code(s)</h3>
          <p className="mt-1 text-xs text-charcoal/60">Enter a property-issued code. Multiple codes can be comma-separated when each offer permits stacking.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Promotion code" value={props.promoCodeInput} onChange={(e) => props.setPromoCodeInput(e.target.value)} maxLength={64} className="w-full flex-1 rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm uppercase text-charcoal outline-none focus:border-charcoal" placeholder="CODE or CODE1,CODE2" disabled={!!props.appliedPromoCode}/>
            {props.appliedPromoCode ? <button type="button" onClick={props.onRemovePromo} className="rounded-lg border border-charcoal/20 px-4 py-3 text-xs font-semibold uppercase tracking-wider">Remove</button> : <button type="button" onClick={props.onApplyPromo} disabled={!props.promoCodeInput.trim()} className="rounded-lg bg-charcoal px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ivory disabled:opacity-40">Apply</button>}
          </div>
          {props.appliedPromoCode && <p className="mt-2 text-xs text-forest">Validating {props.appliedPromoCode} against this stay…</p>}
          {props.quoteError && <p role="alert" className="mt-2 text-xs text-red-700">{props.quoteError}</p>}
        </div>

        <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:p-8">
          <h3 className="font-display text-xl">Guest Details</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={labelCls}>Full name</label><input className={`mt-2 ${field}`} value={props.guest.name} onChange={(e) => props.setGuest({ ...props.guest, name: e.target.value })} required /></div>
            <div><label className={labelCls}>Email</label><input type="email" className={`mt-2 ${field}`} value={props.guest.email} onChange={(e) => props.setGuest({ ...props.guest, email: e.target.value })} required /></div>
            <div><label className={labelCls}>Phone</label><input className={`mt-2 ${field}`} value={props.guest.phone} onChange={(e) => props.setGuest({ ...props.guest, phone: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>Country</label><input className={`mt-2 ${field}`} value={props.guest.country} onChange={(e) => props.setGuest({ ...props.guest, country: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Purpose of Visit (optional)</label>
              <Select
                value={props.guest.purpose || undefined}
                onValueChange={(v) => props.setGuest({ ...props.guest, purpose: v })}
              >
                <SelectTrigger className={`mt-2 ${field} justify-between`}>
                  <SelectValue placeholder="Select one (optional)" />
                </SelectTrigger>
                <SelectContent className="z-[1000]">
                  {[
                    "Safari",
                    "Mount Kilimanjaro Climb",
                    "Business Travel",
                    "Retreat",
                    "Family Holiday",
                    "Honeymoon",
                    "Cultural Experience",
                    "Other",
                  ].map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-charcoal/50">Helps us tailor your arrival (early breakfast, transfers, etc.)</p>
            </div>
            <div className="sm:col-span-2"><label className={labelCls}>Special requests</label><textarea rows={3} className={`mt-2 ${field} resize-none`} value={props.guest.requests} onChange={(e) => props.setGuest({ ...props.guest, requests: e.target.value })} /></div>
          </div>
        </div>
      </div>

      <aside className="space-y-4 self-start rounded-2xl border border-charcoal/10 bg-bone/40 p-6 lg:sticky lg:top-24">
        <h4 className="font-display text-lg">Your Stay</h4>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{props.room.name}</p>
          {props.room.selected_rate_plan && <p className="text-xs text-charcoal/65">{props.room.selected_rate_plan.name} · {props.room.selected_rate_plan.meal_plan ?? "No meal plan"} · {props.room.selected_rate_plan.refundable ? "Refundable" : "Non-refundable"}</p>}
          <p className="text-xs text-charcoal/60">
            {props.nights} night{props.nights === 1 ? "" : "s"} · {props.totalOccupants} occupant{props.totalOccupants === 1 ? "" : "s"}
            {props.childrenBelow6 > 0 && ` (incl. ${props.childrenBelow6} under 6)`}
          </p>
        </div>
        <div className="space-y-2 border-t border-charcoal/10 pt-3 text-sm">
          {props.breakdown && (
            <>
              {props.breakdown.nightly.map((night) => (
                <div key={night.date} className="flex items-center justify-between gap-3 text-charcoal/70">
                  <span><span className="block">{night.date}</span><span className="mt-0.5 block text-[10px] capitalize text-charcoal/45">{(night.applied_rule_type ?? night.source ?? "published rate").replaceAll("_", " ")}{night.pricing_basis ? ` · ${night.pricing_basis.replaceAll("_", " ")}` : ""}</span></span>
                  <span className="shrink-0">{fmt(night.nightly_rate)}</span>
                </div>
              ))}
              {props.childrenBelow6 > 0 && (
                <div className="flex justify-between text-charcoal/55">
                  <span>{props.childrenBelow6} child under 6</span>
                  <span>Included</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between"><span>Accommodation</span><span>{fmt(props.roomTotal)}</span></div>
          {props.extrasTotal > 0 && <div className="flex justify-between"><span>Extras</span><span>{fmt(props.extrasTotal)}</span></div>}
          {Number(props.breakdown?.discount_total ?? 0) > 0 && <div className="flex justify-between text-forest"><span>Promotion discount</span><span>−{fmt(Number(props.breakdown?.discount_total ?? 0))}</span></div>}
          {Number(props.breakdown?.fee_total ?? 0) > 0 && <div className="flex justify-between"><span>Fees</span><span>{fmt(Number(props.breakdown?.fee_total ?? 0))}</span></div>}
          {Number(props.breakdown?.taxes ?? 0) > 0 && (
            <>
              {Number(props.breakdown?.taxes ?? 0) > Number(props.breakdown?.tax_addition ?? 0) && (
                <div className="flex justify-between text-charcoal/60">
                  <span>Tax included in rates</span>
                  <span>{fmt(Number(props.breakdown?.taxes ?? 0) - Number(props.breakdown?.tax_addition ?? 0))}</span>
                </div>
              )}
              {Number(props.breakdown?.tax_addition ?? 0) > 0 && (
                <div className="flex justify-between text-charcoal/70">
                  <span>Taxes added</span>
                  <span>{fmt(Number(props.breakdown?.tax_addition ?? 0))}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between border-t border-charcoal/10 pt-3 font-display text-lg"><span>Total</span><span>{fmt(props.grandTotal)}</span></div>
          <div className="flex justify-between text-charcoal/70"><span>Payment status</span><span>Not configured</span></div>
          <p className="text-xs leading-5 text-charcoal/60">No payment will be collected during this booking flow. Your reservation will remain pending and Mtoni will contact you about payment arrangements.</p>
        </div>
        <button
          onClick={props.onSubmit} disabled={props.submitting || props.pricingLoading || !props.breakdown}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #0F3D3A 0%, #0F3D3A 100%)" }}
        >
          {props.submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {props.submitting ? "Submitting reservation…" : props.pricingLoading ? "Updating quote…" : "Submit Reservation Request"}
        </button>
        <p className="text-[0.65rem] leading-5 text-charcoal/55">Payment is not configured for this UAT connection. No payment will be taken or marked as paid.</p>
      </aside>
    </div>
  );
}

function ConfirmationStep({ confirmation, room, checkIn, checkOut, nights, guestName, guestEmail }: {
  confirmation: { reference: string; total: number; currency: string; paymentStatus: "unpaid"; paymentState: "not_configured" };
  room: AvailabilityRoom;
  checkIn: string; checkOut: string; nights: number;
  guestName: string; guestEmail: string;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: confirmation.currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="rounded-2xl border border-charcoal/10 bg-ivory p-8 text-center shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)] sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#0F3D3A]/10">
        <Check className="h-7 w-7" style={{ color: "#0F3D3A" }} />
      </div>
      <h2 className="mt-5 font-display text-3xl">Booking received</h2>
      <p className="mt-2 text-sm text-charcoal/70">Thank you, {guestName}. Your reservation request has been recorded for {guestEmail}.</p>
      <div className="mx-auto mt-8 max-w-sm rounded-xl border border-charcoal/10 bg-bone/40 p-6 text-left text-sm">
        <div className="flex justify-between"><span className="text-charcoal/60">Reference</span><span className="font-mono font-medium">{confirmation.reference}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Room</span><span>{room.name}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Check-in</span><span>{checkIn}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Check-out</span><span>{checkOut}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Nights</span><span>{nights}</span></div>
        <div className="mt-3 flex justify-between border-t border-charcoal/10 pt-3 font-display text-lg"><span>Total</span><span>{fmt(confirmation.total)}</span></div>
        <div className="mt-2 flex justify-between text-charcoal/70"><span>Payment status</span><span>{confirmation.paymentStatus === "unpaid" && confirmation.paymentState === "not_configured" ? "Unpaid · Not configured" : "Pending"}</span></div>
      </div>
      <p className="mt-6 text-xs leading-5 text-charcoal/55">Reservation status: <span className="font-medium text-charcoal">Pending</span>. Payment is not configured and no payment has been collected. Mtoni’s reservations team will contact you to arrange the next step.</p>
    </div>
  );
}
