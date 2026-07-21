import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  trend?: { value: string; positive?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "os-card os-fade-in p-5 transition-all duration-300 hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-[color:var(--os-ink-3)]">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color:var(--os-green-soft)] text-[color:var(--os-green)]">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-4 font-display text-[2rem] leading-none tracking-tight text-[color:var(--os-ink)] tabular-nums">
        {value}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {hint && <p className="text-xs text-[color:var(--os-ink-3)]">{hint}</p>}
        {trend && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
              trend.positive
                ? "bg-[color:var(--os-success-soft)] text-[color:var(--os-success)]"
                : "bg-[color:var(--os-danger-soft)] text-[color:var(--os-danger)]",
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}