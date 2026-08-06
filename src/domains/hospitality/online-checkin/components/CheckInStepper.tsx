import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const CHECK_IN_STEPS = ["Verify", "Your details", "Arrival", "Review"] as const;

export function CheckInStepper({ current }: { current: number }) {
  return (
    <ol className="flex w-full items-center gap-2" aria-label="Check-in progress">
      {CHECK_IN_STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs uppercase tracking-[0.18em] sm:block",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < CHECK_IN_STEPS.length - 1 && (
              <span className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
