import { randomBytes } from "node:crypto";
import type {
  ConciergeCitation,
  ConciergeChatInput,
  ConciergeMessage,
  ConciergeReply,
  ConciergeRecommendation,
  ConciergeAvailabilityRoom,
  ConciergeBookingPlan,
} from "./concierge.types";
import { classifyIntent } from "./concierge.intent";
import { combinedRecommendations } from "./concierge.recommendations";
import type { ConciergeRoomCatalogItem } from "./concierge.types";
import { searchAvailability, buildBookingPlan } from "./concierge.tools";
import { loadConciergeMemoryContext, suggestMemoriesFromMessage } from "./memory.context";
import { AI_GATEWAY_DEFAULT_MODEL, callAiGateway, parseAiJson } from "@/lib/ai-gateway.server";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

const MODEL = AI_GATEWAY_DEFAULT_MODEL;
const MAX_MESSAGE_LEN = 1000;
const HISTORY_LIMIT = 10;
const LOW_CONFIDENCE = 0.5;

function newToken() {
  // Session tokens are bearer credentials; use cryptographic entropy rather
  // than timestamps or Math.random so public history cannot be guessed.
  return `cnc_${randomBytes(32).toString("base64url")}`;
}

function safeString(v: unknown, max = 500) {
  return typeof v === "string" ? v.slice(0, max) : null;
}

async function loadRoomCatalog(supabaseAdmin: any, propertyId: string): Promise<ConciergeRoomCatalogItem[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from("rooms")
    .select("slug,name,short_description,capacity_adults,capacity_children,max_occupancy,base_price,currency")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConciergeRoomCatalogItem[];
}

async function loadPropertyFacts(supabaseAdmin: any, propertyId: string): Promise<string> {
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_properties")
    .select("name,currency,timezone")
    .eq("id", propertyId)
    .eq("status", "active")
    .single();
  if (error || !data || !data.currency) throw new Error("Active property context or currency could not be resolved.");
  return [
    `Property: ${data.name}`,
    `Configured currency: ${data.currency}`,
    `Property timezone: ${data.timezone}`,
    "Use only this property's approved configuration and knowledge. Never infer or disclose another property's information.",
    "Guests can continue to booking through this property's StayNas booking flow at /book.",
  ].join("\n");
}

function buildRoomsContext(rooms: ConciergeRoomCatalogItem[]) {
  return rooms.map((r) => "- " + r.name + " (slug: " + r.slug + ") — from " + r.currency + " " + Number(r.base_price).toLocaleString() + "/night. " + (r.short_description ?? "")).join("\n");
}

function buildSystemPrompt(
  pageContext: string | null,
  propertyFacts: string,
  roomsCtx: string,
  knowledge: string,
  intentCtx: string,
  recsCtx: string,
  availabilityCtx: string,
) {
  return [
    "You are the StayNas AI Concierge, a warm, professional hospitality assistant that helps prospective guests move from discovery to booking on the public website.",
    "Tone: calm, gracious, concise. Prefer short paragraphs. No emojis unless the guest uses them first.",
    "Rules:",
    "- Only answer using the active property facts, room information, and knowledge excerpts provided below. If the answer is not covered, say so honestly and offer to connect the guest with the property team using contact channels configured for this property.",
    "- Use the provided Availability section as the source of truth for whether specific dates and rooms are available. Never invent prices, availability, policies, or dates outside what is given.",
    "- When the guest shows booking intent, guide them naturally: recommend a suitable room (using the Recommendations section), suggest 1–2 experiences if relevant, and invite them to continue on /book. Do NOT try to collect payment or complete the booking yourself.",
    "- Never share internal operational details, staff information, financial data, or anything not in the provided context.",
    "- For booking, always link the guest to /book on the website (or the booking_url provided in the Plan section, which pre-fills their dates).",
    "- Return STRICT JSON: {\"answer\": string, \"confidence\": number between 0 and 1, \"escalate\": boolean, \"citations\": [{document_id, document_title, chunk_index}]}. Set escalate=true when the guest asks about live availability, complex custom itineraries, complaints, medical/safety issues, or anything outside the provided knowledge.",
    "",
    "== Active property facts ==",
    propertyFacts,
    "",
    "== Rooms ==",
    roomsCtx,
    "",
    pageContext ? `== Guest is currently viewing ==\n${pageContext}` : "",
    "",
    intentCtx ? `== Detected intent ==\n${intentCtx}` : "",
    recsCtx ? `== Recommendations ==\n${recsCtx}` : "",
    availabilityCtx ? `== Availability ==\n${availabilityCtx}` : "",
    "",
    knowledge ? `== Knowledge excerpts ==\n${knowledge}` : "== Knowledge excerpts ==\n(none)",
  ].filter(Boolean).join("\n");
}

async function callModel(system: string, history: ConciergeMessage[], userText: string) {
  const result = await callAiGateway({
    system,
    user: userText,
    history: history.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
    jsonMode: true,
  });
  return { raw: result.content, latency: result.latencyMs };
}

const tryJson = parseAiJson;

export async function handleConciergeChat(
  input: ConciergeChatInput,
  meta: { userAgent?: string | null; referer?: string | null },
): Promise<ConciergeReply> {
  const message = safeString(input.message, MAX_MESSAGE_LEN)?.trim() ?? "";
  if (!message) throw new Error("Message is required.");
  const locale = safeString(input.locale, 16);
  const page = safeString(input.page, 200);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
  const [roomCatalog, propertyFacts] = await Promise.all([
    loadRoomCatalog(supabaseAdmin, propertyId),
    loadPropertyFacts(supabaseAdmin, propertyId),
  ]);

  let sessionId: string | null = null;
  let sessionToken = safeString(input.session_token, 80);
  let existingGuestId: string | null = null;
  if (sessionToken) {
    const { data } = await (supabaseAdmin as any).from("ai_concierge_sessions").select("id, guest_id").eq("session_token", sessionToken).eq("property_id", propertyId).maybeSingle();
    sessionId = data?.id ?? null;
    existingGuestId = (data as any)?.guest_id ?? null;
  }
  if (!sessionId) {
    sessionToken = newToken();
    const { data, error } = await (supabaseAdmin as any).from("ai_concierge_sessions").insert({
      session_token: sessionToken, property_id: propertyId, locale, user_agent: safeString(meta.userAgent, 400),
      referer: safeString(meta.referer, 400), page_context: page ? { page } : {},
    }).select("id").single();
    if (error) throw new Error(`Concierge session error: ${error.message}`);
    sessionId = data.id;
  }

  const { data: historyRows } = await supabaseAdmin.from("ai_concierge_messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(HISTORY_LIMIT);
  const history = (historyRows ?? []).map((r): ConciergeMessage => ({ role: r.role as ConciergeMessage["role"], content: r.content }));

  await supabaseAdmin.from("ai_concierge_messages").insert({ session_id: sessionId, role: "user", content: message });

  // Tenant-aware knowledge retrieval is disabled until the search RPC can
  // enforce property scope before returning any document chunks.
  let knowledgeCtx = "";
  const citations: ConciergeCitation[] = [];

  const historyText = history.map((h) => h.content);
  const intent = classifyIntent(message, historyText);
  const recommendations: ConciergeRecommendation[] = intent.level !== "low" ? combinedRecommendations(intent, roomCatalog) : [];

  let availability: ConciergeAvailabilityRoom[] = [];
  let plan: ConciergeBookingPlan | null = null;
  if (intent.detected.check_in && intent.detected.check_out) {
    try {
      availability = await searchAvailability({ check_in: intent.detected.check_in, check_out: intent.detected.check_out });
      plan = buildBookingPlan(intent, availability, recommendations.find((r) => r.type === "room")?.slug);
    } catch {}
  }

  const intentCtx = `level=${intent.level} confidence=${intent.confidence.toFixed(2)}; dates=${intent.detected.check_in ?? "?"} → ${intent.detected.check_out ?? "?"}; party=${intent.detected.adults ?? "?"} adults / ${intent.detected.children ?? 0} children; interests=${(intent.detected.interests ?? []).join(",") || "none"}`;
  const recsCtx = recommendations.map((r) => `- [${r.type}] ${r.name} (slug: ${r.slug}, conf ${r.confidence.toFixed(2)}): ${r.reasoning.join(" ")}`).join("\n");
  const availabilityCtx = availability.map((a) => `- ${a.name} (slug: ${a.slug}) — ${a.is_available ? `available (${a.min_available} left)` : "not available"} for ${a.nights} night(s), total ${a.currency} ${a.nightly_total}`).join("\n") + (plan?.booking_url ? `\nbooking_url: ${plan.booking_url}` : "");

  const memoryCtx = await loadConciergeMemoryContext({ sessionId: sessionId!, guestId: existingGuestId, propertyId });
  const memoryPromptSection = memoryCtx.contextText ? [
    "== Guest memory (approved) ==",
    memoryCtx.isReturningVisitor ? "This is a returning visitor. Greet them warmly and reference memories naturally, without revealing private history." : "Use these approved preferences to personalise your reply.",
    memoryCtx.contextText,
  ].join("\n") : "";
  const system = buildSystemPrompt(page, propertyFacts, buildRoomsContext(roomCatalog), knowledgeCtx, intentCtx, recsCtx, availabilityCtx) + (memoryPromptSection ? "\n\n" + memoryPromptSection : "");
  const { raw, latency } = await callModel(system, history, message);
  const parsed = tryJson<{ answer?: string; confidence?: number; escalate?: boolean; citations?: any[] }>(raw) ?? {};
  const answer = (parsed.answer ?? "I'm sorry, I couldn't put together an answer just now. Please contact the property team using the contact details on this property website.").trim();
  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6;
  const shouldEscalate = Boolean(parsed.escalate) || confidence < LOW_CONFIDENCE;

  const { data: assistantRow } = await supabaseAdmin.from("ai_concierge_messages").insert({
    session_id: sessionId, role: "assistant", content: answer, citations: citations as any,
    confidence, escalated: shouldEscalate, model: MODEL, latency_ms: latency,
  }).select("id, created_at").single();

  const assistantMessageId = assistantRow?.id ?? null;
  try {
    await supabaseAdmin.from("ai_concierge_intents").insert({
      session_id: sessionId, message_id: assistantMessageId, intent_level: intent.level,
      confidence: intent.confidence, keywords: intent.keywords, detected_context: intent.detected as any,
    });
    if (recommendations.length > 0) {
      await supabaseAdmin.from("ai_concierge_recommendations").insert(recommendations.map((r) => ({
        session_id: sessionId, message_id: assistantMessageId, recommendation_type: r.type,
        item_slug: r.slug, item_name: r.name, reasoning: r.reasoning.join(" "),
        confidence: r.confidence, evidence: (r.type === "room" ? { from_price: r.from_price, currency: r.currency } : {}) as any,
      })));
    }
  } catch {}

  await supabaseAdmin.from("ai_concierge_sessions").update({
    message_count: history.length + 2, last_active_at: new Date().toISOString(),
    escalated: shouldEscalate, escalation_channel: shouldEscalate ? "whatsapp" : null,
    guest_id: memoryCtx.guestId ?? existingGuestId ?? null,
  }).eq("id", sessionId).eq("property_id", propertyId);

  try {
    await suggestMemoriesFromMessage({
      sessionId: sessionId!, guestId: memoryCtx.guestId, propertyId, message,
      interests: intent.detected.interests ?? [],
      party: { adults: intent.detected.adults, children: intent.detected.children },
    });
    if (memoryCtx.memoryIds.length > 0) {
      await (supabaseAdmin as any).from("ai_personalization_events").insert({
        property_id: propertyId, session_id: sessionId, guest_id: memoryCtx.guestId, event_type: "memory_applied",
        memory_ids: memoryCtx.memoryIds, detail: { message_id: assistantMessageId },
      });
    }
  } catch {}

  const reply: ConciergeReply = {
    session_token: sessionToken!,
    message: {
      id: assistantRow?.id, role: "assistant", content: answer, citations, confidence,
      escalated: shouldEscalate, intent: intent.level,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      availability: availability.length > 0 ? availability : undefined, plan: plan ?? undefined,
      created_at: assistantRow?.created_at,
    },
  };
  if (shouldEscalate) {
    reply.escalation = {
      reason: "For live availability or a personal itinerary, our reservations team can help you directly.",
      channels: [],
    };
  }
  return reply;
}

export async function loadConciergeSession(token: string): Promise<{ token: string; messages: ConciergeMessage[] } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
  const { data: session } = await (supabaseAdmin as any).from("ai_concierge_sessions").select("id, session_token").eq("session_token", token).eq("property_id", propertyId).maybeSingle();
  if (!session) return null;
  const { data: rows } = await supabaseAdmin.from("ai_concierge_messages").select("id, role, content, citations, confidence, escalated, created_at").eq("session_id", session.id).order("created_at", { ascending: true }).limit(50);
  return {
    token: session.session_token,
    messages: (rows ?? []).map((r) => ({
      id: r.id, role: r.role as ConciergeMessage["role"], content: r.content,
      citations: (r.citations as any) ?? [], confidence: r.confidence ?? undefined,
      escalated: r.escalated ?? false, created_at: r.created_at,
    })),
  };
}
