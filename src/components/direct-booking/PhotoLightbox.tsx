import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Full-screen photo viewer: swipe or use the arrows, tap a thumbnail to jump,
 * Escape or × to close. Used for a room's gallery and the property gallery.
 */
export function PhotoLightbox({ images, title, open, startIndex = 0, onOpenChange }: {
  images: string[];
  title: string;
  open: boolean;
  startIndex?: number;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const track = useRef<HTMLDivElement>(null);
  const count = images.length;

  useEffect(() => {
    if (!open) return;
    setIndex(startIndex);
    // Position the swipe track on the requested photo once the dialog has rendered.
    requestAnimationFrame(() => {
      const el = track.current;
      if (el) el.scrollTo({ left: startIndex * el.clientWidth, behavior: "auto" });
    });
  }, [open, startIndex]);

  const goTo = (next: number) => {
    const target = (next + count) % count;
    setIndex(target);
    const el = track.current;
    if (el) el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (!open || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goTo(index + 1);
      if (event.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (count === 0) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 border-0 bg-black p-0 text-white sm:rounded-none [&>button:last-child]:hidden">
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">Photograph {index + 1} of {count}</DialogDescription>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-sm font-medium">{title}</p>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-white/75">{index + 1} / {count}</span>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close photos" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={track} onScroll={(event) => { const el = event.currentTarget; const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (next !== index) setIndex(next); }} className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((url, i) => <div key={url + i} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-2">
            <img src={url} alt={`${title} — photograph ${i + 1} of ${count}`} loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"} className="max-h-full max-w-full object-contain" />
          </div>)}
        </div>
        {count > 1 && <>
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Previous photograph" className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black transition hover:bg-white sm:flex"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => goTo(index + 1)} aria-label="Next photograph" className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black transition hover:bg-white sm:flex"><ChevronRight className="h-5 w-5" /></button>
        </>}
      </div>
      {count > 1 && <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((url, i) => <button key={url + i} type="button" onClick={() => goTo(i)} aria-label={`Show photograph ${i + 1}`} aria-current={i === index} className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition ${i === index ? "border-white" : "border-transparent opacity-55 hover:opacity-100"}`}><img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /></button>)}
      </div>}
    </DialogContent>
  </Dialog>;
}
