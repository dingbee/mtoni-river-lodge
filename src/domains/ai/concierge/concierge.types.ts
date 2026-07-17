export type ConciergeRole = "user" | "assistant" | "system";

export interface ConciergeCitation {
  document_id: string;
  document_title: string;
  document_slug: string;
  category_slug: string | null;
  chunk_index: number;
  excerpt: string;
}

export type ConciergeIntentLevel = "high" | "medium" | "low";

export interface ConciergeIntentSignal {
  level: ConciergeIntentLevel;
  confidence: number;
  keywords: string[];
  detected: {
    check_in?: string | null;
    check_out?: string | null;
    adults?: number | null;
    children?: number | null;
    nights?: number | null;
    country?: string | null;
    interests?: string[];
    budget_hint?: string | null;
  };
}

export interface ConciergeRoomRecommendation {
  type: "room";
  slug: string;
  name: string;
  reasoning: string[];
  confidence: number;
  from_price_usd: number;
}

export interface ConciergeExperienceRecommendation {
  type: "experience";
  slug: string;
  name: string;
  reasoning: string[];
  confidence: number;
}

export type ConciergeRecommendation =
  | ConciergeRoomRecommendation
  | ConciergeExperienceRecommendation;

export interface ConciergeAvailabilityRoom {
  slug: string;
  name: string;
  base_price_usd: number;
  max_occupancy: number;
  is_available: boolean;
  min_available: number;
  nightly_total_usd: number;
  nights: number;
}

export interface ConciergeBookingPlan {
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  room?: { slug: string; name: string; nightly_total_usd: number };
  experiences: Array<{ slug: string; name: string }>;
  estimated_total_usd?: number;
  booking_url: string;
}

export interface ConciergeMessage {
  id?: string;
  role: ConciergeRole;
  content: string;
  citations?: ConciergeCitation[];
  confidence?: number;
  escalated?: boolean;
  intent?: ConciergeIntentLevel;
  recommendations?: ConciergeRecommendation[];
  availability?: ConciergeAvailabilityRoom[];
  plan?: ConciergeBookingPlan;
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

export interface ConciergeLeadInput {
  session_token?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  travel_period_start?: string | null;
  travel_period_end?: string | null;
  adults?: number | null;
  children?: number | null;
  interests?: string[];
  notes?: string | null;
}