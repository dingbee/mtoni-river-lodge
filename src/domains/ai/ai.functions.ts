import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFounderAiAdmin, getActivePropertyAiRoles } from "@/domains/ai/ai.authorization.server";
import { AI_TOOLS } from "./ai.tools";
import { canUseTool, toolDomain } from "./ai.permissions";
import { allowedToolsForRoles, buildAnswerSystemPrompt, buildRouterSystemPrompt } from "./ai.context";
import type { AiKnowledgeCitation, AiResponse, AiToolId } from "./ai.types";
import { AI_GATEWAY_DEFAULT_MODEL, callAiGateway, parseAiJson } from "@/lib/ai-gateway.server";

const MODEL = AI_GATEWAY_DEFAULT_MODEL;

async function chat(system: string, user: string): Promise<string> {
  const { content } = await callAiGateway({ system, user, jsonMode: true });
  return content;
}

const tryJson = parseAiJson;

export const askAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string }) => {
    const q = String(input?.question ?? "").trim();
    if (!q) throw new Error("Question is required.");
    if (q.length > 2000) throw new Error("Question is too long.");
    return { question: q };
  })
  .handler(async ({ data, context }): Promise<AiResponse> => {
    const start = Date.now();
    const activeScope = await getActivePropertyAiRoles(context.supabase, context.userId);
    const roles = activeScope.roles;
    if (roles.length === 0) throw new Error("You do not have a staff role assigned.");

    // Step 1 — decide tool
    const routerRaw = await chat(buildRouterSystemPrompt(roles), data.question);
    const router = tryJson<{ tool: string | null; args?: Record<string, unknown>; reason?: string }>(routerRaw) ?? { tool: null };
    let toolId: AiToolId | null = null;
    const allowed = allowedToolsForRoles(roles);
    if (router.tool && (allowed as string[]).includes(router.tool)) {
      toolId = router.tool as AiToolId;
    }

    let toolResult: { summary: string; data: unknown; count?: number; window?: string } | null = null;
    if (toolId) {
      if (!canUseTool(toolId, roles)) {
        toolId = null;
      } else {
        try {
          toolResult = await AI_TOOLS[toolId].run({ supabase: context.supabase, propertyId: activeScope.propertyId }, router.args ?? {});
        } catch (err: any) {
          toolResult = { summary: `Tool error: ${err?.message ?? "unknown"}`, data: null };
        }
      }
    }

    // Knowledge search is deliberately disabled until its RPC security,
    // grants and tenant isolation can be verified in an isolated database.
    // Do not query it through the authenticated or service-role client here.
    const citations: AiKnowledgeCitation[] = [];

    // Step 2 — compose answer
    const answerUser = [
      `Question: ${data.question}`,
      toolId ? `Tool used: ${toolId}` : "Tool used: none",
      toolResult ? `Tool summary: ${toolResult.summary}` : "",
      toolResult ? `Tool data (JSON, truncated): ${JSON.stringify(toolResult.data).slice(0, 4000)}` : "",
      kbSummary ? `Knowledge base excerpts:\n${kbSummary}` : "",
    ].filter(Boolean).join("\n");
    const answerRaw = await chat(buildAnswerSystemPrompt(), answerUser);
    const answer = tryJson<{ answer: string; recommendation: string | null }>(answerRaw) ?? {
      answer: answerRaw.trim() || "I could not generate a response.",
      recommendation: null,
    };

    const evidence: AiResponse["evidence"] = toolId && toolResult
      ? [{ domain: toolDomain(toolId), tool: toolId, count: toolResult.count, window: toolResult.window }]
      : [];
    if (citations.length > 0 && toolId !== "knowledge.search") {
      evidence.push({ domain: "knowledge", tool: "knowledge.search", count: citations.length });
    }

    const response: AiResponse = {
      answer: answer.answer,
      recommendation: answer.recommendation ?? undefined,
      tool: toolId ?? undefined,
      data: toolResult?.data ?? null,
      model: MODEL,
      evidence,
      citations,
    };

    // Audit log
    const duration = Date.now() - start;
    await context.supabase.from("ai_activity_logs").insert({
      user_id: context.userId,
      question: data.question,
      domains_accessed: Array.from(new Set(evidence.map((e) => e.domain))),
      tool_called: toolId,
      tool_args: (router.args ?? {}) as never,
      response: response.answer,
      evidence: response.evidence as never,
      recommendation: response.recommendation ?? null,
      model: MODEL,
      status: "completed",
      duration_ms: duration,
    });

    return response;
  });

export const listAiActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ai_activity_logs")
      .select("id, user_id, question, domains_accessed, tool_called, response, recommendation, model, status, error, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const getMyAiScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { roles } = await getActivePropertyAiRoles(context.supabase, context.userId);
    return { roles, tools: allowedToolsForRoles(roles) };
  });