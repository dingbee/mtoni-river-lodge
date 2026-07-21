import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiGateway, parseAiJson } from "@/lib/ai-gateway.server";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function callAI(system: string, user: string, expectJson = false): Promise<string> {
  const { content } = await callAiGateway({ system, user, jsonMode: expectJson });
  return content;
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

const tryParseJson = (s: string) => parseAiJson<Record<string, any>>(s);

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