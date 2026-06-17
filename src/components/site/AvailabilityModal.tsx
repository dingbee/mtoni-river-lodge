import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Leaf } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  "Riverfront Deluxe Room",
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
    "Source: Website Navigation CTA",
    "",
    "Please advise availability and rates.",
    "",
    "Thank you.",
  ].join("\n");
}

export function AvailabilityModal({
  open,
  onOpenChange,
  location = "nav",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  location?: string;
}) {
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) trackAvailabilityStarted(location);
  }, [open, location]);

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
    const parsed = schema.safeParse({
      ...form,
      guests: Number(form.guests),
    });
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

    // Local backup
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
        source: `nav_cta:${location}`,
      });
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch {
      // ignore storage errors
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
    });

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    const gaParams = {
      room_type: data.roomPreference || "unspecified",
      guest_count: data.guests,
      country: data.country || "unspecified",
      stay_length: n,
      location,
    };
    trackAvailabilityWhatsApp(gaParams);

    toast.success("Redirecting to WhatsApp…", {
      description: "Your details are ready to send.",
    });

    setTimeout(() => {
      window.open(url, "_blank", "noopener,noreferrer");
      trackAvailabilityCompleted(gaParams);
      setSubmitting(false);
      onOpenChange(false);
      setForm(empty);
    }, 600);
  };

  const field =
    "w-full rounded-lg border border-charcoal/15 bg-ivory/60 px-4 py-3 text-sm text-charcoal placeholder:text-charcoal/40 outline-none transition focus:border-charcoal focus:bg-ivory focus:ring-2 focus:ring-charcoal/15";
  const labelCls =
    "text-[0.65rem] font-medium uppercase tracking-[0.22em] text-charcoal/70";
  const errCls = "mt-1 text-xs text-red-600";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border border-charcoal/10 bg-ivory p-0 sm:max-w-[640px]">
        <div
          className="rounded-t-2xl px-6 py-7 sm:px-8"
          style={{
            background:
              "linear-gradient(135deg, #346739 0%, #427A43 60%, #C0B87A 140%)",
          }}
        >
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-ivory/80">
              <Leaf className="h-3.5 w-3.5" />
              Mtoni River Lodge
            </div>
            <DialogTitle className="font-display text-3xl leading-tight text-ivory sm:text-4xl">
              Check Availability
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-ivory/85">
              Share a few details and our team will confirm availability and rates over WhatsApp.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-7 sm:px-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="av-name">Full name</label>
              <input
                id="av-name"
                type="text"
                autoComplete="name"
                className={`mt-2 ${field}`}
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                placeholder="Jane Doe"
                required
              />
              {errors.fullName && <p className={errCls}>{errors.fullName}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="av-email">Email address</label>
              <input
                id="av-email"
                type="email"
                autoComplete="email"
                className={`mt-2 ${field}`}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@example.com"
                required
              />
              {errors.email && <p className={errCls}>{errors.email}</p>}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="av-checkin">Check-in</label>
              <input
                id="av-checkin"
                type="date"
                min={today()}
                className={`mt-2 ${field}`}
                value={form.checkIn}
                onChange={(e) => update("checkIn", e.target.value)}
                required
              />
              {errors.checkIn && <p className={errCls}>{errors.checkIn}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="av-checkout">Check-out</label>
              <input
                id="av-checkout"
                type="date"
                min={form.checkIn || today()}
                className={`mt-2 ${field}`}
                value={form.checkOut}
                onChange={(e) => update("checkOut", e.target.value)}
                required
              />
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
              <label className={labelCls} htmlFor="av-guests">Guests</label>
              <input
                id="av-guests"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                className={`mt-2 ${field}`}
                value={form.guests}
                onChange={(e) => update("guests", e.target.value)}
                required
              />
              {errors.guests && <p className={errCls}>{errors.guests}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="av-country">Country of residence</label>
              <input
                id="av-country"
                type="text"
                autoComplete="country-name"
                className={`mt-2 ${field}`}
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                placeholder="e.g. United Kingdom"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Room preference</label>
            <Select
              value={form.roomPreference}
              onValueChange={(v) => update("roomPreference", v)}
            >
              <SelectTrigger className={`mt-2 ${field} h-auto`}>
                <SelectValue placeholder="Select a room (optional)" />
              </SelectTrigger>
              <SelectContent>
                {ROOM_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelCls} htmlFor="av-comments">
              Special requests <span className="lowercase tracking-normal text-charcoal/50">(optional)</span>
            </label>
            <textarea
              id="av-comments"
              rows={3}
              maxLength={1000}
              className={`mt-2 ${field} resize-none`}
              placeholder="Airport transfer, dietary needs, celebration setup, late check-in, activity interests…"
              value={form.comments}
              onChange={(e) => update("comments", e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="group mt-2 inline-flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_18px_40px_-18px_rgba(52,103,57,0.7)] transition-all hover:brightness-110 disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, #346739 0%, #427A43 100%)",
            }}
          >
            <span>{submitting ? "Opening WhatsApp…" : "Send Availability Request"}</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </button>

          <div className="flex items-center justify-center gap-2 pt-1 text-center text-[0.7rem] text-charcoal/60">
            <Leaf className="h-3 w-3" style={{ color: "#C0B87A" }} />
            <span>Responses typically within 15 minutes during business hours.</span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}