import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * The property's own gallery (Property Branding → gallery), shown as its own
 * section so every uploaded image is visible to guests, with a full-screen
 * viewer. Renders nothing when the gallery is empty.
 */
export function PropertyGallery({ images, propertyName, themeStyle, className = "" }: {
  images: string[];
  propertyName: string;
  themeStyle: React.CSSProperties;
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  const count = images.length;
  const go = (step: number) => setOpen((current) => (current === null ? 0 : (current + step + count) % count));
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
    <Dialog open={open !== null} onOpenChange={(value) => { if (!value) setOpen(null); }}>
      <DialogContent style={themeStyle} className="direct-booking w-[calc(100%-1.5rem)] max-w-5xl border-0 bg-black p-0 [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{propertyName} gallery</DialogTitle>
        {open !== null && <div className="relative">
          <img src={images[open]} alt={`${propertyName} — photograph ${open + 1} of ${count}`} className="max-h-[85vh] w-full object-contain" />
          <button type="button" onClick={() => setOpen(null)} aria-label="Close gallery" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white"><X className="h-5 w-5" /></button>
          {count > 1 && <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photograph" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next photograph" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black"><ChevronRight className="h-5 w-5" /></button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">{open + 1} / {count}</span>
          </>}
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}
