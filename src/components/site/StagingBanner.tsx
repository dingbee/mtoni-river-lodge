import { useEffect, useState } from "react";

const PROD_HOSTS = new Set([
  "mtoniriverlodge.com",
  "www.mtoniriverlodge.com",
]);

/** Returns true when the current hostname is NOT the production domain. */
export function useIsStaging(): boolean {
  const [isStaging, setIsStaging] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    setIsStaging(!PROD_HOSTS.has(host));
  }, []);
  return isStaging;
}

/**
 * Site-wide staging banner. Renders only on non-production hostnames
 * (preview, *.lovable.app). Also injects `noindex, nofollow` so crawlers
 * skip the staging build.
 */
export function StagingBanner() {
  const isStaging = useIsStaging();

  useEffect(() => {
    if (!isStaging || typeof document === "undefined") return;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"][data-staging="1"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "robots";
      tag.setAttribute("data-staging", "1");
      document.head.appendChild(tag);
    }
    tag.content = "noindex, nofollow";
    document.title = `[STAGING] ${document.title.replace(/^\[STAGING\]\s*/, "")}`;
  }, [isStaging]);

  if (!isStaging) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] w-full bg-amber-500 text-charcoal"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-[0.7rem] font-medium uppercase tracking-[0.18em] sm:text-xs">
        <span aria-hidden>⚠</span>
        <span>
          Staging / Demo environment — for review only. Do not submit real bookings or payments.
        </span>
      </div>
    </div>
  );
}

/** Inline warning for the payment step. */
export function StagingPaymentWarning() {
  const isStaging = useIsStaging();
  if (!isStaging) return null;
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs leading-relaxed text-rose-800">
      <strong className="font-semibold uppercase tracking-wider">Test environment.</strong>{" "}
      This is a staging deployment for management review. Do not enter real card details or
      complete a real payment. Any transaction here may be processed by the live Pesapal
      account currently configured.
    </div>
  );
}