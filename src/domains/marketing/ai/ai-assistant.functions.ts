import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export type SuggestionKind =
  | "seo_title"
  | "seo_meta"
  | "seo_keywords"
  | "internal_links"
  | "faq"
  | "alt_text"
  | "testimonial_summary"
  | "related_articles"
  | "other";

async function callAI(system: string, user: string, expectJson = true): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(expectJson ? { response_format: { type: "json_object" } } : {}),
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

function parseJson<T = unknown>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { /* fallthrough */ }
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch { /* ignore */ } }
  const start = s.indexOf("{"); const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(s.slice(start, end + 1)) as T; } catch { /* ignore */ } }
  return null;
}

async function queueSuggestion(context: { supabase: any; userId: string | null }, args: {
  kind: SuggestionKind; targetType: string; targetId: string; input?: unknown; suggestion: unknown;
}) {
  const { data, error } = await context.supabase
    .from("ai_suggestions")
    .insert({
      kind: args.kind,
      target_type: args.targetType,
      target_id: args.targetId,
      input: (args.input ?? {}) as never,
      suggestion: args.suggestion as never,
      requested_by: context.userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

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
    return queueSuggestion(context, data);
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

// ---------- Generators ----------
// Each generator produces a suggestion and stores it as PENDING for human approval.

const HOTEL_CONTEXT =
  "Mtoni River Lodge — a boutique riverside lodge in Moshi, Tanzania near Kilimanjaro. " +
  "Voice: calm, sensory, understated luxury. Avoid clichés and superlatives.";

export const generateSeoTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routePath: string; context?: string }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `You write SEO titles for a hotel. ${HOTEL_CONTEXT} Return JSON {"title": string, "alternatives": string[]}. Title 45-60 chars, include brand where natural.`,
      `Route: ${data.routePath}\nContext: ${data.context ?? "(none)"}`,
    );
    const parsed = parseJson<{ title: string; alternatives?: string[] }>(out) ?? { title: out.trim() };
    return queueSuggestion(context, {
      kind: "seo_title", targetType: "route", targetId: data.routePath, input: data, suggestion: parsed,
    });
  });

export const generateSeoMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routePath: string; context?: string }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `You write SEO meta descriptions. ${HOTEL_CONTEXT} Return JSON {"description": string}. 120-158 chars, one clear promise + gentle CTA.`,
      `Route: ${data.routePath}\nContext: ${data.context ?? "(none)"}`,
    );
    const parsed = parseJson<{ description: string }>(out) ?? { description: out.trim() };
    return queueSuggestion(context, {
      kind: "seo_meta", targetType: "route", targetId: data.routePath, input: data, suggestion: parsed,
    });
  });

export const generateSeoKeywords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routePath: string; context?: string }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `Return JSON {"keywords": string[]}. 6-10 relevant keywords for the page. ${HOTEL_CONTEXT}`,
      `Route: ${data.routePath}\nContext: ${data.context ?? "(none)"}`,
    );
    const parsed = parseJson<{ keywords: string[] }>(out) ?? { keywords: [] };
    return queueSuggestion(context, {
      kind: "seo_keywords", targetType: "route", targetId: data.routePath, input: data, suggestion: parsed,
    });
  });

export const generateFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; targetType?: string; targetId?: string; context?: string }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `Return JSON {"items": [{"q": string, "a": string}]}. Produce 5-8 concise FAQs. ${HOTEL_CONTEXT}`,
      `Topic: ${data.topic}\nContext: ${data.context ?? "(none)"}`,
    );
    const parsed = parseJson<{ items: { q: string; a: string }[] }>(out) ?? { items: [] };
    return queueSuggestion(context, {
      kind: "faq",
      targetType: data.targetType ?? "topic",
      targetId: data.targetId ?? data.topic,
      input: data, suggestion: parsed,
    });
  });

export const generateInternalLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pageTitle: string; pageBody: string; candidates: { title: string; href: string }[] }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `Return JSON {"links": [{"anchor": string, "href": string, "reason": string}]}. Suggest up to 6 internal links from the given candidates whose target is contextually relevant to the source page. Anchor text should feel natural inside the source body.`,
      `Source title: ${data.pageTitle}\nSource body (truncated): ${data.pageBody.slice(0, 4000)}\nCandidates: ${JSON.stringify(data.candidates.slice(0, 40))}`,
    );
    const parsed = parseJson<{ links: { anchor: string; href: string; reason: string }[] }>(out) ?? { links: [] };
    return queueSuggestion(context, {
      kind: "internal_links", targetType: "page", targetId: data.pageTitle, input: data, suggestion: parsed,
    });
  });

export const generateAltText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; filename: string; caption?: string; folder?: string }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `Return JSON {"alt": string}. Write a concise, descriptive alt text (max ~120 chars) for a lodge photo based on filename, folder and any caption. ${HOTEL_CONTEXT}`,
      `Filename: ${data.filename}\nFolder: ${data.folder ?? ""}\nCaption: ${data.caption ?? ""}`,
    );
    const parsed = parseJson<{ alt: string }>(out) ?? { alt: out.trim() };
    return queueSuggestion(context, {
      kind: "alt_text", targetType: "media_asset", targetId: data.assetId, input: data, suggestion: parsed,
    });
  });

export const generateReviewSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reviewId: string; text: string; guestName?: string; rating?: number }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `Return JSON {"short_summary": string, "medium_summary": string, "themes": string[]}. Short = up to 12 words. Medium = 1-2 sentences. Themes = 2-5 tags (e.g. "riverside", "service", "food"). Preserve guest voice.`,
      `Guest: ${data.guestName ?? "Guest"} · Rating: ${data.rating ?? "?"}\nReview: ${data.text.slice(0, 4000)}`,
    );
    const parsed =
      parseJson<{ short_summary: string; medium_summary: string; themes: string[] }>(out) ??
      { short_summary: "", medium_summary: out.trim(), themes: [] };
    return queueSuggestion(context, {
      kind: "testimonial_summary", targetType: "review", targetId: data.reviewId, input: data, suggestion: parsed,
    });
  });

export const generateRelatedArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    articleId: string; title: string; excerpt?: string;
    candidates: { id: string; title: string; excerpt?: string }[];
  }) => d)
  .handler(async ({ data, context }) => {
    const out = await callAI(
      `Return JSON {"related": [{"id": string, "reason": string}]}. Pick 3-5 candidate articles most contextually related to the source. Only choose from the candidate list.`,
      `Source: ${data.title}\nExcerpt: ${data.excerpt ?? ""}\nCandidates: ${JSON.stringify(data.candidates.slice(0, 60))}`,
    );
    const parsed = parseJson<{ related: { id: string; reason: string }[] }>(out) ?? { related: [] };
    return queueSuggestion(context, {
      kind: "related_articles", targetType: "journal_article", targetId: data.articleId, input: data, suggestion: parsed,
    });
  });