import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { stayNasDemoRequestSchema } from "@/domains/marketing/demo-requests";

export const Route = createFileRoute("/api/public/staynas-demo-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.json().catch(() => null);
          const parsed = stayNasDemoRequestSchema.safeParse(raw);
          if (!parsed.success) {
            return Response.json({ ok: false, error: "Please check the required fields and try again." }, { status: 400 });
          }

          const input = parsed.data;
          // Silent success for the honeypot field; do not disclose spam filtering.
          if (input.website) return Response.json({ ok: true });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const store = supabaseAdmin as unknown as SupabaseClient;
          const email = input.email.toLowerCase();
          // Vercel supplies x-real-ip at the edge. Do not trust caller-controlled
          // x-forwarded-for values as a fallback for abuse controls.
          const ipAddress = request.headers.get("x-real-ip");
          const hmacKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!hmacKey) throw new Error("Demo request service is temporarily unavailable.");
          const ipHash = ipAddress ? createHmac("sha256", hmacKey).update(ipAddress).digest("hex") : null;

          // The database function takes transaction-scoped advisory locks for
          // the IP and email keys, making deduplication and rate limiting atomic.
          const { data, error } = await store.rpc("submit_staynas_website_demo_request", {
            p_ip_hash: ipHash,
            p_request: {
              name: input.name,
              email,
              phone: input.phone || null,
              company: input.company || null,
              country: input.country || null,
              property_type: input.propertyType,
              property_count_band: input.properties,
              interests: input.interests,
              message: input.message || null,
              source: "staynas.com",
            },
          });
          if (error) throw new Error("Demo request could not be saved. Please try again.");
          const saved = Array.isArray(data) ? data[0] : data;
          if (!saved) throw new Error("Demo request could not be saved. Please try again.");
          if (saved.rate_limited) {
            return Response.json({ ok: false, error: "Too many requests. Please try again later." }, { status: 429 });
          }
          if (saved.duplicate) return Response.json({ ok: true });

          // Email is an optional notification layer. The durable request is
          // saved first; missing mail configuration must not lose the enquiry.
          const notifyTo = process.env.STAYNAS_DEMO_NOTIFICATION_EMAIL;
          const from = process.env.STAYNAS_DEMO_FROM_EMAIL;
          if (process.env.STAYNAS_PLATFORM_RESEND_API_KEY && notifyTo && from) {
            try {
              const { sendResendEmail } = await import("@/domains/ai/concierge/providers/resend-email.server");
              await sendResendEmail({
                from,
                to: notifyTo,
                replyTo: email,
                subject: "New StayNas website demo request",
                text: [
                  "A new StayNas demo request was submitted.",
                  "",
                  `Name: ${input.name}`,
                  `Email: ${email}`,
                  `Phone: ${input.phone || "Not provided"}`,
                  `Business: ${input.company || "Not provided"}`,
                  `Country: ${input.country || "Not provided"}`,
                  `Property type: ${input.propertyType}`,
                  `Property count: ${input.properties}`,
                  `Interests: ${input.interests.join(", ") || "Not specified"}`,
                  "",
                  input.message || "No additional message.",
                  "",
                  `Request ID: ${saved.request_id}`,
                ].join("\n"),
                idempotencyKey: `staynas-demo-${saved.request_id}`,
                tags: [{ name: "source", value: "staynas-website" }],
              }, { config: { apiKey: process.env.STAYNAS_PLATFORM_RESEND_API_KEY! } });
            } catch (notifyError) {
              console.error("[StayNas demo request] Notification dispatch failed; request remains stored.", notifyError instanceof Error ? notifyError.message : "unknown");
            }
          }

          return Response.json({ ok: true, requestId: saved.request_id });
        } catch (error) {
          console.error("[StayNas demo request] Submission failed.", error instanceof Error ? error.message : "unknown");
          return Response.json({ ok: false, error: "We could not submit your request. Please try again later." }, { status: 500 });
        }
      },
    },
  },
});
