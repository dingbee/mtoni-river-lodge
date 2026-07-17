import type { ElementType, ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "reading" | "content" | "wide" | "full";

/**
 * Design-system container. Standardises page-column widths.
 *
 *   reading (68ch)   long-form editorial / article body
 *   content (72rem)  default page column
 *   wide    (88rem)  marketing / gallery sections
 *   full    (100%)   edge-to-edge blocks
 *
 * Reach for this instead of hard-coded max-w-[1100px] / max-w-6xl values.
 */
export function Container({
  as: Tag = "div",
  variant = "content",
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  variant?: Variant;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn(`container-${variant}`, className)} {...rest}>
      {children}
    </Tag>
  );
}