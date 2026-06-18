import { useEffect, useRef, useState, type ReactNode } from "react";

type Variant = "up" | "fade" | "zoom";

export function Reveal({
  children,
  delay = 0,
  className = "",
  variant = "up",
  threshold = 0.15,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  variant?: Variant;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  const hiddenTransform =
    variant === "fade" ? "none" : variant === "zoom" ? "scale(0.98)" : "translateY(28px)";
  const shownTransform = variant === "zoom" ? "scale(1)" : "translateY(0)";
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? shownTransform : hiddenTransform,
        transition: `opacity 1.1s cubic-bezier(.22,1,.36,1) ${delay}ms, transform 1.1s cubic-bezier(.22,1,.36,1) ${delay}ms`,
        willChange: shown ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
