/** Canonical event type catalogue. Extend the union when adding new events. */
export type PlatformEventType =
  | "reservation.created"
  | "reservation.updated"
  | "reservation.cancelled"
  | "guest.created"
  | "guest.updated"
  | "payment.received"
  | "review.published"
  | "article.published"
  | "image.uploaded"
  | "user.login"
  | "user.role_changed"
  | "seo.updated";

export type EventSeverity = "info" | "warn" | "error" | "audit";

export interface PlatformEvent<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  /** Client-generated UUID; also serves as idempotency key. */
  id: string;
  type: PlatformEventType;
  /** ISO 8601. */
  at: string;
  /** Actor user id; null for system events. */
  userId?: string | null;
  /** Module id from the registry (e.g. "guests.crm"). */
  module: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  meta?: TMeta;
  severity?: EventSeverity;
  /** Correlation id to link related events across a workflow. */
  correlationId?: string | null;
}

export type EventListener = (event: PlatformEvent) => void;
