import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { useState } from "react";
import villa from "@/assets/villa-exterior.jpg";

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
  const [sent, setSent] = useState(false);
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <section className="grid min-h-[100svh] lg:grid-cols-2">
        <div className="relative hidden overflow-hidden lg:block">
          <img src={villa} alt="Lodge at twilight" className="ken-burns h-full w-full object-cover" />
          <div className="absolute inset-0 bg-charcoal/30" />
          <div className="absolute inset-x-0 bottom-0 p-12 text-ivory">
            <Reveal>
              <p className="eyebrow !text-ivory/70">Reserve</p>
              <h1 className="mt-6 font-display text-5xl leading-[1.05] xl:text-7xl">Begin the<br/>journey.</h1>
              <p className="mt-8 max-w-md text-ivory/80">
                Our reservations team responds within 24 hours with a tailored itinerary, suite recommendations, and seasonal notes.
              </p>
            </Reveal>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 pt-32 pb-24 lg:px-16">
          <div className="w-full max-w-md">
            <p className="eyebrow lg:hidden">Reserve</p>
            <h2 className="mt-2 font-display text-4xl lg:hidden">Begin the journey.</h2>

            {sent ? (
              <Reveal>
                <div className="border border-border p-12 text-center">
                  <p className="font-display text-3xl">Asante sana.</p>
                  <p className="mt-4 text-charcoal/70">Your enquiry has reached the riverbank. We will respond within 24 hours.</p>
                </div>
              </Reveal>
            ) : (
              <form
                onSubmit={(e)=>{e.preventDefault(); setSent(true);}}
                className="space-y-8"
              >
                <Field label="Full name" name="name" />
                <div className="grid grid-cols-2 gap-6">
                  <Field label="Arrival" name="arrival" type="date" />
                  <Field label="Departure" name="departure" type="date" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <Field label="Guests" name="guests" type="number" defaultValue="2" />
                  <Field label="Suite preference" name="suite" placeholder="River / Forest / House" />
                </div>
                <Field label="Email" name="email" type="email" />
                <Field label="Phone" name="phone" type="tel" />
                <div>
                  <label className="eyebrow block">A note to our team</label>
                  <textarea name="note" rows={4} className="mt-3 w-full border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-ember" placeholder="Anniversary, dietary notes, journey ideas…" />
                </div>
                <button type="submit" className="group inline-flex w-full items-center justify-between border border-charcoal px-6 py-5 text-[0.72rem] uppercase tracking-[0.32em] transition-colors hover:bg-charcoal hover:text-ivory">
                  <span>Send enquiry</span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </button>
                <p className="pt-4 text-xs text-muted-foreground">
                  Or write directly to <a href="mailto:info@mtoniriverlodge.com" className="underline underline-offset-4">info@mtoniriverlodge.com</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function Field({ label, name, type="text", placeholder, defaultValue }: { label: string; name: string; type?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div>
      <label className="eyebrow block" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} className="mt-3 w-full border-b border-border bg-transparent pb-2 text-base outline-none transition-colors focus:border-ember" />
    </div>
  );
}
