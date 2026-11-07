import { createFileRoute } from "@tanstack/react-router";
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
          const email = input.email.toLowerCase();
          const recentSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const recentHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const ipAddress = request.headers.get("x-real-ip")
            ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? null;
          const { createHmac } = await import("node:crypto");
          const rateLimitKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (!rateLimitKey) throw new Error("Demo request service is temporarily unavailable.");
          const ipHash = ipAddress
            ? createHmac("sha256", rateLimitKey).update(ipAddress).digest("hex")
            : null;

          if (ipHash) {
            const { count, error: rateError } = await (supabaseAdmin as any)
              .from("staynas_website_demo_requests")
              .select("id", { count: "exact", head: true })
              .eq("ip_hash", ipHash)
              .gte("created_at", recentHour);
            if (rateError) throw new Error("Demo request service is temporarily unavailable.");
            if ((count ?? 0) >= 5) {
              return Response.json({ ok: false, error: "Too many requests. Please try again later." }, { status: 429 });
            }
          }
          const { data: recent, error: recentError } = await (supabaseAdmin as any)
            .from("staynas_website_demo_requests")
            .select("id")
            .eq("email", email)
            .gte("created_at", recentSince)
            .limit(1);
          if (recentError) throw new Error("Demo request service is temporarily unavailable.");
          if (recent?.length) return Response.json({ ok: true });

          const { data: saved, error } = await (supabaseAdmin as any)
            .from("staynas_website_demo_requests")
            .insert({
              name: input.name,
              email,
              ip_hash: ipHash,
              consent_at: new Date().toISOString(),
              phone: input.phone || null,
              company: input.company || null,
              country: input.country || null,
              property_type: input.propertyType,
              property_count_band: input.properties,
              interests: input.interests,
              message: input.message || null,
              source: "staynas.com",
              status: "new",
            })
            .select("id, created_at")
            .single();
          if (error || !saved) throw new Error("Demo request could not be saved. Please try again.");

          // Email is an optional notification layer. The durable request is
          // saved first; missing mail configuration must not lose the enquiry.
          const notifyTo = process.env.STAYNAS_DEMO_NOTIFICATION_EMAIL;
          const from = process.env.STAYNAS_DEMO_FROM_EMAIL;
          if (process.env.RESEND_API_KEY && notifyTo && from) {
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
                  `Request ID: ${saved.id}`,
                ].join("\n"),
                idempotencyKey: `staynas-demo-${saved.id}`,
                tags: [{ name: "source", value: "staynas-website" }],
              });
            } catch (notifyError) {
              console.error("[StayNas demo request] Notification dispatch failed; request remains stored.", notifyError instanceof Error ? notifyError.message : "unknown");
            }
          }

          return Response.json({ ok: true, requestId: saved.id });
        } catch (error) {
          console.error("[StayNas demo request] Submission failed.", error instanceof Error ? error.message : "unknown");
          return Response.json({ ok: false, error: "We could not submit your request. Please try again later." }, { status: 500 });
        }
      },
    },
  },
});
