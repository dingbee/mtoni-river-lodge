import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = randomUUID();
        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > 8192) {
            return Response.json({ error: "Request is too large." }, { status: 413, headers: { "X-Request-ID": requestId } });
          }
          const { consumePublicRateLimit } = await import("@/lib/public-rate-limit.server");
          if (!await consumePublicRateLimit(request, "concierge-chat", 20, 60)) {
            return Response.json({ error: "Please wait before sending another message." }, { status: 429, headers: { "Retry-After": "60", "X-Request-ID": requestId } });
          }

          const raw = await request.text();
          if (raw.length > 8192) {
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

          const rawMessage = typeof body.message === "string" ? body.message : "";
          const message = rawMessage.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
          if (!message) {
            return Response.json({ error: "Message is required." }, { status: 400, headers: { "X-Request-ID": requestId } });
          }
          if (message.length > 1000) {
            return Response.json({ error: "Message is too long." }, { status: 400, headers: { "X-Request-ID": requestId } });
          }

          const { resolvePublicPropertyFromHostname } = await import("@/lib/public-property.server");
          const propertyId = await resolvePublicPropertyFromHostname(request.headers.get("host"));
          const { handleConciergeChat } = await import("@/domains/ai/concierge/concierge.server");
          const reply = await handleConciergeChat(
            {
              session_token: typeof body.session_token === "string" ? body.session_token : null,
              message,
              page: typeof body.page === "string" ? body.page.slice(0, 200) : null,
              locale: typeof body.locale === "string" ? body.locale.slice(0, 16) : null,
            },
            {
              userAgent: request.headers.get("user-agent"),
              referer: request.headers.get("referer"),
            },
            propertyId,
          );
          return Response.json(reply, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
        } catch (error) {
          const errorName = error instanceof Error ? error.name : "UnknownError";
          console.error("[concierge] public chat failed", { requestId, errorName });
          const status = errorName === "PublicPropertyResolutionError" ? 404 : 503;
          return Response.json(
            { error: status === 404 ? "Concierge is not available for this website." : "Concierge is temporarily unavailable. Please try again." },
            { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
          );
        }
      },
    },
  },
});
