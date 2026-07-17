import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/attribution")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { recordAttribution } = await import("@/domains/ai/concierge/tracking");
          const result = await recordAttribution({
            session_token: typeof body?.session_token === "string" ? body.session_token : null,
            conversion_type: typeof body?.conversion_type === "string" ? body.conversion_type : "booking_click",
            metadata: typeof body?.metadata === "object" && body?.metadata ? body.metadata : {},
          });
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ error: err?.message ?? "Could not record event." }, { status: 400 });
        }
      },
    },
  },
});