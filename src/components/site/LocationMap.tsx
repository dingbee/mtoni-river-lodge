import { Reveal } from "@/components/site/Reveal";

// Mtoni River Lodge — Gomba Estate, Arusha, Tanzania
const EMBED_URL = "https://www.google.com/maps?q=Mtoni%20River%20Lodge&output=embed";
const DIRECTIONS_URL = "https://www.google.com/maps?q=Mtoni+River+Lodge";

export function LocationMap() {
  return (
    <section className="relative bg-ivory px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-[1300px]">
        <Reveal>
          <div className="mb-12 text-center">
            <p className="eyebrow">Find Us</p>
            <h2 className="mt-6 font-display text-4xl leading-[1.1] lg:text-5xl">
              On the banks of the Nduruma,<br />
              <em className="italic text-charcoal/75">forty minutes from Arusha airport.</em>
            </h2>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="relative overflow-hidden rounded-sm border border-charcoal/10 shadow-soft">
            <div className="relative w-full" style={{ minHeight: "400px" }}>
              <iframe
                src={EMBED_URL}
                title="Map showing Mtoni River Lodge location near Arusha, Tanzania"
                width="100%"
                height="450"
                style={{ border: 0, display: "block" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[400px] w-full sm:h-[450px] lg:h-[520px]"
              />
            </div>

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
                Open in Google Maps →
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
