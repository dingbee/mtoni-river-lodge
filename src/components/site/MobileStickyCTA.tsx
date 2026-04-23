import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

/**
 * Mobile-only sticky "Reserve Your Stay" CTA.
 * - Appears after scrolling ~40% of the first viewport.
 * - Hides when the booking form (#booking-form) or footer (#site-footer) is visible.
 * - On the /plan route, scrolls to the booking form. Elsewhere, links to /plan#booking-form.
 */
export function MobileStickyCTA() {
  const [scrolled, setScrolled] = useState(false);
  const [hiddenByTarget, setHiddenByTarget] = useState(false);
  const observersAttached = useRef(false);
  const { location } = useRouterState();

  useEffect(() => {
    const onScroll = () => {
      // Reveal after a short scroll (~100px).
      setScrolled(window.scrollY > 100);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    // Re-attach observers on route change (DOM nodes may differ).
    observersAttached.current = false;
    setHiddenByTarget(false);

    const targets: Element[] = [];
    const form = document.getElementById("booking-form");
    const footer = document.getElementById("site-footer");
    if (form) targets.push(form);
    if (footer) targets.push(footer);
    if (targets.length === 0) return;

    const visibility = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visibility.set(e.target, e.isIntersecting);
        const anyVisible = Array.from(visibility.values()).some(Boolean);
        setHiddenByTarget(anyVisible);
      },
      { threshold: 0.05 }
    );
    targets.forEach((t) => io.observe(t));
    observersAttached.current = true;
    return () => io.disconnect();
  }, [location.pathname]);

  const visible = scrolled && !hiddenByTarget;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[999] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-6 opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <Link
        to="/book"
        className="flex w-full items-center justify-center rounded-full px-6 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98] hover:brightness-105"
        style={{ backgroundColor: "#C0B87A", color: "#1E2D1E" }}
      >
        Check Availability
      </Link>
    </div>
  );
}