import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { recordFeedback } = await import("@/domains/ai/concierge/tracking");
          const result = await recordFeedback({
            session_token: typeof body?.session_token === "string" ? body.session_token : null,
            rating: typeof body?.rating === "string" ? body.rating : "",
            comment: typeof body?.comment === "string" ? body.comment : null,
            message_id: typeof body?.message_id === "string" ? body.message_id : null,
          });
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ error: err?.message ?? "Could not save feedback." }, { status: 400 });
        }
      },
    },
  },
});