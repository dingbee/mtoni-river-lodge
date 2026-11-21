import { useEffect, useState } from "react";
import { ArrowRight, BedDouble, ChevronLeft, ChevronRight, Eye, Maximize2, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type RoomDetails = {
  name: string;
  category?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  details?: string | null;
  maxOccupancy?: number | null;
  capacityAdults?: number | null;
  capacityChildren?: number | null;
  bedLabel?: string | null;
  bathroomLabel?: string | null;
  sizeLabel?: string | null;
  viewLabel?: string | null;
  amenities: string[];
  images: string[];
};

/**
 * Room pop-up for guests: every photograph of the room (cover first, then its
 * gallery) with thumbnails, the full description, occupancy and amenities, and
 * the same price and booking action as the room card. Rendered in a portal, so
 * the property's theme tokens are passed in explicitly.
 */
export function RoomDetailsDialog({ room, open, onOpenChange, themeStyle, price, action }: {
  room: RoomDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeStyle: React.CSSProperties;
  /** Price block exactly as shown on the room card. */
  price: React.ReactNode;
  /** Primary action: choose the room after a search, otherwise check availability. */
  action: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => { if (open) setIndex(0); }, [open]);
  const count = room.images.length;
  const go = (step: number) => setIndex((current) => (current + step + count) % count);
  const facts = [
    room.maxOccupancy ? { icon: Users, text: `Sleeps up to ${room.maxOccupancy}${room.capacityAdults ? ` · ${room.capacityAdults} adults` : ""}${room.capacityChildren ? ` · ${room.capacityChildren} children` : ""}` } : null,
    room.bedLabel ? { icon: BedDouble, text: room.bedLabel } : null,
    room.sizeLabel ? { icon: Maximize2, text: room.sizeLabel } : null,
    room.viewLabel ? { icon: Eye, text: room.viewLabel } : null,
  ].filter(Boolean) as Array<{ icon: typeof Users; text: string }>;
  const body = [room.description || room.shortDescription, room.details].filter(Boolean) as string[];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent style={themeStyle} className="direct-booking max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl gap-0 overflow-y-auto rounded-[1.5rem] border-[var(--direct-border)] bg-[var(--direct-surface)] p-0 text-[var(--direct-text)] [&>button:last-child]:hidden">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--direct-surface-sunken)] sm:rounded-t-[1.5rem]">
        {count > 0
          ? <img key={room.images[index]} src={room.images[index]} alt={`${room.name} — photograph ${index + 1} of ${count}`} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-sm text-[var(--direct-muted)]">Room photographs not provided</div>}
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close room details" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60"><X className="h-5 w-5" /></button>
        {count > 1 && <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous photograph" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow transition hover:bg-white"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next photograph" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black shadow transition hover:bg-white"><ChevronRight className="h-5 w-5" /></button>
          <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">{index + 1} / {count}</span>
        </>}
      </div>
      {count > 1 && <div className="flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden" aria-label="Room photographs">
        {room.images.map((url, i) => <button key={url + i} type="button" onClick={() => setIndex(i)} aria-label={`Show photograph ${i + 1}`} aria-current={i === index} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === index ? "border-[var(--direct-primary)]" : "border-transparent opacity-70 hover:opacity-100"}`}><img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /></button>)}
      </div>}

      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          {room.category && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--direct-muted)]">{room.category}</p>}
          <DialogTitle className="direct-display mt-1 text-[2rem] font-medium leading-tight">{room.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--direct-text-subtle)]">
              {body.length ? body.map((paragraph, i) => <p key={i} className="whitespace-pre-line">{paragraph}</p>) : <p>{room.shortDescription || "Room details"}</p>}
            </div>
          </DialogDescription>
          {facts.length > 0 && <ul className="mt-5 grid gap-2 text-sm text-[var(--direct-text-subtle)] sm:grid-cols-2">
            {facts.map(({ icon: Icon, text }) => <li key={text} className="flex items-center gap-2"><Icon className="h-4 w-4 text-[var(--direct-muted)]" aria-hidden="true" />{text}</li>)}
            {room.bathroomLabel && <li className="flex items-center gap-2 sm:col-span-2">{room.bathroomLabel}</li>}
          </ul>}
          {room.amenities.length > 0 && <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--direct-muted)]">Amenities</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">{room.amenities.map((item) => <li key={item} className="rounded-full bg-[var(--direct-surface-muted)] px-3 py-1 text-xs text-[var(--direct-text-subtle)]">{item}</li>)}</ul>
          </div>}
        </div>
        <div className="self-start rounded-[1.1rem] border border-[var(--direct-border)] bg-[var(--direct-surface-muted)] p-4">
          {price}
          <button type="button" disabled={action.disabled} onClick={action.onClick} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--direct-primary)] text-xs font-semibold text-[var(--direct-on-primary)] transition hover:bg-[var(--direct-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40">{action.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
