import { Monitor, Moon, Sun, Check } from "lucide-react";
import { useOsTheme, type ThemePreference } from "@/lib/os-theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Segmented Appearance control — Light / Dark / System. */
export function AppearanceControl({ className }: { className?: string }) {
  const { preference, setTheme } = useOsTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-[color:var(--os-hairline-strong)] bg-[color:var(--os-surface-2)] p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-[color:var(--os-green-soft)] text-[color:var(--os-green)]"
                : "text-[color:var(--os-ink-2)] hover:text-[color:var(--os-ink)]",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
            {active && <Check className="size-3.5" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
