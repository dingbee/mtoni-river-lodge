export type ConciergeRole = "user" | "assistant" | "system";

export interface ConciergeCitation {
  document_id: string;
  document_title: string;
  document_slug: string;
  category_slug: string | null;
  chunk_index: number;
  excerpt: string;
}

export interface ConciergeMessage {
  id?: string;
  role: ConciergeRole;
  content: string;
  citations?: ConciergeCitation[];
  confidence?: number;
  escalated?: boolean;
  created_at?: string;
}

export interface ConciergeReply {
  session_token: string;
  message: ConciergeMessage;
  escalation?: {
    reason: string;
    channels: Array<{ type: "whatsapp" | "email"; label: string; url: string }>;
  };
}

export interface ConciergeChatInput {
  session_token?: string | null;
  message: string;
  page?: string | null;
  locale?: string | null;
}