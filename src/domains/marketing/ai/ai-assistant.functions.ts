import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Queue an AI suggestion for human approval. */
export const createAiSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    kind:
      | "seo_title" | "seo_meta" | "seo_keywords" | "internal_links"
      | "faq" | "alt_text" | "testimonial_summary" | "related_articles" | "other";
    targetType: string;
    targetId: string;
    input?: unknown;
    suggestion: unknown;
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_suggestions")
      .insert({
        kind: data.kind,
        target_type: data.targetType,
        target_id: data.targetId,
        input: (data.input ?? {}) as never,
        suggestion: data.suggestion as never,
        requested_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const listPendingAiSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const reviewAiSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; decision: "approved" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_suggestions")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });