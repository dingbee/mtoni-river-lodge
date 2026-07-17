import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_TOOLS } from "../ai.tools";
import { canUseTool, toolDomain } from "../ai.permissions";
import { allowedToolsForRoles, SYSTEM_BRAND } from "../ai.context";
import type { AiKnowledgeCitation, AiToolId } from "../ai.types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_TOOLS_PER_TURN = 3;

async function chat(system: string, user: string, jsonMode = true): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Mtoni AI is not configured (missing LOVABLE_API_KEY).");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up in workspace settings.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

function tryJson<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch {}
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch {} }
  const a = s.indexOf("{"); const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) as T; } catch {} }
  return null;
}

async function getRoles(supabase: any): Promise<string[]> {
  const { data } = await supabase.rpc("current_user_roles");
  return (data ?? []) as string[];
}

function buildMultiRouterPrompt(roles: readonly string[]): string {
  const tools = allowedToolsForRoles(roles);
  const catalog = tools.map((t) => `- ${t}: ${AI_TOOLS[t].description}`).join("\n");
  return [
    SYSTEM_BRAND,
    "",
    "You are the multi-domain router for the Staff Copilot. Decide which tools (0 to 3) to call in parallel to answer the question.",
    "Return strict JSON: {\"tools\": [{\"tool\": \"<id>\", \"args\": {}}], \"reason\": \"<why>\"}.",
    "If the question is procedural or reference-based, prefer knowledge.search.",
    "If the question spans multiple domains, pick up to 3 relevant tools.",
    "Available tools:",
    catalog,
  ].join("\n");
}

function buildAnswerPrompt(): string {
  return [
    SYSTEM_BRAND,
    "",
    "You are the Staff Copilot. Compose an explainable answer grounded ONLY in the tool results and knowledge excerpts provided.",
    "Return strict JSON:",
    "{\"answer\": string, \"recommendation\": string | null, \"reasoning\": string, \"confidence\": number}",
    "- answer: helpful, concise (< 200 words). Use markdown. Cite figures verbatim.",
    "- reasoning: 1-3 sentences explaining how the evidence supports the answer.",
    "- confidence: 0.0 to 1.0. Lower it if evidence is thin or missing.",
    "Never fabricate numbers or names. If evidence is insufficient, say so and set confidence < 0.4.",
    "Never suggest that you have modified data. You only search, analyse, recommend, explain, summarise, or draft.",
  ].join("\n");
}

export const listCopilotSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_copilot_sessions")
      .select("id, title, message_count, last_message_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const getCopilotSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { sessionId: string }) => ({ sessionId: String(i.sessionId) }))
  .handler(async ({ data, context }) => {
    const [{ data: session }, { data: messages }] = await Promise.all([
      context.supabase.from("ai_copilot_sessions").select("*").eq("id", data.sessionId).maybeSingle(),
      context.supabase.from("ai_copilot_messages").select("*").eq("session_id", data.sessionId).order("created_at"),
    ]);
    return { session, messages: messages ?? [] };
  });

export const deleteCopilotSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { sessionId: string }) => ({ sessionId: String(i.sessionId) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_copilot_sessions").delete().eq("id", data.sessionId);
    if (error) throw error;
    return { ok: true };
  });

export const listPromptLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_prompt_library")
      .select("id, category, title, prompt, description, sort_order")
      .eq("is_active", true)
      .order("category")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  });

export const sendCopilotMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { sessionId?: string | null; question: string }) => {
    const q = String(i?.question ?? "").trim();
    if (!q) throw new Error("Question is required.");
    if (q.length > 2000) throw new Error("Question too long.");
    return { sessionId: i.sessionId ?? null, question: q };
  })
  .handler(async ({ data, context }) => {
    const start = Date.now();
    const roles = await getRoles(context.supabase);
    if (roles.length === 0) throw new Error("You do not have a staff role assigned.");

    // Session
    let sessionId = data.sessionId;
    if (!sessionId) {
      const { data: session, error } = await context.supabase
        .from("ai_copilot_sessions")
        .insert({ user_id: context.userId, title: data.question.slice(0, 80), role_snapshot: roles })
        .select("id").single();
      if (error) throw error;
      sessionId = session.id;
    }

    // Persist user message
    await context.supabase.from("ai_copilot_messages").insert({
      session_id: sessionId, user_id: context.userId, role: "user", content: data.question,
    });

    // Router (multi-tool)
    const routerRaw = await chat(buildMultiRouterPrompt(roles), data.question);
    const parsed = tryJson<{ tools: Array<{ tool: string; args?: any }>; reason?: string }>(routerRaw) ?? { tools: [] };
    const allowed = new Set(allowedToolsForRoles(roles) as string[]);
    const chosen = (parsed.tools ?? [])
      .filter((t) => t?.tool && allowed.has(t.tool))
      .slice(0, MAX_TOOLS_PER_TURN);

    const toolIds: AiToolId[] = [];
    const domainsUsed = new Set<string>();
    const evidence: any[] = [];
    const toolPayloads: string[] = [];
    let citations: AiKnowledgeCitation[] = [];

    for (const t of chosen) {
      const tid = t.tool as AiToolId;
      if (!canUseTool(tid, roles)) continue;
      try {
        const res = await AI_TOOLS[tid].run({ supabase: context.supabase }, t.args ?? {});
        toolIds.push(tid);
        domainsUsed.add(toolDomain(tid));
        evidence.push({ domain: toolDomain(tid), tool: tid, count: res.count, window: res.window, summary: res.summary });
        toolPayloads.push(`### Tool: ${tid}\n${res.summary}\nData: ${JSON.stringify(res.data).slice(0, 3000)}`);
        if (tid === "knowledge.search" && Array.isArray(res.data)) {
          citations = (res.data as any[]).map((r) => ({
            document_id: r.document_id, document_title: r.document_title, document_slug: r.document_slug,
            category_slug: r.category_slug ?? null, chunk_index: r.chunk_index, excerpt: String(r.content ?? "").slice(0, 400),
          }));
        }
      } catch (err: any) {
        toolPayloads.push(`### Tool: ${tid}\nError: ${err?.message ?? "unknown"}`);
      }
    }

    // Always try knowledge fusion if not already done
    if (!toolIds.includes("knowledge.search") && allowed.has("knowledge.search")) {
      try {
        const { memoizeTTL } = await import("@/lib/perf-cache");
        const q = String(data.question ?? "").trim().toLowerCase();
        const kb = await memoizeTTL(`kb:copilot:${q}:4`, 60_000, async () => {
          const { data: r } = await context.supabase.rpc("knowledge_search", { _query: data.question, _limit: 4 });
          return r;
        });
        const rows = (kb ?? []) as any[];
        if (rows.length) {
          citations = rows.map((r) => ({
            document_id: r.document_id, document_title: r.document_title, document_slug: r.document_slug,
            category_slug: r.category_slug ?? null, chunk_index: r.chunk_index, excerpt: String(r.content ?? "").slice(0, 400),
          }));
          domainsUsed.add("knowledge");
          evidence.push({ domain: "knowledge", tool: "knowledge.search", count: rows.length });
          toolPayloads.push(`### Knowledge excerpts\n${rows.map((r, i) => `[K${i+1}] ${r.document_title}: ${String(r.content ?? "").slice(0, 500)}`).join("\n")}`);
        }
      } catch {}
    }

    // Conversation history (last 8)
    const { data: history } = await context.supabase
      .from("ai_copilot_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(8);
    const historyText = (history ?? []).reverse()
      .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

    const answerUser = [
      `Conversation so far:\n${historyText}`,
      `Current question: ${data.question}`,
      `Staff roles: ${roles.join(", ")}`,
      `Current date: ${new Date().toISOString().slice(0, 10)}`,
      toolPayloads.length ? `Evidence:\n${toolPayloads.join("\n\n")}` : "No live evidence gathered.",
    ].join("\n\n");

    const answerRaw = await chat(buildAnswerPrompt(), answerUser);
    const answer = tryJson<{ answer: string; recommendation: string | null; reasoning: string; confidence: number }>(answerRaw) ?? {
      answer: answerRaw.trim() || "I could not generate a response.",
      recommendation: null,
      reasoning: "Fallback: model returned non-JSON output.",
      confidence: 0.3,
    };

    const duration = Date.now() - start;

    // Persist assistant message
    const { data: saved, error: mErr } = await context.supabase
      .from("ai_copilot_messages")
      .insert({
        session_id: sessionId, user_id: context.userId, role: "assistant",
        content: answer.answer,
        recommendation: answer.recommendation ?? null,
        tools_used: toolIds,
        domains_used: Array.from(domainsUsed),
        evidence: evidence as never,
        citations: citations as never,
        confidence: answer.confidence ?? null,
        duration_ms: duration,
        model: MODEL,
      })
      .select("*")
      .single();
    if (mErr) throw mErr;

    // Update session metadata
    await context.supabase
      .from("ai_copilot_sessions")
      .update({
        message_count: ((history?.length ?? 0) + 2),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    // Audit
    await context.supabase.from("ai_activity_logs").insert({
      user_id: context.userId,
      question: data.question,
      domains_accessed: Array.from(domainsUsed),
      tool_called: toolIds[0] ?? null,
      tool_args: {} as never,
      response: answer.answer,
      evidence: evidence as never,
      recommendation: answer.recommendation ?? null,
      model: MODEL,
      status: "completed",
      duration_ms: duration,
    });

    return {
      sessionId,
      message: saved,
      reasoning: answer.reasoning,
    };
  });

export const submitCopilotFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { messageId: string; rating: string; note?: string }) => {
    const allowed = ["helpful", "needs_improvement", "incorrect", "missing_info"];
    if (!allowed.includes(i.rating)) throw new Error("Invalid rating");
    return { messageId: String(i.messageId), rating: i.rating, note: i.note ?? null };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_copilot_feedback").insert({
      message_id: data.messageId, user_id: context.userId, rating: data.rating, note: data.note,
    });
    if (error) throw error;
    return { ok: true };
  });

export const draftCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: string; brief: string; tone?: string }) => {
    const kind = String(i.kind ?? "").trim();
    const brief = String(i.brief ?? "").trim();
    if (!kind || !brief) throw new Error("kind and brief are required");
    return { kind, brief, tone: i.tone ?? "warm and professional" };
  })
  .handler(async ({ data }) => {
    const system = [
      SYSTEM_BRAND,
      "",
      "You are drafting content for staff to review before sending. Never claim to send, book, or execute anything.",
      "Return strict JSON: {\"subject\": string | null, \"body\": string, \"channel\": string}.",
      "Keep body concise, brand-consistent, and edit-ready.",
    ].join("\n");
    const user = `Kind: ${data.kind}\nTone: ${data.tone}\nBrief: ${data.brief}`;
    const raw = await chat(system, user);
    const parsed = tryJson<{ subject: string | null; body: string; channel: string }>(raw) ?? {
      subject: null, body: raw.trim(), channel: data.kind,
    };
    return parsed;
  });

export const getCopilotAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ count: sessionCount }, { count: msgCount }, { data: recent }, { data: feedback }] = await Promise.all([
      context.supabase.from("ai_copilot_sessions").select("id", { count: "exact", head: true }),
      context.supabase.from("ai_copilot_messages").select("id", { count: "exact", head: true }).eq("role", "assistant"),
      context.supabase.from("ai_copilot_messages")
        .select("confidence, duration_ms, domains_used, created_at")
        .eq("role", "assistant")
        .order("created_at", { ascending: false }).limit(50),
      context.supabase.from("ai_copilot_feedback").select("rating"),
    ]);
    const rows = recent ?? [];
    const avgConfidence = rows.length ? rows.reduce((s, r: any) => s + Number(r.confidence ?? 0), 0) / rows.length : 0;
    const avgDuration = rows.length ? rows.reduce((s, r: any) => s + Number(r.duration_ms ?? 0), 0) / rows.length : 0;
    const fbBreakdown: Record<string, number> = {};
    for (const f of feedback ?? []) fbBreakdown[(f as any).rating] = (fbBreakdown[(f as any).rating] ?? 0) + 1;
    return {
      sessions: sessionCount ?? 0,
      assistant_messages: msgCount ?? 0,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      avg_duration_ms: Math.round(avgDuration),
      feedback: fbBreakdown,
    };
  });