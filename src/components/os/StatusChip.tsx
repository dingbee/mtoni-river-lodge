import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-primary/10 text-primary",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-100 text-sky-900",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.18em]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}