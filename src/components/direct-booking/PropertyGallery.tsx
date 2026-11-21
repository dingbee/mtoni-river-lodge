import { useState } from "react";
import { PhotoLightbox } from "@/components/direct-booking/PhotoLightbox";

/**
 * The property's own gallery (Property Branding → gallery), shown as its own
 * section so every uploaded image is visible to guests, with a full-screen
 * viewer. Renders nothing when the gallery is empty.
 */
export function PropertyGallery({ images, propertyName, className = "" }: {
  images: string[];
  propertyName: string;
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  const count = images.length;
  return <section id="gallery" aria-label={`${propertyName} gallery`} className={`scroll-mt-24 ${className}`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--direct-muted)]">Gallery</p>
    <h2 className="direct-display mt-1.5 text-[2.1rem] font-medium leading-none text-[var(--direct-text)] sm:text-[2.6rem]">Inside {propertyName}</h2>
    <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {images.map((url, index) => <li key={url + index} className={index === 0 && count > 2 ? "col-span-2 row-span-2" : ""}>
        <button type="button" onClick={() => setOpen(index)} aria-label={`Open photograph ${index + 1} of ${count}`} className="block h-full w-full overflow-hidden rounded-[1.1rem] bg-[var(--direct-surface-sunken)]">
          <img src={url} alt={`${propertyName} — photograph ${index + 1}`} loading="lazy" className={`w-full object-cover transition duration-500 hover:scale-[1.03] ${index === 0 && count > 2 ? "aspect-square h-full" : "aspect-[4/3]"}`} />
        </button>
      </li>)}
    </ul>
    <PhotoLightbox images={images} title={`${propertyName} gallery`} open={open !== null} startIndex={open ?? 0} onOpenChange={(value) => { if (!value) setOpen(null); }} />
  </section>;
}
