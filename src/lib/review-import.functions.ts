import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function callAI(system: string, user: string, expectJson = false): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
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

const importSchema = z.object({
  text: z.string().min(20).max(10000),
  url: z.string().url().optional().or(z.literal("")),
  source_hint: z.enum(["google", "tripadvisor", "direct"]).optional(),
});

export type ImportedReview = {
  guest_name: string;
  guest_location: string | null;
  rating: number;
  title: string | null;
  review_date: string; // YYYY-MM-DD
  source: "google" | "tripadvisor" | "direct";
  original_review: string;
  short_summary: string;
  medium_summary: string;
};

function tryParseJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    // strip code fences
    const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* ignore */ }
    }
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch { /* ignore */ }
    }
    return null;
  }
}

export const importReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }): Promise<ImportedReview> => {
    await assertStaff(context.supabase, context.userId);

    const today = new Date().toISOString().slice(0, 10);
    const system =
      "You extract structured guest-review data from pasted text (Google Maps, Tripadvisor, or direct emails/WhatsApp). " +
      "Return STRICT JSON only, no markdown fences, no commentary. " +
      "Fields:\n" +
      "guest_name (string, required),\n" +
      "guest_location (string or null),\n" +
      "rating (integer 1-5, default 5),\n" +
      "title (string or null; short headline),\n" +
      "review_date (YYYY-MM-DD; if only a month like 'June 2026' pick the 1st; if unknown use " + today + "),\n" +
      "source ('google' | 'tripadvisor' | 'direct'),\n" +
      "original_review (verbatim guest text, cleaned of platform boilerplate),\n" +
      "short_summary (20-30 words, warm editorial voice, no quote marks, third person),\n" +
      "medium_summary (40-70 words, warm editorial voice, no quote marks, third person).";

    const userPrompt =
      (data.url ? `URL: ${data.url}\n` : "") +
      (data.source_hint ? `Source hint: ${data.source_hint}\n` : "") +
      `Raw review:\n"""\n${data.text}\n"""`;

    const raw = await callAI(system, userPrompt, true);
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned an unreadable response. Please try again.");
    }

    const rating = Number(parsed.rating);
    const outSource =
      parsed.source === "google" || parsed.source === "tripadvisor" || parsed.source === "direct"
        ? parsed.source
        : (data.source_hint ?? "direct");

    return {
      guest_name: String(parsed.guest_name ?? "").trim() || "Anonymous",
      guest_location: parsed.guest_location ? String(parsed.guest_location).trim() : null,
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : 5,
      title: parsed.title ? String(parsed.title).trim() : null,
      review_date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.review_date)) ? parsed.review_date : today,
      source: outSource,
      original_review: String(parsed.original_review ?? data.text).trim(),
      short_summary: String(parsed.short_summary ?? "").trim(),
      medium_summary: String(parsed.medium_summary ?? "").trim(),
    };
  });

const summarizeSchema = z.object({
  text: z.string().min(20).max(10000),
});

export const generateReviewSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => summarizeSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const system =
      "You write concise, warm editorial summaries of guest reviews for a luxury lodge. " +
      "Return STRICT JSON: { short_summary: string, medium_summary: string }. " +
      "short_summary: 20-30 words. medium_summary: 40-70 words. Third person, no quotes, no fluff.";
    const raw = await callAI(system, data.text, true);
    const parsed = tryParseJson(raw) ?? {};
    return {
      short_summary: String(parsed.short_summary ?? "").trim(),
      medium_summary: String(parsed.medium_summary ?? "").trim(),
    };
  });