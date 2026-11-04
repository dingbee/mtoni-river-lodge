import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BedDouble, CalendarDays, CheckCircle2, Globe2, ShieldCheck, Users } from "lucide-react";
import {
  createPublicDemoBooking,
  getPublicDemoProperty,
  searchPublicDemoAvailability,
} from "@/lib/public-booking.functions";

export const Route = createFileRoute("/$propertySlug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.propertySlug} — StayNas Direct` },
      { name: "description", content: "A direct booking page powered by StayNas." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PublicPropertyBookingPage,
});

type PropertyPageData = Awaited<ReturnType<typeof getPublicDemoProperty>>;
type AvailableRoom = {
  room_id: string;
  slug: string;
  name: string;
  base_price: number;
  currency: string;
  max_occupancy: number;
  nightly_total: number;
  nights: number;
  min_available: number;
  is_available: boolean;
  fits_guests: boolean;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
};
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

function PublicPropertyBookingPage() {
  const { propertySlug } = Route.useParams();
  const loadProperty = useServerFn(getPublicDemoProperty);
  const searchAvailability = useServerFn(searchPublicDemoAvailability);
  const createBooking = useServerFn(createPublicDemoBooking);

  const [propertyData, setPropertyData] = useState<PropertyPageData | null>(null);
  const [loadingProperty, setLoadingProperty] = useState(true);
  const [pageError, setPageError] = useState("");
  const [checkIn, setCheckIn] = useState(addDays(7));
  const [checkOut, setCheckOut] = useState(addDays(9));
  const [guests, setGuests] = useState(2);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [country, setCountry] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [confirmation, setConfirmation] = useState<Awaited<ReturnType<typeof createPublicDemoBooking>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingProperty(true);
    loadProperty({ data: { propertySlug } })
      .then((result) => { if (!cancelled) setPropertyData(result); })
      .catch((error: Error) => { if (!cancelled) setPageError(error.message || "This booking page is unavailable."); })
      .finally(() => { if (!cancelled) setLoadingProperty(false); });
    return () => { cancelled = true; };
  }, [loadProperty, propertySlug]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
  }, [checkIn, checkOut]);

  const availabilityMutation = useMutation({
    mutationFn: () => searchAvailability({ data: { propertySlug, checkIn, checkOut, guests } }),
    onSuccess: (rooms) => {
      setAvailableRooms(rooms as AvailableRoom[]);
      setSelectedRoom(null);
      setConfirmation(null);
    },
  });

  const bookingMutation = useMutation({
    mutationFn: () => {
      if (!selectedRoom) throw new Error("Select a room to continue.");
      return createBooking({
        data: {
          propertySlug,
          roomSlug: selectedRoom.slug,
          checkIn,
          checkOut,
          adults: guests,
          children: 0,
          guestName,
          guestEmail,
          guestPhone,
          country,
          specialRequests,
        },
      });
    },
    onSuccess: (result) => setConfirmation(result),
  });

  if (loadingProperty) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-5 text-sm text-slate-500">Loading property booking page…</main>;
  }

  if (!propertyData) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] px-5"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center"><h1 className="text-2xl font-semibold text-slate-900">Booking page unavailable</h1><p className="mt-3 text-sm text-slate-600">{pageError || "This property is not currently published on StayNas."}</p><a href="/" className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white">StayNas home</a></div></main>;
  }

  const { property, rooms } = propertyData;
  const currency = property.currency || "USD";

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">S</span>StayNas<span className="ml-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Direct</span></a>
          <span className="hidden items-center gap-2 text-xs font-medium text-slate-500 sm:flex"><ShieldCheck className="h-4 w-4"/> Secure property-scoped booking</span>
        </div>
      </div>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.1fr_.9fr] lg:items-end lg:px-8 lg:py-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Direct reservations</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{property.name}</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">Explore room options, check live availability and reserve directly with this property.</p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Globe2 className="h-4 w-4"/> Powered by StayNas</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4"/> Secure reservation flow</span></div>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            <p className="font-semibold">StayNas UAT demonstration</p>
            <p className="mt-1">This page uses Nolmark's sample room inventory and test rates. It is a functional booking demonstration, not a live accommodation offer. No payment is collected.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr]">
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Plan your stay</p>
            <h2 className="mt-2 text-2xl font-semibold">Check availability</h2>
            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-medium">Check-in<input type="date" min={isoDate(new Date())} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-3 font-normal"/></label>
              <label className="grid gap-2 text-sm font-medium">Check-out<input type="date" min={checkIn || isoDate(new Date())} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-3 font-normal"/></label>
              <label className="grid gap-2 text-sm font-medium">Guests<select value={guests} onChange={(event) => setGuests(Number(event.target.value))} className="h-12 rounded-xl border border-slate-200 bg-white px-3 font-normal">{[1,2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count} {count === 1 ? "guest" : "guests"}</option>)}</select></label>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><span className="text-slate-500">Length of stay</span><span className="font-semibold">{nights} {nights === 1 ? "night" : "nights"}</span></div>
              <button disabled={nights < 1 || availabilityMutation.isPending} onClick={() => availabilityMutation.mutate()} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{availabilityMutation.isPending ? "Checking…" : "Search availability"}<ArrowRight className="h-4 w-4"/></button>
              {availabilityMutation.isError && <p className="text-sm text-red-600">{(availabilityMutation.error as Error).message}</p>}
            </div>
          </aside>

          <div>
            <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Accommodation</p><h2 className="mt-2 text-2xl font-semibold">Available room types</h2></div><span className="text-xs text-slate-500">{rooms.length} configured types</span></div>
            <div className="grid gap-4">
              {rooms.map((room: any) => {
                const live = availableRooms.find((item) => item.slug === room.slug);
                const isSelected = selectedRoom?.slug === room.slug;
                return <article key={room.id} className={`rounded-3xl border bg-white p-5 shadow-sm transition ${isSelected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200"}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><BedDouble className="h-8 w-8"/></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{room.name}</h3><p className="mt-1 text-sm text-slate-500">{room.short_description || "Room configured in StayNas."}</p></div><div className="text-right"><p className="text-lg font-semibold">{money(room.base_price, room.currency || currency)}</p><p className="text-xs text-slate-500">per night</p></div></div>
                      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5"/> Up to {room.max_occupancy} guests</span>{room.bed_label && <span>{room.bed_label}</span>}{room.bathroom_label && <span>{room.bathroom_label}</span>}</div>
                      {live && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-sm text-emerald-800">{live.min_available} unit(s) available · {money(live.nightly_total * live.nights, live.currency)} room subtotal for {live.nights} night(s)</p><button onClick={() => setSelectedRoom(live)} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${isSelected ? "bg-emerald-700 text-white" : "border border-slate-300 text-slate-800 hover:bg-slate-50"}`}>{isSelected ? "Selected" : "Select room"}</button></div>}
                    </div>
                  </div>
                </article>;
              })}
              {availableRooms.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-3 font-semibold">Check dates to see live availability</p><p className="mt-1 text-sm text-slate-500">Available room types and stay totals will appear here.</p></div>}
            </div>

            {selectedRoom && !confirmation && <form onSubmit={(event) => { event.preventDefault(); bookingMutation.mutate(); }} className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Complete reservation</p>
              <h2 className="mt-2 text-2xl font-semibold">{selectedRoom.name}</h2>
              <p className="mt-2 text-sm text-slate-500">{nights} nights · {guests} guests · {money(selectedRoom.nightly_total * nights, selectedRoom.currency)} estimated room subtotal</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">Full name<input required minLength={2} maxLength={100} value={guestName} onChange={(event) => setGuestName(event.target.value)} className="h-12 rounded-xl border border-slate-200 px-3 font-normal" placeholder="Your full name"/></label>
                <label className="grid gap-2 text-sm font-medium">Email address<input required type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="h-12 rounded-xl border border-slate-200 px-3 font-normal" placeholder="you@example.com"/></label>
                <label className="grid gap-2 text-sm font-medium">Phone (optional)<input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="h-12 rounded-xl border border-slate-200 px-3 font-normal" placeholder="+255…"/></label>
                <label className="grid gap-2 text-sm font-medium">Country (optional)<input value={country} onChange={(event) => setCountry(event.target.value)} className="h-12 rounded-xl border border-slate-200 px-3 font-normal" placeholder="Country"/></label>
                <label className="grid gap-2 text-sm font-medium sm:col-span-2">Special requests (optional)<textarea value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} className="min-h-24 rounded-xl border border-slate-200 p-3 font-normal" maxLength={1000}/></label>
              </div>
              {bookingMutation.isError && <p className="mt-4 text-sm text-red-600">{(bookingMutation.error as Error).message}</p>}
              <button type="submit" disabled={bookingMutation.isPending} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">{bookingMutation.isPending ? "Submitting reservation…" : "Confirm reservation request"}<ArrowRight className="h-4 w-4"/></button>
              <p className="mt-3 text-center text-xs text-slate-500">No payment is collected in this UAT demonstration.</p>
            </form>}

            {confirmation && <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
              <CheckCircle2 className="h-9 w-9 text-emerald-700"/>
              <h2 className="mt-3 text-2xl font-semibold text-emerald-950">Reservation created</h2>
              <p className="mt-2 text-sm text-emerald-900">Your reservation has been recorded in the Nolmark UAT property.</p>
              <div className="mt-5 grid gap-3 rounded-2xl bg-white/80 p-4 text-sm sm:grid-cols-2"><div><p className="text-xs text-slate-500">Booking reference</p><p className="mt-1 font-semibold">{confirmation.reference}</p></div><div><p className="text-xs text-slate-500">Reservation total</p><p className="mt-1 font-semibold">{money(confirmation.total, confirmation.currency)}</p></div><div><p className="text-xs text-slate-500">Payment status</p><p className="mt-1 font-semibold">Unpaid · No payment gateway enabled</p></div><div><p className="text-xs text-slate-500">Property</p><p className="mt-1 font-semibold">{confirmation.propertyName}</p></div></div>
              <button onClick={() => { setConfirmation(null); setSelectedRoom(null); setGuestName(""); setGuestEmail(""); setGuestPhone(""); setCountry(""); setSpecialRequests(""); setAvailableRooms([]); }} className="mt-5 rounded-full border border-emerald-800 px-5 py-2.5 text-sm font-semibold text-emerald-950">Start another demo booking</button>
            </section>}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-500"><p>StayNas Direct · Property-owned reservations · Powered by StayNas</p><p className="mt-1">UAT demonstration only — sample inventory and rates.</p></footer>
    </main>
  );
}
