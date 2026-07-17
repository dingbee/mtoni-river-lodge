import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const message = typeof body?.message === "string" ? body.message : "";
          if (!message.trim()) {
            return Response.json({ error: "Message is required." }, { status: 400 });
          }
          if (message.length > 1000) {
            return Response.json({ error: "Message is too long." }, { status: 400 });
          }
          const { handleConciergeChat } = await import("@/domains/ai/concierge/concierge.server");
          const reply = await handleConciergeChat(
            {
              session_token: typeof body?.session_token === "string" ? body.session_token : null,
              message,
              page: typeof body?.page === "string" ? body.page : null,
              locale: typeof body?.locale === "string" ? body.locale : null,
            },
            {
              userAgent: request.headers.get("user-agent"),
              referer: request.headers.get("referer"),
            },
          );
          return Response.json(reply);
        } catch (err: any) {
          console.error("[concierge] chat error:", err?.message ?? err);
          return Response.json(
            { error: err?.message ?? "Concierge unavailable." },
            { status: 500 },
          );
        }
      },
    },
  },
});