export const WHATSAPP_URL =
  "https://wa.me/255752441443?text=Hello%20Mtoni%20River%20Lodge%2C%20I%E2%80%99d%20like%20to%20check%20availability%20for%20a%20stay.";

export const WHATSAPP_NOTE =
  "Speak with our team instantly on WhatsApp for availability and personalized arrangements.";

/**
 * Premium hospitality copy used near primary booking CTAs. Positions the
 * online booking engine as the path to reserve, with the team available
 * as a secondary support channel only.
 */
export const RESERVATIONS_NOTE =
  "Check live availability and reserve your stay online — our reservations team is available should you need assistance.";

/** Short note used alongside support / WhatsApp CTAs. */
export const SUPPORT_NOTE =
  "Our reservations team is on hand for itinerary, transfer, or special-arrangement questions.";

const WHATSAPP_PHONE = "255752441443";

/** Build a WhatsApp link prefilled with an inquiry about a specific room. */
export function buildRoomInquiryUrl(roomName: string) {
  const text = `Hello Mtoni River Lodge, I would like more information about the ${roomName}.`;
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}