import { useEffect, useState } from "react";

type Availability = { available_units: number; total_units: number };

export function RoomAvailability({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [availability, setAvailability] = useState<Availability | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/rooms/status")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("availability unavailable")))
      .then((payload) => {
        if (cancelled) return;
        const item = payload.rooms?.find((r: { slug: string }) => r.slug === slug);
        if (item) setAvailability({
          available_units: Number(item.available_units ?? 0),
          total_units: Number(item.total_units ?? 0),
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [slug]);

  if (!availability) {
    return <p className={compact ? "text-xs text-charcoal/50" : "text-sm text-charcoal/55"}>Checking live availability…</p>;
  }

  const { available_units: available, total_units: total } = availability;
  const percent = total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0;
  const low = available > 0 && available <= Math.max(2, Math.ceil(total * 0.25));

  return (
    <div className={compact ? "mt-2" : "mt-5 border-t border-charcoal/10 pt-5"}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={compact ? "text-sm font-medium" : "font-display text-xl"}>
            {available} of {total} available
          </p>
          <p className="mt-1 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-charcoal/50">
            {available === 0 ? "Currently unavailable" : low ? "Limited availability" : "Live availability"}
          </p>
        </div>
        <span className="h-2.5 w-2.5 rounded-full bg-forest" aria-hidden="true" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-charcoal/10">
        <div className="h-full rounded-full bg-forest transition-all duration-500" style={{ width: percent + "%" }} />
      </div>
    </div>
  );
}
