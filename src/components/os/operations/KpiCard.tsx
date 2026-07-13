import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

export function KpiCard({ label, value, hint, icon: Icon, className, tone }: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  tone?: "default" | "warn" | "danger" | "success";
}) {
  const toneCls = tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : tone === "success" ? "text-emerald-600" : "text-foreground";
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}