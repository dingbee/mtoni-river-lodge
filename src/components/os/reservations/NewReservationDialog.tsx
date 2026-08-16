import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkAvailability, type AvailabilityRoom } from "@/lib/booking.functions";
import { listGuests } from "@/lib/guests.functions";
import { createStaffReservation, RESERVATION_SOURCES } from "@/lib/staff-reservations.functions";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

type GuestRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  country: string | null;
};

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Guest" },
  { id: 2, label: "Stay" },
  { id: 3, label: "Room" },
  { id: 4, label: "Confirm" },
];

const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct",
  walk_in: "Walk-in",
  phone: "Phone",
  email: "Email",
  whatsapp: "WhatsApp",
  agent: "Travel agent",
  ota: "OTA",
  corporate: "Corporate",
};

const selectClass = "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function NewReservationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (bookingId: string) => void;
}) {
  const [step, setStep] = useState<Step>(1);

  // Guest
  const [guestQuery, setGuestQuery] = useState("");
  const [guestId, setGuestId] = useState<string | undefined>();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [country, setCountry] = useState("");

  // Stay
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO(1));
  const [adults, setAdults] = useState(2);
  const [childrenBelow6, setChildrenBelow6] = useState(0);
  const [children7Plus, setChildren7Plus] = useState(0);

  // Room + reservation
  const [roomSlug, setRoomSlug] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "confirmed">("confirmed");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "deposit_paid" | "paid">("unpaid");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [source, setSource] = useState<string>("direct");
  const [specialRequests, setSpecialRequests] = useState("");
  const [notes, setNotes] = useState("");

  const [created, setCreated] = useState<{
    bookingId: string;
    reference: string;
    total: number;
    currency: string;
    checkin: { token: string | null; status: string | null; eligible: boolean };
  } | null>(null);

  const guestsFn = useServerFn(listGuests);
  const availabilityFn = useServerFn(checkAvailability);
  const createFn = useServerFn(createStaffReservation);

  const totalGuests = adults + childrenBelow6 + children7Plus;

  const guestSearch = useQuery({
    queryKey: ["reservation-guest-search", guestQuery],
    queryFn: () => guestsFn({ data: { q: guestQuery, page: 1, pageSize: 8 } }),
    enabled: open && guestQuery.trim().length >= 2,
  });

  const availability = useQuery({
    queryKey: ["reservation-availability", checkIn, checkOut, totalGuests],
    queryFn: () => availabilityFn({ data: { checkIn, checkOut, guests: totalGuests } }),
    enabled: open && step >= 3 && checkOut > checkIn,
  });

  const rooms = useMemo(
    () => (availability.data ?? []) as (AvailabilityRoom & { fits_guests: boolean })[],
    [availability.data],
  );
  const selectedRoom = useMemo(
    () => rooms.find((r) => r.slug === roomSlug) ?? null,
    [rooms, roomSlug],
  );

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          guestId,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
          guestPhone,
          country,
          roomSlug: roomSlug!,
          checkIn,
          checkOut,
          adults,
          childrenBelow6,
          children7Plus,
          status,
          paymentStatus,
          paymentMethod,
          source: source as (typeof RESERVATION_SOURCES)[number],
          specialRequests,
          notes,
        },
      }),
    onSuccess: (res) => {
      setCreated(res);
      toast.success(`Reservation ${res.reference} created`);
      onCreated?.(res.bookingId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setStep(1);
    setGuestQuery("");
    setGuestId(undefined);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setCountry("");
    setCheckIn(todayISO());
    setCheckOut(todayISO(1));
    setAdults(2);
    setChildrenBelow6(0);
    setChildren7Plus(0);
    setRoomSlug(null);
    setStatus("confirmed");
    setPaymentStatus("unpaid");
    setPaymentMethod("");
    setSource("direct");
    setSpecialRequests("");
    setNotes("");
    setCreated(null);
  }

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const guestValid = guestName.trim().length >= 2 && emailValid;
  const stayValid = checkOut > checkIn && adults >= 1;

  const money = (n: number, c: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {created ? "Reservation created" : "New reservation"}
          </DialogTitle>
          <DialogDescription>
            {created
              ? "Created through the Mtoni reservation engine. No guest email has been sent."
              : "Guest, stay, room and payment state — booked through the existing reservation engine."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p className="font-mono text-xs text-muted-foreground">{created.reference}</p>
              <p className="mt-1 font-display text-lg">{guestName}</p>
              <p className="text-muted-foreground">
                {selectedRoom?.name ?? roomSlug} · {checkIn} → {checkOut}
              </p>
              <p className="mt-2 text-base">{money(created.total, created.currency)}</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-sm">
              <p className="text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">
                Online check-in
              </p>
              {created.checkin.token ? (
                <>
                  <p className="mt-2">
                    Check-in record ready ({created.checkin.status}). Link is available on the
                    reservation — nothing has been sent to the guest yet.
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    /check-in/{created.checkin.token}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  Not yet eligible for online check-in. It can be prepared later from the
                  reservation detail.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => reset()}>
                Create another
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <ol className="flex flex-wrap items-center gap-2 text-[0.6rem] uppercase tracking-[0.18em]">
              {STEPS.map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    "rounded-full px-3 py-1",
                    step === s.id
                      ? "bg-[color:var(--os-success-soft)] text-[color:var(--os-success)]"
                      : step > s.id
                        ? "text-[color:var(--os-ink-2)]"
                        : "text-muted-foreground",
                  )}
                >
                  {step > s.id && <Check className="mr-1 inline h-3 w-3" />}
                  {s.label}
                </li>
              ))}
            </ol>

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="guest-search">Search existing guest</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="guest-search"
                      className="pl-9"
                      placeholder="Name, email or phone"
                      value={guestQuery}
                      onChange={(e) => setGuestQuery(e.target.value)}
                    />
                  </div>
                  {guestSearch.isFetching && (
                    <p className="mt-2 text-xs text-muted-foreground">Searching…</p>
                  )}
                  {guestSearch.data && guestSearch.data.rows.length > 0 && (
                    <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                      {guestSearch.data.rows.map((g: GuestRow) => (
                        <li key={g.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setGuestId(g.id);
                              setGuestName(g.full_name ?? "");
                              setGuestEmail(g.email ?? "");
                              setGuestPhone(g.phone_e164 ?? "");
                              setCountry(g.country ?? "");
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40",
                              guestId === g.id && "bg-muted/50",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{g.full_name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {g.email ?? "—"}
                              </span>
                            </span>
                            {guestId === g.id && <Check className="h-4 w-4 shrink-0" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {guestSearch.data &&
                    guestQuery.trim().length >= 2 &&
                    guestSearch.data.rows.length === 0 && (
                      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <UserPlus className="h-3.5 w-3.5" /> No match — fill the details below to
                        create a new guest.
                      </p>
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="g-name">Full name</Label>
                    <Input
                      id="g-name"
                      value={guestName}
                      onChange={(e) => {
                        setGuestName(e.target.value);
                        setGuestId(undefined);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="g-email">Email</Label>
                    <Input
                      id="g-email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => {
                        setGuestEmail(e.target.value);
                        setGuestId(undefined);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="g-phone">Phone</Label>
                    <Input
                      id="g-phone"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="g-country">Country</Label>
                    <Input
                      id="g-country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="s-in">Check-in</Label>
                  <Input
                    id="s-in"
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="s-out">Check-out</Label>
                  <Input
                    id="s-out"
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="s-adults">Adults</Label>
                  <Input
                    id="s-adults"
                    type="number"
                    min={1}
                    max={10}
                    value={adults}
                    onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="s-c1">Children &lt;6</Label>
                    <Input
                      id="s-c1"
                      type="number"
                      min={0}
                      max={10}
                      value={childrenBelow6}
                      onChange={(e) => setChildrenBelow6(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="s-c2">Children 7+</Label>
                    <Input
                      id="s-c2"
                      type="number"
                      min={0}
                      max={10}
                      value={children7Plus}
                      onChange={(e) => setChildren7Plus(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </div>
                </div>
                {checkOut <= checkIn && (
                  <p className="text-xs text-destructive sm:col-span-2">
                    Check-out must be after check-in.
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {availability.isFetching ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
                  </p>
                ) : availability.error ? (
                  <p className="text-sm text-destructive">
                    {(availability.error as Error).message}
                  </p>
                ) : rooms.filter((r) => r.is_available && r.fits_guests).length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No rooms available for these dates and party size. Adjust the stay.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {rooms.map((r) => {
                      const bookable = r.is_available && r.fits_guests;
                      return (
                        <li key={r.room_id}>
                          <button
                            type="button"
                            disabled={!bookable}
                            onClick={() => setRoomSlug(r.slug)}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm",
                              bookable
                                ? "border-border hover:bg-muted/40"
                                : "cursor-not-allowed border-dashed opacity-50",
                              roomSlug === r.slug && "border-[color:var(--os-success)] bg-muted/50",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{r.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {bookable
                                  ? `${r.min_available} available · sleeps ${r.max_occupancy}`
                                  : !r.is_available
                                    ? "Not available for these dates"
                                    : `Max occupancy ${r.max_occupancy}`}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block">{money(r.nightly_total, r.currency)}</span>
                              <span className="block text-xs text-muted-foreground">
                                {r.nights} night{r.nights === 1 ? "" : "s"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="r-source">Booking source</Label>
                    <select
                      id="r-source"
                      className={selectClass}
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                    >
                      {RESERVATION_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_LABEL[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="r-status">Reservation status</Label>
                    <select
                      id="r-status"
                      className={selectClass}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as "pending" | "confirmed")}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="r-pay">Payment status</Label>
                    <select
                      id="r-pay"
                      className={selectClass}
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="deposit_paid">Deposit paid</option>
                      <option value="paid">Paid in full</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="r-method">Payment method</Label>
                    <Input
                      id="r-method"
                      placeholder="Cash, card, transfer…"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="r-req">Special requests</Label>
                    <Textarea
                      id="r-req"
                      rows={2}
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="r-notes">Internal notes</Label>
                    <Textarea
                      id="r-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <dl className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline text-muted-foreground">Guest: </dt>
                  <dd className="inline">{guestName}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Email: </dt>
                  <dd className="inline">{guestEmail}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Phone: </dt>
                  <dd className="inline">{guestPhone || "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Country: </dt>
                  <dd className="inline">{country || "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Room: </dt>
                  <dd className="inline">{selectedRoom?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Nights: </dt>
                  <dd className="inline">{selectedRoom?.nights ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Stay: </dt>
                  <dd className="inline">
                    {checkIn} → {checkOut}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Party: </dt>
                  <dd className="inline">
                    {adults} adult{adults === 1 ? "" : "s"}, {childrenBelow6 + children7Plus} child
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Source: </dt>
                  <dd className="inline">{SOURCE_LABEL[source]}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Status: </dt>
                  <dd className="inline">{status}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Payment: </dt>
                  <dd className="inline">
                    {paymentStatus.replace("_", " ")}
                    {paymentMethod ? ` · ${paymentMethod}` : ""}
                  </dd>
                </div>
                <div className="sm:col-span-2 border-t border-border pt-2 text-base">
                  <dt className="inline text-muted-foreground">Total: </dt>
                  <dd className="inline">
                    {selectedRoom ? money(selectedRoom.nightly_total, selectedRoom.currency) : "—"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      (final total calculated by the reservation engine)
                    </span>
                  </dd>
                </div>
              </dl>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <Button
                variant="ghost"
                onClick={() => (step === 1 ? close(false) : setStep((step - 1) as Step))}
                disabled={create.isPending}
              >
                {step === 1 ? "Cancel" : "Back"}
              </Button>
              {step < 4 ? (
                <Button
                  onClick={() => setStep((step + 1) as Step)}
                  disabled={
                    (step === 1 && !guestValid) ||
                    (step === 2 && !stayValid) ||
                    (step === 3 && !roomSlug)
                  }
                >
                  Continue
                </Button>
              ) : (
                <Button onClick={() => create.mutate()} disabled={create.isPending || !roomSlug}>
                  {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create reservation
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
