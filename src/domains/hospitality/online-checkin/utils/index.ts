import type { CheckInLinkStatus } from "../types";

/** Human label for a check-in link status. Presentation helper only. */
export function checkInStatusLabel(status: CheckInLinkStatus): string {
  switch (status) {
    case "pending":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "submitted":
      return "Submitted";
    case "expired":
      return "Expired";
  }
}

/** True when the link expiry timestamp is in the past. */
export function isCheckInLinkExpired(expiresAt: string, now: Date = new Date()): boolean {
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) ? ts < now.getTime() : true;
}