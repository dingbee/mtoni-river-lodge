import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "green" | "gold" | "info" | "warn" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  green: "bg-[color:var(--os-green-soft)]  text-[color:var(--os-green)]",
  gold: "bg-[color:var(--os-gold-soft)]   text-[color:var(--os-gold)]",
  info: "bg-[color:var(--os-info-soft)]   text-[color:var(--os-info)]",
  warn: "bg-[color:var(--os-warn-soft)]   text-[color:var(--os-warn)]",
  danger: "bg-[color:var(--os-danger-soft)] text-[color:var(--os-danger)]",
  neutral: "bg-white/[0.04] text-[color:var(--os-ink-2)]",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  tone = "green",
  className,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  trend?: { value: string; positive?: boolean };
  tone?: Tone;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        cn("os-card os-fade-in relative min-w-0 overflow-hidden hover:-translate-y-[1px]", compact ? "p-3" : "p-4 sm:p-5"),
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-[0.10] blur-2xl"
        style={{ background: "radial-gradient(closest-side, var(--os-green), transparent 70%)" }}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-[color:var(--os-ink-3)]">
          {label}
        </p>
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/[0.05]",
              toneClass[tone],
            )}
          >
            <Icon className="h-[16px] w-[16px]" />
          </span>
        )}
      </div>
      <p className={cn("break-words font-sans font-semibold leading-tight tracking-tight text-[color:var(--os-ink)] tabular-nums", compact ? "mt-2 text-xl sm:text-2xl" : "mt-4 text-[2.4rem] sm:mt-5")>
        {value}
      </p>
      <div className={cn("flex items-center justify-between gap-2", compact ? "mt-2" : "mt-4")}>
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
