import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = randomUUID();
        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > 1024) {
            return Response.json({ error: "Request is too large." }, { status: 413, headers: { "X-Request-ID": requestId } });
          }
          const { consumePublicRateLimit } = await import("@/lib/public-rate-limit.server");
          if (!await consumePublicRateLimit(request, "concierge-session", 60, 60)) {
            return Response.json({ error: "Please wait before refreshing your conversation." }, { status: 429, headers: { "Retry-After": "60", "X-Request-ID": requestId } });
          }
          const raw = await request.text();
          if (raw.length > 1024) {
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
          const token = typeof body.session_token === "string" ? body.session_token : "";
          if (!/^cnc_[A-Za-z0-9_-]{43}$/.test(token)) {
            return Response.json({ error: "Conversation not found." }, { status: 404, headers: { "X-Request-ID": requestId } });
          }

          const { resolvePublicPropertyFromHostname } = await import("@/lib/public-property.server");
          const propertyId = await resolvePublicPropertyFromHostname(request.headers.get("host"));
          const { loadConciergeSession } = await import("@/domains/ai/concierge/concierge.server");
          const session = await loadConciergeSession(token, propertyId);
          if (!session) return Response.json({ error: "Conversation not found." }, { status: 404, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
          return Response.json(session, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
        } catch (error) {
          const errorName = error instanceof Error ? error.name : "UnknownError";
          console.error("[concierge] public session refresh failed", { requestId, errorName });
          const status = errorName === "PublicPropertyResolutionError" ? 404 : 503;
          return Response.json(
            { error: status === 404 ? "Conversation not found." : "Conversation refresh is temporarily unavailable." },
            { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
          );
        }
      },
    },
  },
});
