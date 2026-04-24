import { MapPin } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";

// Mtoni River Lodge — Gomba Estate, Arusha, Tanzania
const LAT = -3.4219;
const LNG = 36.7869;
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}&destination_place_id=Mtoni+River+Lodge`;

// Static, muted OpenStreetMap tile via staticmap.openstreetmap.de — no API key, fast.
// Falls back gracefully (image only). Uses a soft, low-saturation feel by overlaying ivory.
const STATIC_MAP_URL = `https://staticmap.openstreetmap.de/staticmap.php?center=${LAT},${LNG}&zoom=12&size=1200x600&maptype=mapnik&markers=${LAT},${LNG},lightblue1`;

export function LocationMap() {
  return (
    <section className="relative bg-ivory px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-[1300px]">
        <Reveal>
          <div className="mb-12 text-center">
            <p className="eyebrow">Find Us</p>
            <h2 className="mt-6 font-display text-4xl leading-[1.1] lg:text-5xl">
              On the banks of the Nduruma,<br />
              <em className="italic text-charcoal/75">forty minutes from Arusha.</em>
            </h2>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="relative overflow-hidden rounded-sm border border-charcoal/10 shadow-soft">
            <a
              href={DIRECTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Mtoni River Lodge location in Google Maps"
              className="group relative block aspect-[2/1] w-full"
            >
              <img
                src={STATIC_MAP_URL}
                alt="Map showing Mtoni River Lodge location near Arusha, Tanzania"
                loading="lazy"
                width={1200}
                height={600}
                className="h-full w-full object-cover grayscale-[35%] saturate-[0.7] transition-transform duration-700 group-hover:scale-[1.02]"
              />
              {/* Soft ivory wash for a calm, branded feel */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--ivory) 22%, transparent), color-mix(in oklab, var(--charcoal) 18%, transparent))",
                }}
              />
              {/* Pin marker overlay */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-charcoal text-ivory shadow-deep ring-4 ring-ivory/70">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="mt-1 h-3 w-[2px] bg-charcoal/70" />
                </div>
              </div>
            </a>

            {/* Caption + CTA bar */}
            <div className="flex flex-col items-start justify-between gap-4 border-t border-charcoal/10 bg-bone px-6 py-5 sm:flex-row sm:items-center lg:px-8">
              <div>
                <p className="font-display text-lg leading-tight">Mtoni River Lodge</p>
                <p className="text-sm text-charcoal/65">
                  Gomba Estate, Arusha · Tanzania
                </p>
              </div>
              <a
                href={DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 border border-charcoal px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-charcoal transition-colors hover:bg-charcoal hover:text-ivory"
              >
                Get Directions →
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
