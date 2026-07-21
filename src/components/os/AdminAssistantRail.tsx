import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, AlertTriangle, Sun, ArrowRight, Bot } from "lucide-react";
import { getOpsDashboard } from "@/lib/operations.functions";
import { Link } from "@tanstack/react-router";

export function AdminAssistantRail() {
  const fn = useServerFn(getOpsDashboard);
  const q = useQuery({ queryKey: ["os-rail-ops"], queryFn: () => fn(), staleTime: 60_000 });
  const d: any = q.data ?? {};
  const today = d.today ?? {};
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const suggestions = [
    { label: "Rooms needing cleaning", href: "/admin/operations/housekeeping" },
    { label: "Today's arrivals", href: "/admin/operations" },
    { label: "Overdue payments", href: "/admin/finance/payments" },
    { label: "Room board", href: "/admin/operations/rooms" },
  ];

  return (
    <div className="flex h-full flex-col gap-5 p-5 text-sm">
      <div className="os-fade-in">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[color:var(--os-ink-3)]">
          <Sun className="size-3.5" /> {dateStr} · {timeStr}
        </div>
        <h2 className="mt-2 font-display text-2xl leading-tight text-[color:var(--os-ink)]">Mtoni AI</h2>
        <p className="mt-1 text-xs text-[color:var(--os-ink-3)]">Your operational co-pilot.</p>
      </div>

      <div className="os-card os-fade-in os-fade-in-delay-1 p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[color:var(--os-ink-3)]">
          <Sparkles className="size-3.5 text-[color:var(--os-gold)]" /> Daily summary
        </div>
        <p className="mt-2 leading-relaxed text-[color:var(--os-ink-2)]">
          {(today.in_house ?? 0)} guests in-house · {(today.arrivals ?? 0)} arriving · {(today.departures ?? 0)} departing.
          {" "}Housekeeping has {(today.dirty_rooms ?? 0)} rooms pending.
        </p>
      </div>

      <div className="os-fade-in os-fade-in-delay-2">
        <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-[color:var(--os-ink-3)]">Suggested actions</div>
        <ul className="space-y-1.5">
          {suggestions.map((s) => (
            <li key={s.href}>
              <Link
                to={s.href as any}
                className="group flex items-center justify-between rounded-xl border border-[color:var(--os-hairline)] bg-[color:var(--os-surface)] px-3 py-2 text-[color:var(--os-ink-2)] transition-colors hover:border-[color:var(--os-hairline-strong)] hover:text-[color:var(--os-ink)]"
              >
                <span className="truncate">{s.label}</span>
                <ArrowRight className="size-3.5 shrink-0 opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {(today.maintenance_rooms ?? 0) > 0 && (
        <div className="os-fade-in os-fade-in-delay-3 flex items-start gap-2 rounded-xl border border-[color:var(--os-warn-soft)] bg-[color:var(--os-warn-soft)] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color:var(--os-warn)]" />
          <div className="text-xs leading-relaxed text-[color:var(--os-ink-2)]">
            <div className="font-medium text-[color:var(--os-ink)]">Maintenance in progress</div>
            {today.maintenance_rooms} room{today.maintenance_rooms === 1 ? "" : "s"} currently off-inventory.
          </div>
        </div>
      )}

      <div className="mt-auto os-fade-in os-fade-in-delay-4">
        <Link
          to="/admin/ai"
          className="flex items-center justify-center gap-2 rounded-xl bg-[color:var(--os-ink)] px-4 py-2.5 text-xs font-medium text-[color:var(--os-surface)] transition-opacity hover:opacity-90"
        >
          <Bot className="size-4" /> Open AI Command Centre
        </Link>
      </div>
    </div>
  );
}