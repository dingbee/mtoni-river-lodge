import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

interface BackToTopProps {
  /** When true, the button is hidden so it does not overlap an open concierge chat. */
  conciergeOpen?: boolean;
}

/**
 * Persistent "Back to Top" button.
 * - Appears after significant scrolling (~300px).
 * - Anchored to the bottom-left on desktop to avoid the concierge widget in the bottom-right.
 * - Hidden automatically when the concierge chat is open.
 */
export function BackToTop({ conciergeOpen = false }: BackToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const show = visible && !conciergeOpen;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={scrollToTop}
      className={`fixed left-5 z-[998] flex h-12 w-12 items-center justify-center rounded-full shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] transition-all duration-300 ease-out hover:scale-110 active:scale-95 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-8 lg:left-8 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"
      }`}
      style={{ backgroundColor: "#C0B87A", color: "#1E2D1E" }}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}