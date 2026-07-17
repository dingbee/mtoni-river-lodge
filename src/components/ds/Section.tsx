import type { ElementType, ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./Container";

type Tone = "default" | "muted" | "dark";
type Width = "reading" | "content" | "wide" | "full";
type Pad = "sm" | "md" | "lg";

const toneClass: Record<Tone, string> = {
  default: "bg-background text-foreground",
  muted: "bg-muted text-foreground",
  dark: "bg-charcoal text-ivory",
};

const padClass: Record<Pad, string> = {
  sm: "py-16",
  md: "py-24",
  lg: "py-32",
};

/**
 * Design-system section wrapper. Combines background tone, fluid
 * vertical padding (via --space-* tokens), and a standard-width
 * Container in one primitive.
 *
 *   <Section tone="muted" pad="md" width="content">…</Section>
 */
export function Section({
  as: Tag = "section",
  tone = "default",
  pad = "md",
  width = "content",
  className,
  children,
  containerClassName,
  ...rest
}: {
  as?: ElementType;
  tone?: Tone;
  pad?: Pad;
  width?: Width;
  containerClassName?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  return (
    <Tag className={cn(toneClass[tone], padClass[pad], className)} {...rest}>
      <Container variant={width} className={containerClassName}>
        {children}
      </Container>
    </Tag>
  );
}