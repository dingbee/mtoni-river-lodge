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
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-4 font-display text-3xl leading-none text-foreground">{value}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {trend && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
              trend.positive ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}