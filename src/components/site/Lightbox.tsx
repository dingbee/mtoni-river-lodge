import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type LightboxImage = { src: string; alt: string };

/** Minimal, dependency-free luxury lightbox.
 *  Keyboard: ← → Esc. Touch: swipe horizontally.
 *  Scroll-locked, focus-trapped to the close button on open. */
export function Lightbox({
  images,
  startIndex,
  open,
  onClose,
}: {
  images: LightboxImage[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  const next = useCallback(
    () => setIndex((i) => (i + 1) % images.length),
    [images.length],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, next, prev, onClose]);

  if (!open) return null;
  const img = images[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-charcoal/95 backdrop-blur-sm animate-[revealFade_300ms_ease-out_both]"
      onClick={onClose}
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) (dx < 0 ? next() : prev());
        touchStartX.current = null;
      }}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close gallery"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-ivory/40 text-ivory transition hover:bg-ivory/10 lg:right-8 lg:top-8"
      >
        <X className="h-5 w-5" strokeWidth={1.5} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-ivory/30 text-ivory/85 transition hover:bg-ivory/10 hover:text-ivory lg:left-8"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={1.4} />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-ivory/30 text-ivory/85 transition hover:bg-ivory/10 hover:text-ivory lg:right-8"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={1.4} />
          </button>
        </>
      )}

      <figure
        className="relative mx-auto flex max-h-[90svh] max-w-[92vw] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={img.src}
          src={img.src}
          alt={img.alt}
          className="max-h-[82svh] w-auto max-w-full object-contain shadow-deep animate-[scale-in_300ms_ease-out_both]"
          loading="eager"
          decoding="async"
        />
        <figcaption className="mt-4 text-center text-xs uppercase tracking-[0.3em] text-ivory/70">
          {img.alt} <span className="ml-3 text-ivory/40">{index + 1} / {images.length}</span>
        </figcaption>
      </figure>
    </div>
  );
}

/** Click-to-zoom gallery grid. Reuses Tailwind grid; renders its own Lightbox. */
export function LightboxGallery({
  images,
  className = "mt-8 grid gap-4 md:grid-cols-3",
  aspect = "aspect-[4/5]",
}: {
  images: LightboxImage[];
  className?: string;
  aspect?: string;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  return (
    <>
      <div className={className}>
        {images.map((image, i) => (
          <button
            key={image.src + i}
            type="button"
            onClick={() => { setIdx(i); setOpen(true); }}
            className={`${aspect} group relative block overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2`}
            aria-label={`Open image: ${image.alt}`}
          >
            <img
              src={image.src}
              alt={image.alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
            />
            <span className="pointer-events-none absolute inset-0 bg-charcoal/0 transition-colors duration-500 group-hover:bg-charcoal/10" />
          </button>
        ))}
      </div>
      <Lightbox images={images} startIndex={idx} open={open} onClose={() => setOpen(false)} />
    </>
  );
}