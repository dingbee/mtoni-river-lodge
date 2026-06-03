import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Leaf } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  trackAvailabilityCompleted,
  trackAvailabilityStarted,
  trackAvailabilityWhatsApp,
} from "@/lib/analytics";

const WHATSAPP_NUMBER = "255752441443";

const ROOM_OPTIONS = [
  "Deluxe Room",
  "River Suite",
  "Family Room",
  "Honeymoon Stay",
  "Not Sure Yet",
] as const;

const today = () => new Date().toISOString().slice(0, 10);

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Please share your full name").max(100),
    email: z.string().trim().email("Enter a valid email address").max(255),
    country: z.string().trim().max(100).optional().or(z.literal("")),
    checkIn: z.string().min(1, "Select a check-in date"),
    checkOut: z.string().min(1, "Select a check-out date"),
    guests: z
      .number({ invalid_type_error: "Add the number of guests" })
      .int()
      .min(1, "At least one guest")
      .max(20, "Please contact us for groups over 20"),
    roomPreference: z.string().max(80).optional().or(z.literal("")),
    comments: z.string().max(1000).optional().or(z.literal("")),
  })
  .refine((d) => d.checkIn >= today(), {
    path: ["checkIn"],
    message: "Check-in cannot be in the past",
  })
  .refine((d) => d.checkOut > d.checkIn, {
    path: ["checkOut"],
    message: "Check-out must be after check-in",
  });

type FormState = {
  fullName: string;
  email: string;
  country: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  roomPreference: string;
  comments: string;
};

const empty: FormState = {
  fullName: "",
  email: "",
  country: "",
  checkIn: "",
  checkOut: "",
  guests: "2",
  roomPreference: "",
  comments: "",
};

function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

function buildMessage(d: {
  fullName: string;
  email: string;
  country: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  roomPreference: string;
  comments: string;
  source: string;
}) {
  return [
    "Hello Mtoni River Lodge,",
    "",
    "I would like to check availability for my stay.",
    "",
    "Guest Details",
    `Name: ${d.fullName}`,
    `Email: ${d.email}`,
    `Country: ${d.country || "—"}`,
    "",
    "Stay Details",
    `Check-in: ${d.checkIn}`,
    `Check-out: ${d.checkOut}`,
    `Length of Stay: ${d.nights} Night${d.nights === 1 ? "" : "s"}`,
    `Guests: ${d.guests}`,
    `Room Preference: ${d.roomPreference || "Not specified"}`,
    "",
    "Special Requests:",
    d.comments?.trim() || "—",
    "",
    `Source: ${d.source}`,
    "",
    "Please advise availability and rates.",
    "",
    "Thank you.",
  ].join("\n");
}

function openWhatsApp(message: string) {
  const encoded = encodeURIComponent(message);
  // Use api.whatsapp.com which works reliably across both mobile and desktop.
  const apiUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encoded}`;
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const url = isMobile ? waUrl : apiUrl;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) window.location.href = url;
}

export function AvailabilityForm({
  location = "book_page",
  onSuccess,
  variant = "page",
}: {
  location?: string;
  onSuccess?: () => void;
  variant?: "page" | "modal";
}) {
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    trackAvailabilityStarted(location);
  }, [location]);

  const nights = useMemo(
    () => nightsBetween(form.checkIn, form.checkOut),
    [form.checkIn, form.checkOut],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, guests: Number(form.guests) });
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof FormState;
        if (!errs[k]) errs[k] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    const data = parsed.data;
    const n = nightsBetween(data.checkIn, data.checkOut);

    try {
      const key = "mtoni_booking_inquiries";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.push({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        full_name: data.fullName,
        email: data.email,
        country: data.country || null,
        check_in: data.checkIn,
        check_out: data.checkOut,
        nights: n,
        guests: data.guests,
        room_preference: data.roomPreference || null,
        comments: data.comments || null,
        source: location,
      });
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch {
      // ignore
    }

    const message = buildMessage({
      fullName: data.fullName,
      email: data.email,
      country: data.country ?? "",
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      nights: n,
      guests: data.guests,
      roomPreference: data.roomPreference ?? "",
      comments: data.comments ?? "",
      source: location,
    });

    const gaParams = {
      room_type: data.roomPreference || "unspecified",
      guest_count: data.guests,
      country: data.country || "unspecified",
      stay_length: n,
      location,
    };
    trackAvailabilityWhatsApp(gaParams);

    toast.success("Redirecting to WhatsApp…", {
      description:
        "Our reservations team will confirm availability and rates shortly.",
    });

    setTimeout(() => {
      openWhatsApp(message);
      trackAvailabilityCompleted(gaParams);
      setSubmitting(false);
      setForm(empty);
      onSuccess?.();
    }, 600);
  };

  const field =
    "w-full rounded-lg border border-charcoal/15 bg-ivory/60 px-4 py-3 text-sm text-charcoal placeholder:text-charcoal/40 outline-none transition focus:border-charcoal focus:bg-ivory focus:ring-2 focus:ring-charcoal/15";
  const labelCls =
    "text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70";
  const errCls = "mt-1 text-xs text-red-600";

  return (
    <form
      onSubmit={handleSubmit}
      className={
        variant === "page"
          ? "space-y-5 rounded-2xl border border-charcoal/10 bg-ivory p-6 shadow-[0_24px_60px_-30px_rgba(30,45,30,0.35)] sm:p-10"
          : "space-y-5 px-6 py-7 sm:px-8"
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="af-name">Full name</label>
          <input id="af-name" type="text" autoComplete="name" required
            className={`mt-2 ${field}`} value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)} placeholder="Jane Doe" />
          {errors.fullName && <p className={errCls}>{errors.fullName}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="af-email">Email address</label>
          <input id="af-email" type="email" autoComplete="email" required
            className={`mt-2 ${field}`} value={form.email}
            onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" />
          {errors.email && <p className={errCls}>{errors.email}</p>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="af-checkin">Check-in</label>
          <input id="af-checkin" type="date" min={today()} required
            className={`mt-2 ${field}`} value={form.checkIn}
            onChange={(e) => update("checkIn", e.target.value)} />
          {errors.checkIn && <p className={errCls}>{errors.checkIn}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="af-checkout">Check-out</label>
          <input id="af-checkout" type="date" min={form.checkIn || today()} required
            className={`mt-2 ${field}`} value={form.checkOut}
            onChange={(e) => update("checkOut", e.target.value)} />
          {errors.checkOut && <p className={errCls}>{errors.checkOut}</p>}
        </div>
      </div>

      <div
        className="flex items-center justify-between rounded-lg border border-dashed border-charcoal/20 bg-bone/30 px-4 py-3"
        aria-live="polite"
      >
        <span className="text-[0.65rem] uppercase tracking-[0.22em] text-charcoal/60">
          Length of stay
        </span>
        <span className="font-display text-lg text-charcoal">
          {nights > 0 ? `${nights} Night${nights === 1 ? "" : "s"}` : "—"}
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="af-guests">Guests</label>
          <input id="af-guests" type="number" inputMode="numeric" min={1} max={20} required
            className={`mt-2 ${field}`} value={form.guests}
            onChange={(e) => update("guests", e.target.value)} />
          {errors.guests && <p className={errCls}>{errors.guests}</p>}
        </div>
        <div>
          <label className={labelCls} htmlFor="af-country">Country of residence</label>
          <input id="af-country" type="text" autoComplete="country-name"
            className={`mt-2 ${field}`} value={form.country}
            onChange={(e) => update("country", e.target.value)} placeholder="e.g. United Kingdom" />
        </div>
      </div>

      <div>
        <label className={labelCls}>Room preference</label>
        <Select value={form.roomPreference} onValueChange={(v) => update("roomPreference", v)}>
          <SelectTrigger className={`mt-2 ${field} h-auto`}>
            <SelectValue placeholder="Select a room (optional)" />
          </SelectTrigger>
          <SelectContent>
            {ROOM_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className={labelCls} htmlFor="af-comments">
          Special requests <span className="lowercase tracking-normal text-charcoal/50">(optional)</span>
        </label>
        <textarea id="af-comments" rows={4} maxLength={1000}
          className={`mt-2 ${field} resize-none`}
          placeholder="Airport transfer, dietary needs, celebration setup, late check-in, activity interests…"
          value={form.comments} onChange={(e) => update("comments", e.target.value)} />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="group mt-2 inline-flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_18px_40px_-18px_rgba(52,103,57,0.7)] transition-all hover:brightness-110 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #346739 0%, #427A43 100%)" }}
      >
        <span>{submitting ? "Opening WhatsApp…" : "Send Booking Inquiry via WhatsApp"}</span>
        <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
      </button>

      <div className="flex items-center justify-center gap-2 pt-1 text-center text-[0.7rem] text-charcoal/60">
        <Leaf className="h-3 w-3" style={{ color: "#C0B87A" }} />
        <span>Our reservations team will confirm availability and rates shortly.</span>
      </div>
    </form>
  );
}