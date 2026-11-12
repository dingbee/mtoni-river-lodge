import { GUEST_REQUEST_CATEGORIES } from "@/domains/ai/concierge/request-categorization";

export const GUEST_PORTAL_MAX_PHOTOS = 6;
export const GUEST_PORTAL_MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const GUEST_PORTAL_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type GuestPortalRequestType = "service" | "issue";
export type GuestPortalStatus =
  | "received"
  | "triaged"
  | "assigned"
  | "in_progress"
  | "fulfilled"
  | "cancelled"
  | "escalated";

export function validateGuestPortalPhotoMeta(
  fileName: string,
  mimeType: string,
  size: number,
): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const valid = GUEST_PORTAL_PHOTO_MIME_TYPES.includes(
    mimeType as (typeof GUEST_PORTAL_PHOTO_MIME_TYPES)[number],
  );
  if (!valid) return "Use a JPEG, PNG or WebP photograph.";
  if (!Number.isInteger(size) || size <= 0) return "The selected photograph is empty.";
  if (size > GUEST_PORTAL_MAX_PHOTO_BYTES) return "Each photograph must be 8 MB or smaller.";
  const matching =
    (mimeType === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (mimeType === "image/png" && extension === "png") ||
    (mimeType === "image/webp" && extension === "webp");
  if (!matching) return "The photograph extension does not match its file type.";
  return null;
}

export function guestRequestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    received: "Received",
    triaged: "Confirmed",
    assigned: "Assigned",
    in_progress: "In progress",
    fulfilled: "Completed",
    cancelled: "Cancelled",
    escalated: "Needs attention",
  };
  return labels[status] ?? "Received";
}

export function guestPortalCategories(type: GuestPortalRequestType) {
  const categories =
    type === "issue"
      ? ["maintenance", "complaint", "service_recovery", "other"]
      : [
          "housekeeping",
          "room_service",
          "dining",
          "airport_transfer",
          "maintenance",
          "special_occasion",
          "private_dining",
          "other",
        ];
  return categories.filter((category) =>
    (GUEST_REQUEST_CATEGORIES as readonly string[]).includes(category),
  );
}

/** Build the canonical bearer URL without embedding any guest or booking data. */
export function buildGuestPortalUrl(origin: string, token: string): string {
  if (!token || token.length < 40 || token.length > 200) {
    throw new Error("Invalid guest access credential.");
  }
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("Invalid Guest Portal origin.");
  }
  return `${base.origin}/guest/${encodeURIComponent(token)}`;
}

/** Resolve only an explicitly configured environment host or its canonical current origin. */
export function guestPortalOrigin(currentOrigin: string, configuredOrigin?: string): string {
  const explicitlyConfigured = Boolean(configuredOrigin?.trim());
  const base = new URL(configuredOrigin?.trim() || currentOrigin);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("Invalid Guest Portal origin.");
  }
  if (
    base.hostname === "localhost" ||
    base.hostname === "127.0.0.1" ||
    base.hostname.endsWith(".vercel.app")
  ) {
    throw new Error("Set VITE_GUEST_PORTAL_BASE_URL to an approved StayNas environment domain before issuing guest access.");
  }
  if (!explicitlyConfigured && !["staynas.nolmark.co", "uat.staynas.com"].includes(base.hostname)) {
    throw new Error("Guest access must use the canonical StayNas production domain or an explicitly configured UAT domain.");
  }
  return base.origin;
}
