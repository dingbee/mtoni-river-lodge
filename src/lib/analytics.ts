declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export interface GAEventParams {
  event_category?: string;
  event_label?: string;
  value?: number;
  [key: string]: unknown;
}

export function trackGAEvent(
  eventName: string,
  params: GAEventParams = {}
) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
}

/* ─── Preset event helpers ─── */

export function trackCTAClick(
  ctaName: string,
  location: string,
  extra?: Record<string, unknown>
) {
  trackGAEvent("cta_click", {
    event_category: "engagement",
    event_label: ctaName,
    cta_name: ctaName,
    cta_location: location,
    ...extra,
  });
}

export function trackVoteClick(location: string) {
  trackCTAClick("vote_now", location, { event_category: "conversion" });
}

export function trackCheckAvailabilityClick(location: string) {
  trackCTAClick("check_availability", location);
}

export function trackContactClick(channel: string, location: string) {
  trackCTAClick("get_in_touch", location, { contact_channel: channel });
}

export function trackShareClick(platform: string, location: string) {
  trackCTAClick("share", location, { share_platform: platform });
}
