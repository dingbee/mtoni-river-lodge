import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = randomUUID();
        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > 4096) {
            return Response.json({ error: "Request is too large." }, { status: 413, headers: { "X-Request-ID": requestId } });
          }
          const { consumePublicRateLimit } = await import("@/lib/public-rate-limit.server");
          if (!await consumePublicRateLimit(request, "concierge-lead", 5, 900)) {
            return Response.json({ error: "Please wait before submitting another enquiry." }, { status: 429, headers: { "Retry-After": "900", "X-Request-ID": requestId } });
          }
          const raw = await request.text();
          if (raw.length > 4096) {
            return Response.json({ error: "Request is too large." }, { status: 413, headers: { "X-Request-ID": requestId } });
          }
          let body: Record<string, unknown>;
          try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
            body = parsed as Record<string, unknown>;
          } catch {
            return Response.json({ error: "Invalid request body." }, { status: 400, headers: { "X-Request-ID": requestId } });
          }

          const { resolvePublicPropertyFromHostname } = await import("@/lib/public-property.server");
          const propertyId = await resolvePublicPropertyFromHostname(request.headers.get("host"));
          const { captureLead } = await import("@/domains/ai/concierge/concierge.leads");
          const result = await captureLead({
            session_token: typeof body.session_token === "string" ? body.session_token : null,
            consent: body.consent === true,
            name: typeof body.name === "string" ? body.name : null,
            email: typeof body.email === "string" ? body.email : null,
            phone: typeof body.phone === "string" ? body.phone : null,
            country: typeof body.country === "string" ? body.country : null,
            travel_period_start: typeof body.travel_period_start === "string" ? body.travel_period_start : null,
            travel_period_end: typeof body.travel_period_end === "string" ? body.travel_period_end : null,
            adults: typeof body.adults === "number" ? body.adults : null,
            children: typeof body.children === "number" ? body.children : null,
            interests: Array.isArray(body.interests) ? body.interests : [],
            notes: typeof body.notes === "string" ? body.notes : null,
          }, propertyId);
          return Response.json(result, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
        } catch (error) {
          const errorName = error instanceof Error ? error.name : "UnknownError";
          console.error("[concierge] public lead capture failed", { requestId, errorName });
          const status = errorName === "PublicPropertyResolutionError" ? 404 : 400;
          return Response.json(
            { error: status === 404 ? "Concierge is not available for this website." : "We could not save your enquiry. Please check your details and try again." },
            { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
          );
        }
      },
    },
  },
});
