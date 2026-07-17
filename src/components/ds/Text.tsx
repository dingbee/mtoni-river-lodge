import type { ElementType, ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Role =
  | "display"
  | "hero"
  | "h1"
  | "h2"
  | "h3"
  | "body-lg"
  | "body"
  | "small"
  | "caption";

const roleClass: Record<Role, string> = {
  display: "type-display",
  hero: "type-hero",
  h1: "type-h1",
  h2: "type-h2",
  h3: "type-h3",
  "body-lg": "type-body-lg",
  body: "type-body",
  small: "type-small",
  caption: "type-caption",
};

const defaultTag: Record<Role, ElementType> = {
  display: "h1",
  hero: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  "body-lg": "p",
  body: "p",
  small: "p",
  caption: "span",
};

/**
 * Semantic typography primitive. Applies a role token (--type-*)
 * rather than raw Tailwind text-* sizes.
 *
 *   <Text role="h1">Sanctuary on the river</Text>
 *   <Text role="body-lg" as="p">…</Text>
 */
export function Text({
  as,
  role = "body",
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  role?: Role;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const Tag = as ?? defaultTag[role];
  return (
    <Tag className={cn(roleClass[role], className)} {...rest}>
      {children}
    </Tag>
  );
}