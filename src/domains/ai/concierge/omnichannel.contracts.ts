import { z } from "zod";

export const omnichannelChannelSchema = z.enum(["web", "whatsapp", "email"]);
export const messageDirectionSchema = z.enum(["inbound", "outbound", "internal"]);
export const messageActorSchema = z.enum(["guest", "staff", "assistant", "system", "provider"]);
export const messageStatusSchema = z.enum([
  "recorded", "queued", "accepted", "delivered", "read", "failed", "undeliverable",
]);

export const omnichannelMessageInputSchema = z.object({
  propertyId: z.string().uuid(),
  sessionId: z.string().uuid(),
  guestId: z.string().uuid().nullable().optional(),
  channel: omnichannelChannelSchema,
  direction: messageDirectionSchema,
  actorType: messageActorSchema,
  actorUserId: z.string().uuid().nullable().optional(),
  messageType: z.enum(["text", "template", "media", "event"]).default("text"),
  subject: z.string().max(998).nullable().optional(),
  body: z.string().max(10000).nullable().optional(),
  clientMessageId: z.string().min(8).max(200).nullable().optional(),
  replyToMessageId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((message, ctx) => {
  if (message.body == null && !["media", "event"].includes(message.messageType)) {
    ctx.addIssue({ code: "custom", path: ["body"], message: "Text and template messages require a body." });
  }
  if (message.direction === "outbound" && !["staff", "assistant", "system"].includes(message.actorType)) {
    ctx.addIssue({ code: "custom", path: ["actorType"], message: "Outbound messages require a staff, assistant, or system actor." });
  }
  if (message.direction === "inbound" && !["guest", "provider"].includes(message.actorType)) {
    ctx.addIssue({ code: "custom", path: ["actorType"], message: "Inbound messages require a guest or provider actor." });
  }
});

export const guestIdentityLinkInputSchema = z.object({
  propertyId: z.string().uuid(),
  guestId: z.string().uuid(),
  channel: omnichannelChannelSchema,
  identifierType: z.enum(["email", "phone", "provider_contact_id", "booking_reference", "session_token"]),
  identifierHash: z.string().regex(/^[a-f0-9]{64}$/i, "Use a keyed SHA-256 HMAC digest; never store raw identifiers in the lookup column."),
  identifierCiphertext: z.string().min(16).max(4096).nullable().optional(),
  verificationMethod: z.enum(["otp", "magic_link", "booking_verification", "provider_verified", "staff_verified"]),
  verifiedAt: z.string().datetime(),
});

export const channelConsentInputSchema = z.object({
  propertyId: z.string().uuid(),
  guestId: z.string().uuid(),
  channel: omnichannelChannelSchema,
  purpose: z.enum(["transactional", "service", "marketing"]),
  consentStatus: z.enum(["granted", "denied", "withdrawn", "unknown"]),
  consentSource: z.enum(["guest_action", "inbound_message", "booking_flow", "staff_recorded", "imported"]),
  consentTextVersion: z.string().max(100).nullable().optional(),
  evidenceMessageId: z.string().uuid().nullable().optional(),
  capturedAt: z.string().datetime(),
  withdrawnAt: z.string().datetime().nullable().optional(),
}).superRefine((consent, ctx) => {
  if (consent.consentStatus === "withdrawn" && !consent.withdrawnAt) {
    ctx.addIssue({ code: "custom", path: ["withdrawnAt"], message: "A withdrawal timestamp is required." });
  }
  if (consent.consentStatus === "granted" && consent.purpose === "marketing" &&
      !["guest_action", "booking_flow"].includes(consent.consentSource)) {
    ctx.addIssue({ code: "custom", path: ["consentSource"], message: "Marketing consent requires an affirmative guest action." });
  }
});

export const dispatchAttemptInputSchema = z.object({
  propertyId: z.string().uuid(),
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  draftId: z.string().uuid().nullable().optional(),
  channel: omnichannelChannelSchema,
  provider: z.string().min(2).max(80),
  idempotencyKey: z.string().min(16).max(200),
  attemptNumber: z.number().int().positive(),
  approvalStatus: z.enum(["not_required", "pending", "approved", "rejected"]),
  approvedBy: z.string().uuid().nullable().optional(),
  approvedAt: z.string().datetime().nullable().optional(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
}).superRefine((attempt, ctx) => {
  if (attempt.approvalStatus === "approved" && (!attempt.approvedBy || !attempt.approvedAt)) {
    ctx.addIssue({ code: "custom", path: ["approvalStatus"], message: "Approved dispatch requires an approver and timestamp." });
  }
  if (attempt.approvalStatus === "rejected") {
    ctx.addIssue({ code: "custom", path: ["approvalStatus"], message: "Rejected drafts cannot be dispatched." });
  }
});

export const deliveryEventInputSchema = z.object({
  propertyId: z.string().uuid(),
  messageId: z.string().uuid(),
  dispatchAttemptId: z.string().uuid().nullable().optional(),
  channel: omnichannelChannelSchema,
  provider: z.string().min(2).max(80),
  providerEventId: z.string().min(1).max(255),
  providerMessageId: z.string().max(255).nullable().optional(),
  eventType: z.enum(["queued", "sent", "delivered", "read", "bounced", "rejected", "failed", "complained", "unsubscribed"]),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type OmnichannelMessageInput = z.infer<typeof omnichannelMessageInputSchema>;
export type GuestIdentityLinkInput = z.infer<typeof guestIdentityLinkInputSchema>;
export type ChannelConsentInput = z.infer<typeof channelConsentInputSchema>;
export type DispatchAttemptInput = z.infer<typeof dispatchAttemptInputSchema>;
export type DeliveryEventInput = z.infer<typeof deliveryEventInputSchema>;

/** Only a keyed digest is suitable for identifier lookup; plain SHA-256 is vulnerable to dictionary reversal. */
export function isSafeIdentityDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}
