import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

/**
 * Mobile-only sticky "Reserve Your Stay" CTA.
 * - Appears after scrolling ~40% of the first viewport.
 * - Hides when the booking form (#booking-form) or footer (#site-footer) is visible.
 * - On the /plan route, scrolls to the booking form. Elsewhere, links to /plan#booking-form.
 */
export function MobileStickyCTA() {
  const [scrolledEnough, setScrolledEnough] = useState(false);
  const [hiddenByTarget, setHiddenByTarget] = useState(false);
  const observersAttached = useRef(false);
  const { location } = useRouterState();
  const isPlan = location.pathname === "/plan";

  useEffect(() => {
    const onScroll = () => {
      const threshold = window.innerHeight * 0.4;
      setScrolledEnough(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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

  const handleClick = (e: React.MouseEvent) => {
    if (!isPlan) return; // let Link navigate to /plan#booking-form
    e.preventDefault();
    const form = document.getElementById("booking-form");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visible = scrolledEnough && !hiddenByTarget;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-6 opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <Link
        to="/plan"
        hash="booking-form"
        onClick={handleClick}
        className="flex w-full items-center justify-center rounded-full bg-charcoal px-6 py-4 text-[0.72rem] font-medium uppercase tracking-[0.28em] text-ivory shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]"
      >
        Reserve Your Stay
      </Link>
    </div>
  );
}