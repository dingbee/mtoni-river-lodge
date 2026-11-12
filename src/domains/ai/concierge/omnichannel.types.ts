export type ConciergeChannel = "web" | "whatsapp" | "email";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type CommunicationDraftType =
  | "welcome"
  | "pre_arrival"
  | "activity_intro"
  | "transfer_info"
  | "follow_up"
  | "custom"
  | "concierge_response";

export type CommunicationDraftStatus =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "sent"
  | "archived";

export type EscalationReason =
  | "low_confidence"
  | "complaint"
  | "payment_issue"
  | "complex_request"
  | "human_requested"
  | "other";

export type EscalationStatus = "open" | "assigned" | "acknowledged" | "in_progress" | "resolved" | "dismissed";

export interface ChannelRow {
  id: string;
  channel: ConciergeChannel;
  provider: string | null;
  display_name: string;
  status: "active" | "inactive" | "configuring" | "error";
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  requires_approval: boolean;
  configuration: JsonValue;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationDraftRow {
  id: string;
  session_id: string | null;
  guest_id: string | null;
  booking_id: string | null;
  channel: ConciergeChannel;
  draft_type: CommunicationDraftType;
  subject: string | null;
  body: string;
  reasoning: string | null;
  supporting_context: JsonValue;
  status: CommunicationDraftStatus;
  approved_by: string | null;
  approved_by_system: boolean;
  approved_content_hash: string | null;
  content_version: number;
  approved_content_version: number | null;
  approved_at: string | null;
  sent_at: string | null;
  provider_template_name: string | null;
  provider_template_language: string | null;
  provider_template_components: JsonValue;
  source_message_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscalationRow {
  id: string;
  session_id: string;
  guest_id: string | null;
  channel: ConciergeChannel;
  reason: EscalationReason;
  summary: string | null;
  ai_confidence: number | null;
  priority: 1 | 2 | 3;
  status: EscalationStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  assignment_due_at?: string | null;
  acknowledgement_due_at?: string | null;
  resolution_due_at?: string | null;
  reopened_at?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
  updated_at: string;
}