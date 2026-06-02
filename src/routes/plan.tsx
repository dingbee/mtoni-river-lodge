import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { useState } from "react";
import villa from "@/assets/villa-exterior.jpg";
import { WHATSAPP_URL, WHATSAPP_NOTE } from "@/lib/contact";
import { trackContactClick } from "@/lib/analytics";

const ROOM_OPTIONS = [
  "Riverfront Deluxe Room",
  "Riverfront Standard Room",
  "The Garden & Family Rooms",
] as const;

const WHATSAPP_PHONE = "255752441443";

function buildWhatsAppUrl(fields: {
  arrival: string;
  departure: string;
  guests: string;
  room: string;
  name?: string;
  note?: string;
}) {
  const lines = [
    "Hello Mtoni River Lodge, I would like to check availability.",
    "",
    `Check-in: ${fields.arrival || "—"}`,
    `Check-out: ${fields.departure || "—"}`,
    `Guests: ${fields.guests || "—"}`,
    `Room: ${fields.room || "—"}`,
  ];
  if (fields.name) lines.push(`Name: ${fields.name}`);
  if (fields.note) lines.push("", `Note: ${fields.note}`);
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Plan Your Stay — Mtoni River Lodge" },
      { name: "description", content: "Begin your reservation. Our team responds within 24 hours with a tailored itinerary." },
      { property: "og:image", content: villa },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const [form, setForm] = useState({
    name: "",
    arrival: "",
    departure: "",
    guests: "2",
    room: "",
    email: "",
    phone: "",
    note: "",
  });
  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const waUrl = buildWhatsAppUrl(form);
  const canSubmit = Boolean(form.arrival && form.departure && form.guests && form.room);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    trackContactClick("whatsapp_form", "plan_page");
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <section id="booking-form" className="grid min-h-[100svh] lg:grid-cols-2 pt-20 lg:pt-28 scroll-mt-32">
        <div className="relative hidden overflow-hidden lg:block">
          <img src={villa} alt="Lodge at twilight" className="ken-burns h-full w-full object-cover" />
          <div className="absolute inset-0 bg-charcoal/30" />
          <div className="absolute inset-x-0 bottom-0 p-12 text-ivory">
            <Reveal>
              <p className="eyebrow !text-ivory/70">Reserve</p>
              <h1 className="mt-6 font-display text-5xl leading-[1.05] xl:text-7xl">Begin the<br/>journey.</h1>
              <p className="mt-8 max-w-md text-ivory/80">
                Our reservations team responds within 24 hours with a tailored itinerary, room recommendations, and seasonal notes.
              </p>
            </Reveal>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 pt-32 pb-24 lg:px-16">
          <div className="w-full max-w-md">
            <p className="eyebrow lg:hidden">Reserve</p>
            <h2 className="mt-2 font-display text-4xl lg:hidden">Begin the journey.</h2>

            <form onSubmit={handleSubmit} className="mt-8 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <Field label="Check-in" name="arrival" type="date" value={form.arrival} onChange={update("arrival")} required />
                  <Field label="Check-out" name="departure" type="date" value={form.departure} onChange={update("departure")} required />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <Field label="Guests" name="guests" type="number" value={form.guests} onChange={update("guests")} required />
                  <div>
                    <label className="eyebrow block" htmlFor="room">Select Room Type</label>
                    <select
                      id="room"
                      name="room"
                      value={form.room}
                      onChange={update("room")}
                      required
                      className="mt-3 w-full appearance-none border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-ember"
                    >
                      <option value="" disabled>Choose a room…</option>
                      {ROOM_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="eyebrow block">A note to our team</label>
                  <textarea name="note" rows={4} value={form.note} onChange={update("note")} className="mt-3 w-full border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-ember" placeholder="Anniversary, dietary notes, journey ideas…" />
                </div>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="group inline-flex w-full items-center justify-between border border-charcoal bg-charcoal px-6 py-5 text-[0.72rem] uppercase tracking-[0.32em] text-ivory transition-colors hover:bg-ivory hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-charcoal disabled:hover:text-ivory"
                >
                  <span>Reserve Your Stay</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </button>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  {WHATSAPP_NOTE}
                </p>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackContactClick("whatsapp", "plan_page")}
                  className="group inline-flex w-full items-center justify-between border border-charcoal px-6 py-5 text-[0.72rem] uppercase tracking-[0.32em] transition-colors hover:bg-charcoal hover:text-ivory"
                >
                  <span>Chat on WhatsApp</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
                <p className="pt-2 text-xs text-muted-foreground">
                  Or write directly to <a href="mailto:bookings@mtoniriverlodge.com" className="underline underline-offset-4">bookings@mtoniriverlodge.com</a>
                </p>
                <p className="text-xs italic text-muted-foreground">
                  Reservations & personalized stay assistance.
                </p>
            </form>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function Field({ label, name, type = "text", placeholder, value, onChange, required }: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="eyebrow block" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-3 w-full border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-ember"
      />
    </div>
  );
}
