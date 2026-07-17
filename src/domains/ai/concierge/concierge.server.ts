import type { ConciergeCitation, ConciergeChatInput, ConciergeMessage, ConciergeReply } from "./concierge.types";
import { ROOMS } from "@/lib/rooms";
import { getBasePriceUsd } from "@/lib/pricing";
import { WHATSAPP_URL } from "@/lib/contact";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGE_LEN = 1000;
const HISTORY_LIMIT = 10;
const LOW_CONFIDENCE = 0.5;

function newToken() {
  return `cnc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeString(v: unknown, max = 500) {
  return typeof v === "string" ? v.slice(0, max) : null;
}

function buildRoomsContext() {
  return ROOMS.map((r) => {
    const price = getBasePriceUsd(r.slug);
    return `- ${r.name} (slug: ${r.slug}) — from US$${price}/night. ${r.shortDesc} Size: ${r.size}. View: ${r.view}.`;
  }).join("\n");
}

const LODGE_FACTS = `
Mtoni River Lodge is an intimate riverfront eco-lodge on the banks of the Nduruma River in Arusha, Tanzania.
- 24 riverside rooms, restaurant, swimming pool, guided experiences.
- Address: Gomba Estate, Arusha, Tanzania.
- Contact: bookings@mtoniriverlodge.com · +255 752 441 443 · WhatsApp available.
- Booking: guests reserve online at /book on mtoniriverlodge.com.
- Amenities: free WiFi, airport transfers on request, riverfront setting, curated experiences (river walks, canoe, bonfire dining).
`;

function buildSystemPrompt(pageContext: string | null, roomsCtx: string, knowledge: string) {
  return [
    "You are the Mtoni River Lodge Concierge, a warm, professional hospitality assistant for prospective and current guests visiting the public website.",
    "Tone: calm, gracious, concise. Prefer short paragraphs. No emojis unless the guest uses them first.",
    "Rules:",
    "- Only answer using the lodge facts, room information, and knowledge excerpts provided below. If the answer is not covered, say so honestly and offer to connect the guest with the reservations team via WhatsApp or email.",
    "- Never invent prices, availability, policies, or dates. If a guest asks whether specific dates are available, tell them you cannot see live availability and direct them to the online booking page at /book or the reservations team.",
    "- Never share internal operational details, staff information, financial data, or anything not in the provided context.",
    "- For booking, always link the guest to /book on the website.",
    "- Return STRICT JSON: {\"answer\": string, \"confidence\": number between 0 and 1, \"escalate\": boolean, \"citations\": [{document_id, document_title, chunk_index}]}. Set escalate=true when the guest asks about live availability, complex custom itineraries, complaints, medical/safety issues, or anything outside the provided knowledge.",
    "",
    "== Lodge facts ==",
    LODGE_FACTS.trim(),
    "",
    "== Rooms ==",
    roomsCtx,
    "",
    pageContext ? `== Guest is currently viewing ==\n${pageContext}` : "",
    "",
    knowledge ? `== Knowledge excerpts ==\n${knowledge}` : "== Knowledge excerpts ==\n(none)",
  ].filter(Boolean).join("\n");
}

async function callModel(system: string, history: ConciergeMessage[], userText: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Concierge is not configured (missing LOVABLE_API_KEY).");
  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userText },
  ];
  const start = Date.now();
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, response_format: { type: "json_object" } }),
  });
  const latency = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Our concierge is a little busy right now. Please try again in a moment.");
    if (res.status === 402) throw new Error("Concierge temporarily unavailable. Please reach us on WhatsApp.");
    throw new Error(`Concierge request failed (${res.status}): ${text.slice(0, 160)}`);
  }
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? "";
  return { raw, latency };
}

function tryJson<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { /* noop */ }
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch { /* noop */ } }
  const a = s.indexOf("{"); const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) as T; } catch { /* noop */ } }
  return null;
}

export async function handleConciergeChat(
  input: ConciergeChatInput,
  meta: { userAgent?: string | null; referer?: string | null },
): Promise<ConciergeReply> {
  const message = safeString(input.message, MAX_MESSAGE_LEN)?.trim() ?? "";
  if (!message) throw new Error("Message is required.");
  const locale = safeString(input.locale, 16);
  const page = safeString(input.page, 200);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Session
  let sessionId: string | null = null;
  let sessionToken = safeString(input.session_token, 80);
  if (sessionToken) {
    const { data } = await supabaseAdmin
      .from("ai_concierge_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .maybeSingle();
    sessionId = data?.id ?? null;
  }
  if (!sessionId) {
    sessionToken = newToken();
    const { data, error } = await supabaseAdmin
      .from("ai_concierge_sessions")
      .insert({
        session_token: sessionToken,
        locale,
        user_agent: safeString(meta.userAgent, 400),
        referer: safeString(meta.referer, 400),
        page_context: page ? { page } : {},
      })
      .select("id")
      .single();
    if (error) throw new Error(`Concierge session error: ${error.message}`);
    sessionId = data.id;
  }

  // 2. History
  const { data: historyRows } = await supabaseAdmin
    .from("ai_concierge_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);
  const history = (historyRows ?? []).map((r): ConciergeMessage => ({
    role: r.role as ConciergeMessage["role"],
    content: r.content,
  }));

  // 3. Persist user message
  await supabaseAdmin.from("ai_concierge_messages").insert({
    session_id: sessionId,
    role: "user",
    content: message,
  });

  // 4. Knowledge retrieval — guest-visible published docs only
  let knowledgeCtx = "";
  let citations: ConciergeCitation[] = [];
  try {
    const { data: hits } = await supabaseAdmin.rpc("knowledge_search", {
      _query: message,
      _limit: 4,
    });
    const rows = (hits ?? []) as Array<any>;
    if (rows.length > 0) {
      const docIds = Array.from(new Set(rows.map((r) => r.document_id)));
      const { data: docs } = await supabaseAdmin
        .from("knowledge_documents")
        .select("id, is_guest_visible, status")
        .in("id", docIds);
      const guestOk = new Set(
        (docs ?? [])
          .filter((d) => d.is_guest_visible && d.status === "published")
          .map((d) => d.id),
      );
      const filtered = rows.filter((r) => guestOk.has(r.document_id));
      if (filtered.length > 0) {
        knowledgeCtx = filtered
          .map(
            (r, i) =>
              `[${i + 1}] ${r.document_title} (id: ${r.document_id}, chunk ${r.chunk_index})\n${r.content}`,
          )
          .join("\n---\n");
        citations = filtered.map((r) => ({
          document_id: r.document_id,
          document_title: r.document_title,
          document_slug: r.document_slug,
          category_slug: r.category_slug ?? null,
          chunk_index: r.chunk_index,
          excerpt: (r.content ?? "").slice(0, 240),
        }));
      }
    }
  } catch {
    // Knowledge lookup is best-effort.
  }

  // 5. Call model
  const system = buildSystemPrompt(page, buildRoomsContext(), knowledgeCtx);
  const { raw, latency } = await callModel(system, history, message);
  const parsed = tryJson<{ answer?: string; confidence?: number; escalate?: boolean; citations?: any[] }>(raw) ?? {};
  const answer = (parsed.answer ?? "I'm sorry, I couldn't put together an answer just now. Please reach us on WhatsApp and we'll help right away.").trim();
  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6;
  const shouldEscalate = Boolean(parsed.escalate) || confidence < LOW_CONFIDENCE;

  // 6. Persist assistant message
  const { data: assistantRow } = await supabaseAdmin
    .from("ai_concierge_messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: answer,
      citations: citations as any,
      confidence,
      escalated: shouldEscalate,
      model: MODEL,
      latency_ms: latency,
    })
    .select("id, created_at")
    .single();

  // 7. Update session counters
  await supabaseAdmin
    .from("ai_concierge_sessions")
    .update({
      message_count: history.length + 2,
      last_active_at: new Date().toISOString(),
      escalated: shouldEscalate,
      escalation_channel: shouldEscalate ? "whatsapp" : null,
    })
    .eq("id", sessionId);

  const reply: ConciergeReply = {
    session_token: sessionToken!,
    message: {
      id: assistantRow?.id,
      role: "assistant",
      content: answer,
      citations,
      confidence,
      escalated: shouldEscalate,
      created_at: assistantRow?.created_at,
    },
  };
  if (shouldEscalate) {
    reply.escalation = {
      reason: "For live availability or a personal itinerary, our reservations team can help you directly.",
      channels: [
        { type: "whatsapp", label: "Chat on WhatsApp", url: WHATSAPP_URL },
        {
          type: "email",
          label: "Email reservations",
          url: "mailto:bookings@mtoniriverlodge.com?subject=Concierge%20follow-up",
        },
      ],
    };
  }
  return reply;
}

export async function loadConciergeSession(token: string): Promise<{ token: string; messages: ConciergeMessage[] } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: session } = await supabaseAdmin
    .from("ai_concierge_sessions")
    .select("id, session_token")
    .eq("session_token", token)
    .maybeSingle();
  if (!session) return null;
  const { data: rows } = await supabaseAdmin
    .from("ai_concierge_messages")
    .select("id, role, content, citations, confidence, escalated, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(50);
  return {
    token: session.session_token,
    messages: (rows ?? []).map((r) => ({
      id: r.id,
      role: r.role as ConciergeMessage["role"],
      content: r.content,
      citations: (r.citations as any) ?? [],
      confidence: r.confidence ?? undefined,
      escalated: r.escalated ?? false,
      created_at: r.created_at,
    })),
  };
}