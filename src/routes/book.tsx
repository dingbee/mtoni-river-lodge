import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Leaf, Loader2, Check } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { BreadcrumbsBar } from "@/components/site/Breadcrumbs";
import { BookingTrustBlock } from "@/components/site/reviews/BookingTrustBlock";
import { TrustBar } from "@/components/site/reviews/TrustBar";
import { WHATSAPP_URL } from "@/lib/contact";
import { trackContactClick } from "@/lib/analytics";
import {
  checkAvailability,
  createBooking,
  listExtras,
  type AvailabilityRoom,
} from "@/lib/booking.functions";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book Your Stay — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Check live availability and reserve your stay at Mtoni River Lodge on the banks of the Nduruma River, Arusha.",
      },
      { property: "og:title", content: "Book Your Stay — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "Reserve your room at Mtoni River Lodge — an intimate riverfront retreat in Arusha, Tanzania.",
      },
    ],
  }),
  component: BookPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) =>
  a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)) : 0;

type Step = "search" | "select" | "guest" | "confirmation";

type AvailabilityResult = (AvailabilityRoom & { fits_guests: boolean })[];

type SelectedExtra = { slug: string; quantity: number };

function BookPage() {
  const [step, setStep] = useState<Step>("search");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [results, setResults] = useState<AvailabilityResult>([]);
  const [selectedRoom, setSelectedRoom] = useState<AvailabilityRoom | null>(null);
  const [extras, setExtras] = useState<Array<{ slug: string; name: string; price: number; unit: string; description: string | null }>>([]);
  const [selectedExtras, setSelectedExtras] = useState<SelectedExtra[]>([]);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "", country: "", requests: "" });
  const [confirmation, setConfirmation] = useState<{ reference: string; total: number; currency: string } | null>(null);

  const nights = nightsBetween(checkIn, checkOut);
  const guests = adults + children;

  const checkAvailabilityFn = useServerFn(checkAvailability);
  const listExtrasFn = useServerFn(listExtras);
  const createBookingFn = useServerFn(createBooking);

  const search = useMutation({
    mutationFn: async () => {
      if (nights < 1) throw new Error("Pick a check-in and check-out date");
      const [rooms, extrasList] = await Promise.all([
        checkAvailabilityFn({ data: { checkIn, checkOut, guests } }),
        listExtrasFn(),
      ]);
      return { rooms, extrasList };
    },
    onSuccess: ({ rooms, extrasList }) => {
      setResults(rooms);
      setExtras(extrasList);
      setStep("select");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedRoom) throw new Error("Select a room first");
      return createBookingFn({
        data: {
          roomSlug: selectedRoom.slug,
          checkIn,
          checkOut,
          adults,
          children,
          guestName: guest.name,
          guestEmail: guest.email,
          guestPhone: guest.phone,
          country: guest.country,
          specialRequests: guest.requests,
          extras: selectedExtras,
        },
      });
    },
    onSuccess: (res) => {
      setConfirmation(res);
      setStep("confirmation");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const extrasTotal = useMemo(() => {
    return selectedExtras.reduce((sum, sel) => {
      const e = extras.find((x) => x.slug === sel.slug);
      if (!e) return sum;
      const mult =
        e.unit === "per_stay" ? 1 :
        e.unit === "per_night" ? nights :
        e.unit === "per_person" ? guests :
        e.unit === "per_person_per_night" ? guests * nights : 1;
      return sum + e.price * sel.quantity * mult;
    }, 0);
  }, [selectedExtras, extras, nights, guests]);

  const grandTotal = (selectedRoom?.nightly_total ?? 0) + extrasTotal;

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <BreadcrumbsBar />
      <TrustBar variant="subtle" compact />
      <BookingTrustBlock />
      <main className="pt-10 lg:pt-14">
        <section className="mx-auto w-full max-w-[960px] px-4 pb-24 lg:px-12">
          <div className="mb-10 text-center">
            <p className="inline-flex items-center justify-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-charcoal/60">
              <Leaf className="h-3 w-3" style={{ color: "#427A43" }} />
              Mtoni River Lodge · Reservations
            </p>
            <h1 className="mt-5 font-display text-3xl leading-tight lg:text-5xl">Reserve Your Stay</h1>
            <Stepper step={step} />
          </div>

          {step === "search" && (
            <SearchStep
              checkIn={checkIn} checkOut={checkOut} adults={adults} children={children}
              setCheckIn={setCheckIn} setCheckOut={setCheckOut} setAdults={setAdults} setChildren={setChildren}
              nights={nights}
              loading={search.isPending}
              onSearch={() => search.mutate()}
            />
          )}

          {step === "select" && (
            <SelectStep
              results={results} guests={guests} nights={nights}
              onBack={() => setStep("search")}
              onSelect={(r) => { setSelectedRoom(r); setStep("guest"); }}
            />
          )}

          {step === "guest" && selectedRoom && (
            <GuestStep
              room={selectedRoom} nights={nights} guests={guests}
              extras={extras} selectedExtras={selectedExtras} setSelectedExtras={setSelectedExtras}
              extrasTotal={extrasTotal} grandTotal={grandTotal}
              guest={guest} setGuest={setGuest}
              submitting={submit.isPending}
              onBack={() => setStep("select")}
              onSubmit={() => submit.mutate()}
            />
          )}

          {step === "confirmation" && confirmation && selectedRoom && (
            <ConfirmationStep
              confirmation={confirmation}
              room={selectedRoom}
              checkIn={checkIn} checkOut={checkOut} nights={nights}
              guestName={guest.name} guestEmail={guest.email}
            />
          )}

          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-charcoal/50">Prefer to chat directly?</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackContactClick("whatsapp", "book_page_assistance")}
              className="inline-flex items-center gap-3 rounded-full border border-charcoal px-6 py-3 text-[0.72rem] uppercase tracking-[0.28em] transition-colors hover:bg-charcoal hover:text-ivory"
            >
              Book via WhatsApp · +255 752 441 443 →
            </a>
            <p className="mt-4 max-w-sm text-[0.7rem] text-charcoal/50">
              By booking you agree to our{" "}
              <Link to="/terms" className="underline underline-offset-4 hover:text-charcoal">
                Terms &amp; Conditions
              </Link>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooterMinimal />
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
    <div className="mx-auto mt-8 flex max-w-md items-center justify-between gap-2">
      {steps.map((s, i) => (
        <div key={s.k} className="flex flex-1 items-center">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[0.65rem] font-medium ${i <= idx ? "bg-charcoal text-ivory" : "bg-charcoal/10 text-charcoal/50"}`}>
            {i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`ml-2 text-[0.65rem] uppercase tracking-[0.2em] ${i <= idx ? "text-charcoal" : "text-charcoal/40"}`}>{s.label}</span>
          {i < steps.length - 1 && <div className={`mx-2 h-px flex-1 ${i < idx ? "bg-charcoal" : "bg-charcoal/15"}`} />}
        </div>
      ))}
    </div>
  );
}

const field = "w-full rounded-lg border border-charcoal/15 bg-ivory px-4 py-3 text-sm text-charcoal placeholder:text-charcoal/40 outline-none focus:border-charcoal focus:ring-2 focus:ring-charcoal/15";
const labelCls = "text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70";

function SearchStep(props: {
  checkIn: string; checkOut: string; adults: number; children: number; nights: number; loading: boolean;
  setCheckIn: (v: string) => void; setCheckOut: (v: string) => void;
  setAdults: (v: number) => void; setChildren: (v: number) => void;
  onSearch: () => void;
}) {
  return (
    <div className="space-y-5 rounded-2xl border border-charcoal/10 bg-ivory p-6 shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)] sm:p-10">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Check-in</label>
          <input type="date" min={today()} className={`mt-2 ${field}`} value={props.checkIn} onChange={(e) => props.setCheckIn(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Check-out</label>
          <input type="date" min={props.checkIn || today()} className={`mt-2 ${field}`} value={props.checkOut} onChange={(e) => props.setCheckOut(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Adults</label>
          <input type="number" min={1} max={10} className={`mt-2 ${field}`} value={props.adults} onChange={(e) => props.setAdults(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <label className={labelCls}>Children</label>
          <input type="number" min={0} max={10} className={`mt-2 ${field}`} value={props.children} onChange={(e) => props.setChildren(Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-dashed border-charcoal/20 bg-bone/30 px-4 py-3">
        <span className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/60">Length of stay</span>
        <span className="font-display text-lg">{props.nights > 0 ? `${props.nights} Night${props.nights === 1 ? "" : "s"}` : "—"}</span>
      </div>
      <button
        onClick={props.onSearch} disabled={props.loading}
        className="group mt-2 inline-flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_18px_40px_-18px_rgba(52,103,57,0.7)] transition-all hover:brightness-110 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
      >
        {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {props.loading ? "Checking availability…" : "Check Availability"}
      </button>
    </div>
  );
}

function SelectStep({ results, guests, nights, onBack, onSelect }: {
  results: AvailabilityResult; guests: number; nights: number;
  onBack: () => void; onSelect: (r: AvailabilityRoom) => void;
}) {
  const fmt = (n: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs uppercase tracking-[0.22em] text-charcoal/60 hover:text-charcoal">← Change dates</button>
      {results.map((r) => {
        const disabled = !r.is_available || !r.fits_guests;
        return (
          <div key={r.room_id} className="flex flex-col gap-4 rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-xl">{r.name}</h3>
              <p className="mt-1 text-sm text-charcoal/60">Sleeps up to {r.max_occupancy} · {r.min_available > 0 ? `${r.min_available} unit${r.min_available === 1 ? "" : "s"} available` : "Sold out"}</p>
              {!r.fits_guests && <p className="mt-1 text-xs text-red-600">Does not fit {guests} guests</p>}
            </div>
            <div className="text-right">
              <p className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/60">{nights} night{nights === 1 ? "" : "s"} total</p>
              <p className="font-display text-2xl">{fmt(Number(r.nightly_total), r.currency)}</p>
              <p className="text-xs text-charcoal/55">from {fmt(Number(r.base_price), r.currency)} / night</p>
              <button
                onClick={() => onSelect(r)} disabled={disabled}
                className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
              >
                {r.is_available ? "Select" : "Unavailable"} →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GuestStep(props: {
  room: AvailabilityRoom; nights: number; guests: number;
  extras: Array<{ slug: string; name: string; price: number; unit: string; description: string | null }>;
  selectedExtras: SelectedExtra[]; setSelectedExtras: (v: SelectedExtra[]) => void;
  extrasTotal: number; grandTotal: number;
  guest: { name: string; email: string; phone: string; country: string; requests: string };
  setGuest: (g: { name: string; email: string; phone: string; country: string; requests: string }) => void;
  submitting: boolean;
  onBack: () => void; onSubmit: () => void;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: props.room.currency, maximumFractionDigits: 0 }).format(n);
  const deposit = Math.round(props.grandTotal * 0.3);
  const balance = props.grandTotal - deposit;
  const toggleExtra = (slug: string) => {
    const existing = props.selectedExtras.find((s) => s.slug === slug);
    if (existing) props.setSelectedExtras(props.selectedExtras.filter((s) => s.slug !== slug));
    else props.setSelectedExtras([...props.selectedExtras, { slug, quantity: 1 }]);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <button onClick={props.onBack} className="text-xs uppercase tracking-[0.22em] text-charcoal/60 hover:text-charcoal">← Change room</button>

        <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:p-8">
          <h3 className="font-display text-xl">Add Extras</h3>
          <p className="mt-1 text-xs text-charcoal/60">Optional services to elevate your stay.</p>
          <div className="mt-5 space-y-3">
            {props.extras.map((e) => {
              const checked = !!props.selectedExtras.find((s) => s.slug === e.slug);
              return (
                <label key={e.slug} className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4 transition ${checked ? "border-charcoal/40 bg-bone/40" : "border-charcoal/10"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggleExtra(e.slug)} className="mt-1" />
                    <div>
                      <p className="font-medium">{e.name}</p>
                      {e.description && <p className="text-xs text-charcoal/60">{e.description}</p>}
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-sm">{fmt(e.price)} <span className="text-xs text-charcoal/55">/ {e.unit.replaceAll("_", " ")}</span></span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-charcoal/10 bg-ivory p-6 sm:p-8">
          <h3 className="font-display text-xl">Guest Details</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={labelCls}>Full name</label><input className={`mt-2 ${field}`} value={props.guest.name} onChange={(e) => props.setGuest({ ...props.guest, name: e.target.value })} required /></div>
            <div><label className={labelCls}>Email</label><input type="email" className={`mt-2 ${field}`} value={props.guest.email} onChange={(e) => props.setGuest({ ...props.guest, email: e.target.value })} required /></div>
            <div><label className={labelCls}>Phone</label><input className={`mt-2 ${field}`} value={props.guest.phone} onChange={(e) => props.setGuest({ ...props.guest, phone: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>Country</label><input className={`mt-2 ${field}`} value={props.guest.country} onChange={(e) => props.setGuest({ ...props.guest, country: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>Special requests</label><textarea rows={3} className={`mt-2 ${field} resize-none`} value={props.guest.requests} onChange={(e) => props.setGuest({ ...props.guest, requests: e.target.value })} /></div>
          </div>
        </div>
      </div>

      <aside className="space-y-4 self-start rounded-2xl border border-charcoal/10 bg-bone/40 p-6 lg:sticky lg:top-24">
        <h4 className="font-display text-lg">Your Stay</h4>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{props.room.name}</p>
          <p className="text-xs text-charcoal/60">{props.nights} night{props.nights === 1 ? "" : "s"} · {props.guests} guest{props.guests === 1 ? "" : "s"}</p>
        </div>
        <div className="space-y-2 border-t border-charcoal/10 pt-3 text-sm">
          <div className="flex justify-between"><span>Room</span><span>{fmt(Number(props.room.nightly_total))}</span></div>
          {props.extrasTotal > 0 && <div className="flex justify-between"><span>Extras</span><span>{fmt(props.extrasTotal)}</span></div>}
          <div className="flex justify-between border-t border-charcoal/10 pt-3 font-display text-lg"><span>Total</span><span>{fmt(props.grandTotal)}</span></div>
          <div className="flex justify-between text-charcoal/70"><span>Deposit (30%)</span><span>{fmt(deposit)}</span></div>
          <div className="flex justify-between text-charcoal/70"><span>Balance on arrival</span><span>{fmt(balance)}</span></div>
        </div>
        <button
          onClick={props.onSubmit} disabled={props.submitting}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[0.7rem] font-medium uppercase tracking-[0.24em] text-ivory transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
        >
          {props.submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {props.submitting ? "Creating booking…" : "Confirm Booking"}
        </button>
        <p className="text-[0.65rem] text-charcoal/55">Your booking will be created in pending status. Our reservations team will follow up to confirm and arrange payment.</p>
      </aside>
    </div>
  );
}

function ConfirmationStep({ confirmation, room, checkIn, checkOut, nights, guestName, guestEmail }: {
  confirmation: { reference: string; total: number; currency: string };
  room: AvailabilityRoom;
  checkIn: string; checkOut: string; nights: number;
  guestName: string; guestEmail: string;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: confirmation.currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="rounded-2xl border border-charcoal/10 bg-ivory p-8 text-center shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)] sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#427A43]/10">
        <Check className="h-7 w-7" style={{ color: "#346739" }} />
      </div>
      <h2 className="mt-5 font-display text-3xl">Booking received</h2>
      <p className="mt-2 text-sm text-charcoal/70">Thank you, {guestName}. We have sent a confirmation receipt to {guestEmail}.</p>
      <div className="mx-auto mt-8 max-w-sm rounded-xl border border-charcoal/10 bg-bone/40 p-6 text-left text-sm">
        <div className="flex justify-between"><span className="text-charcoal/60">Reference</span><span className="font-mono font-medium">{confirmation.reference}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Room</span><span>{room.name}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Check-in</span><span>{checkIn}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Check-out</span><span>{checkOut}</span></div>
        <div className="mt-2 flex justify-between"><span className="text-charcoal/60">Nights</span><span>{nights}</span></div>
        <div className="mt-3 flex justify-between border-t border-charcoal/10 pt-3 font-display text-lg"><span>Total</span><span>{fmt(confirmation.total)}</span></div>
        <div className="mt-2 flex justify-between text-charcoal/70"><span>Deposit (30%)</span><span>{fmt(Math.round(confirmation.total * 0.3))}</span></div>
        <div className="mt-1 flex justify-between text-charcoal/70"><span>Balance on arrival</span><span>{fmt(confirmation.total - Math.round(confirmation.total * 0.3))}</span></div>
      </div>
      <p className="mt-6 text-xs text-charcoal/55">Status: <span className="font-medium text-charcoal">Pending</span> — our team will reach out within 24 hours to finalise payment.</p>
    </div>
  );
}
