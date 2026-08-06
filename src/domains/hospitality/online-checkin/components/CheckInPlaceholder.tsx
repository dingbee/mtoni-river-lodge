import type { ReactNode } from "react";
import { ClipboardCheck } from "lucide-react";

/**
 * Shared placeholder shell for guest-facing Online Check-In screens.
 * Reuses the public site design tokens (no new visual language).
 */
export function CheckInPlaceholder({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border text-primary">
        <ClipboardCheck className="h-5 w-5" />
      </span>
      <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-3 font-display text-3xl text-foreground lg:text-4xl">{title}</h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children && <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
    </section>
  );
}
