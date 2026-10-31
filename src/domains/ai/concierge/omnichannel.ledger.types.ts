import type {
  ChannelConsentInput,
  DeliveryEventInput,
  DispatchAttemptInput,
  GuestIdentityLinkInput,
  OmnichannelMessageInput,
} from "./omnichannel.contracts";

export type OmnichannelMessageRecord = OmnichannelMessageInput & {
  id: string;
  status: "recorded" | "queued" | "accepted" | "delivered" | "read" | "failed" | "undeliverable";
  provider: string | null;
  providerMessageId: string | null;
  occurredAt: string;
  createdAt: string;
};

export type GuestIdentityLinkRecord = GuestIdentityLinkInput & {
  id: string;
  status: "active" | "revoked" | "superseded";
  verifiedBy: string | null;
  sourceMessageId: string | null;
  createdAt: string;
};

export type GuestChannelPreferenceRecord = ChannelConsentInput & {
  id: string;
  updatedBy: string | null;
  createdAt: string;
};

export type CommunicationDispatchAttemptRecord = DispatchAttemptInput & {
  id: string;
  status: "pending" | "processing" | "accepted" | "retryable_failure" | "permanent_failure" | "cancelled";
  providerMessageId: string | null;
  responseCode: number | null;
  errorCode: string | null;
  errorSummary: string | null;
  nextRetryAt: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type OmnichannelDeliveryEventRecord = DeliveryEventInput & {
  id: string;
  receivedAt: string;
};

export type OutboundApprovalDecision =
  | { status: "not_required" }
  | { status: "pending" }
  | { status: "approved"; approvedBy: string; approvedAt: string }
  | { status: "rejected"; rejectedBy: string; rejectedAt: string };

export type ProviderDeliveryState =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "bounced"
  | "rejected"
  | "failed"
  | "complained"
  | "unsubscribed";
