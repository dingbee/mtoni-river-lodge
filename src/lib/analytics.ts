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

/**
 * Core dispatcher: sends an event to gtag (GA4) and pushes the same payload
 * to window.dataLayer so Google Tag Manager can pick it up later without code
 * changes. Safe to call on the server (no-op).
 */
export function trackGAEvent(
  eventName: string,
  params: GAEventParams = {}
) {
  if (typeof window === "undefined") return;

  const enriched: GAEventParams = {
    page_location: window.location.href,
    page_title: typeof document !== "undefined" ? document.title : undefined,
    page_path: window.location.pathname,
    ...params,
  };

  if (window.gtag) {
    window.gtag("event", eventName, enriched);
  }

  // dataLayer push for future GTM integration.
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...enriched });
}

/* ─── Internal dedupe (prevents accidental double-fire from React re-renders) ─── */

const recentEvents = new Map<string, number>();
function shouldFire(key: string, withinMs = 500): boolean {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  const last = recentEvents.get(key) ?? 0;
  if (now - last < withinMs) return false;
  recentEvents.set(key, now);
  return true;
}

function emit(eventName: string, params: GAEventParams) {
  const key = `${eventName}|${params.button_text ?? ""}|${params.destination_url ?? ""}|${params.cta_location ?? ""}`;
  if (!shouldFire(key)) return;
  trackGAEvent(eventName, params);
}

/* ─── Standardized CTA helpers ─── */

type CTAArgs = {
  buttonText: string;
  location: string;
  destinationUrl?: string;
  extra?: Record<string, unknown>;
};

export function trackBookingClick({ buttonText, location, destinationUrl, extra }: CTAArgs) {
  emit("booking_click", {
    event_category: "conversion",
    event_label: buttonText,
    button_text: buttonText,
    cta_location: location,
    destination_url: destinationUrl,
    ...extra,
  });
}

export function trackWhatsAppClick({ buttonText, location, destinationUrl, extra }: CTAArgs) {
  emit("whatsapp_click", {
    event_category: "conversion",
    event_label: buttonText,
    button_text: buttonText,
    cta_location: location,
    destination_url: destinationUrl,
    contact_channel: "whatsapp",
    ...extra,
  });
}

export function trackCallClick({ buttonText, location, destinationUrl, extra }: CTAArgs) {
  emit("call_click", {
    event_category: "contact",
    event_label: buttonText,
    button_text: buttonText,
    cta_location: location,
    destination_url: destinationUrl,
    contact_channel: "phone",
    ...extra,
  });
}

export function trackEmailClick({ buttonText, location, destinationUrl, extra }: CTAArgs) {
  emit("email_click", {
    event_category: "contact",
    event_label: buttonText,
    button_text: buttonText,
    cta_location: location,
    destination_url: destinationUrl,
    contact_channel: "email",
    ...extra,
  });
}

export function trackSocialClick({
  platform,
  location,
  destinationUrl,
}: { platform: string; location: string; destinationUrl?: string }) {
  emit("social_click", {
    event_category: "engagement",
    event_label: platform,
    button_text: platform,
    cta_location: location,
    destination_url: destinationUrl,
    social_platform: platform,
  });
}

export function trackBookingFormSubmit(params: Record<string, unknown> = {}) {
  emit("booking_form_submit", {
    event_category: "conversion",
    button_text: "Booking Form Submit",
    ...params,
  });
}

export function trackContactFormSubmit(params: Record<string, unknown> = {}) {
  emit("contact_form_submit", {
    event_category: "conversion",
    button_text: "Contact Form Submit",
    ...params,
  });
}

export function trackRoomView(roomName: string, location = "rooms_index") {
  emit("room_view", {
    event_category: "engagement",
    event_label: roomName,
    button_text: `View Room: ${roomName}`,
    cta_location: location,
    room_name: roomName,
  });
}

export function trackGalleryView(galleryName: string, location: string) {
  emit("gallery_view", {
    event_category: "engagement",
    event_label: galleryName,
    button_text: `View Gallery: ${galleryName}`,
    cta_location: location,
  });
}

export function trackAmenityView(amenity: string, location: string) {
  emit("amenity_view", {
    event_category: "engagement",
    event_label: amenity,
    button_text: `View Amenities: ${amenity}`,
    cta_location: location,
  });
}

export function trackActivityView(activity: string, location: string) {
  emit("activity_view", {
    event_category: "engagement",
    event_label: activity,
    button_text: `View Activity: ${activity}`,
    cta_location: location,
  });
}

export function trackBrochureDownload(name: string, url: string, location: string) {
  emit("brochure_download", {
    event_category: "engagement",
    event_label: name,
    button_text: `Download Brochure: ${name}`,
    cta_location: location,
    destination_url: url,
  });
}

/* ─── Page view (deduped) ─── */

export function trackPageView(path: string, title?: string) {
  if (typeof window === "undefined") return;
  const key = `page_view|${path}`;
  if (!shouldFire(key, 250)) return;
  trackGAEvent("page_view", {
    page_path: path,
    page_title: title ?? (typeof document !== "undefined" ? document.title : undefined),
  });
}

/* ─── Backwards-compatible legacy helpers (still used in existing code) ─── */

export function trackCTAClick(
  ctaName: string,
  location: string,
  extra?: Record<string, unknown>
) {
  emit("cta_click", {
    event_category: "engagement",
    event_label: ctaName,
    button_text: ctaName,
    cta_name: ctaName,
    cta_location: location,
    ...extra,
  });
}

export function trackVoteClick(location: string) {
  trackCTAClick("vote_now", location, { event_category: "conversion" });
}

export function trackCheckAvailabilityClick(location: string) {
  trackBookingClick({
    buttonText: "Check Availability",
    location,
  });
}

export function trackContactClick(channel: string, location: string) {
  if (channel === "whatsapp") {
    trackWhatsAppClick({ buttonText: "WhatsApp", location });
    return;
  }
  if (channel === "phone") {
    trackCallClick({ buttonText: "Call", location });
    return;
  }
  if (channel === "email") {
    trackEmailClick({ buttonText: "Email", location });
    return;
  }
  trackCTAClick("get_in_touch", location, { contact_channel: channel });
}

export function trackShareClick(platform: string, location: string) {
  trackSocialClick({ platform, location });
}

/* ─── Availability inquiry events (kept for funnel granularity) ─── */

export function trackAvailabilityStarted(location: string) {
  emit("availability_request_started", {
    event_category: "conversion",
    cta_location: location,
  });
}

export function trackAvailabilityWhatsApp(params: {
  room_type?: string;
  guest_count?: number;
  country?: string;
  stay_length?: number;
  location?: string;
}) {
  emit("availability_request_whatsapp", {
    event_category: "conversion",
    ...params,
  });
  // Also fire the canonical form-submit + whatsapp_click pair.
  trackBookingFormSubmit({
    cta_location: params.location,
    room_type: params.room_type,
    guest_count: params.guest_count,
    stay_length: params.stay_length,
    country: params.country,
    destination_url: "https://api.whatsapp.com/send",
  });
  trackWhatsAppClick({
    buttonText: "Send via WhatsApp",
    location: params.location ?? "availability_form",
    destinationUrl: "https://api.whatsapp.com/send",
    extra: {
      room_type: params.room_type,
      guest_count: params.guest_count,
      stay_length: params.stay_length,
      country: params.country,
    },
  });
}

export function trackAvailabilityCompleted(params: {
  room_type?: string;
  guest_count?: number;
  country?: string;
  stay_length?: number;
  location?: string;
}) {
  emit("availability_request_completed", {
    event_category: "conversion",
    ...params,
  });
}

/* ─── Google Ads / paid landing-page funnel events ─── */

/** Fired when the visitor submits the hero/landing availability form (top of funnel). */
export function trackBookingStarted(params: {
  location: string;
  check_in?: string;
  check_out?: string;
  guests?: number;
  room_slug?: string;
}) {
  emit("booking_started", {
    event_category: "conversion",
    ...params,
  });
}

/** Fired when the availability RPC returns results inside the wizard. */
export function trackAvailabilityChecked(params: {
  check_in?: string;
  check_out?: string;
  guests?: number;
  nights?: number;
  available_rooms?: number;
  total_rooms?: number;
}) {
  emit("availability_checked", {
    event_category: "conversion",
    ...params,
  });
}

/** Fired when the guest picks a room in step 2. */
export function trackRoomSelected(params: {
  room_slug: string;
  room_name?: string;
  nightly_total?: number;
  currency?: string;
}) {
  emit("room_selected", {
    event_category: "conversion",
    event_label: params.room_name ?? params.room_slug,
    ...params,
  });
}

/** Fired each time the guest toggles an add-on extra in step 3. */
export function trackAddOnSelected(params: {
  slug: string;
  name?: string;
  price?: number;
  action: "added" | "removed";
}) {
  emit("add_on_selected", {
    event_category: "conversion",
    event_label: params.name ?? params.slug,
    ...params,
  });
}

/** Fired on the booking.return page once Pesapal confirms a deposit/payment. */
export function trackBookingCompleted(params: {
  reference?: string;
  value?: number;
  currency?: string;
  payment_method?: string;
}) {
  emit("booking_completed", {
    event_category: "conversion",
    transaction_id: params.reference,
    ...params,
  });
}

