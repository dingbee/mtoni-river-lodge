import { ArrowRight, BedDouble, Car, Flower2, Mountain, Users, UtensilsCrossed, Waves, Wifi, type LucideIcon } from "lucide-react";
import { visibleOffer, type DirectHighlight, type DirectOffer, type HighlightIcon } from "@/lib/direct-booking-content";

/**
 * Optional sections of the guest booking template. Every component renders
 * nothing when the property has not provided its content, and all colours come
 * from the property's derived theme tokens (see direct-booking-theme.ts).
 */

const ICONS: Record<HighlightIcon, LucideIcon> = {
  stay: BedDouble,
  dining: UtensilsCrossed,
  wellness: Flower2,
  outdoors: Mountain,
  pool: Waves,
  wifi: Wifi,
  transfer: Car,
  family: Users,
};

/** Value words on the hero image, separated by thin rules. */
export function DirectValueWords({ words, className = "" }: { words: string[]; className?: string }) {
  if (words.length === 0) return null;
  return <ul aria-label="What to expect" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-medium uppercase tracking-[0.18em] ${className}`}>
    {words.map((word, index) => <li key={word + index} className="flex items-center gap-3">
      {index > 0 && <span aria-hidden="true" className="h-px w-5 bg-current opacity-50" />}
      <span>{word}</span>
    </li>)}
  </ul>;
}

/**
 * Up to three property photographs, numbered like the template. Uses the
 * gallery images the property already manages in Property Branding.
 */
export function DirectGalleryStrip({ images, propertyName, className = "px-4 sm:px-8" }: { images: string[]; propertyName: string; className?: string }) {
  const shown = images.slice(0, 3);
  if (shown.length === 0) return null;
  return <section aria-label={`Photographs of ${propertyName}`} className={`mx-auto mt-6 max-w-7xl sm:mt-8 ${className}`}>
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0">
      {shown.map((url, index) => <figure key={url} className="relative aspect-[4/3] w-[78%] shrink-0 snap-start overflow-hidden rounded-[1.25rem] bg-[var(--direct-surface-sunken)] sm:w-auto">
        <img src={url} alt={`${propertyName} — photograph ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
        <figcaption className="absolute bottom-3 right-4 text-sm font-medium tabular-nums text-white">{String(index + 1).padStart(2, "0")}</figcaption>
      </figure>)}
    </div>
  </section>;
}

/** Up to four highlight cards (dining, wellness, activities…). */
export function DirectHighlights({ highlights, className = "" }: { highlights: DirectHighlight[]; className?: string }) {
  if (highlights.length === 0) return null;
  const columns = highlights.length >= 4 ? "lg:grid-cols-4" : highlights.length === 3 ? "lg:grid-cols-3" : "";
  return <section aria-label="Highlights" className={className}>
    <div className={`grid gap-3 sm:grid-cols-2 ${columns}`}>
      {highlights.map((item, index) => {
        const Icon = ICONS[item.icon] ?? BedDouble;
        return <div key={item.title + index} className="flex gap-3 rounded-[1.1rem] border border-[var(--direct-border)] bg-[var(--direct-surface)] p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--direct-primary-soft)] text-[var(--direct-on-primary-soft)]"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--direct-text)]">{item.title}</h3>
            {item.description && <p className="mt-1 text-xs leading-5 text-[var(--direct-muted)]">{item.description}</p>}
          </div>
        </div>;
      })}
    </div>
  </section>;
}

function isExternal(url: string) {
  return /^https:\/\//.test(url);
}

/** Full-width offer banner in the property's primary colour. */
export function DirectOfferBanner({ offer, className = "" }: { offer: DirectOffer | null; className?: string }) {
  const shown = visibleOffer(offer);
  if (!shown) return null;
  return <section aria-label={shown.eyebrow || "Offer"} className={`overflow-hidden rounded-[1.5rem] bg-[var(--direct-primary)] text-[var(--direct-on-primary)] ${className}`}>
    <div className={`grid items-center gap-5 p-4 sm:p-6 ${shown.imageUrl ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
      {shown.imageUrl && <img src={shown.imageUrl} alt="" loading="lazy" className="aspect-[16/9] w-full rounded-[1.1rem] object-cover md:aspect-[4/3]" />}
      <div className="px-2 py-2 sm:px-4">
        {shown.eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{shown.eyebrow}</p>}
        <h2 className="direct-display mt-2 text-3xl font-medium leading-[1.05] sm:text-4xl">{shown.title}</h2>
        {shown.body && <p className="mt-3 max-w-md text-sm leading-6 opacity-85">{shown.body}</p>}
        {shown.ctaLabel && shown.ctaUrl && <a
          href={shown.ctaUrl}
          {...(isExternal(shown.ctaUrl) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-current px-5 text-xs font-semibold uppercase tracking-[0.14em] transition hover:opacity-80"
        >{shown.ctaLabel}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></a>}
      </div>
    </div>
  </section>;
}
