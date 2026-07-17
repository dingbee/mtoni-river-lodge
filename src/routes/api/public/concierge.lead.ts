import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/concierge/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { captureLead } = await import("@/domains/ai/concierge/concierge.leads");
          const result = await captureLead({
            session_token: typeof body?.session_token === "string" ? body.session_token : null,
            name: typeof body?.name === "string" ? body.name : null,
            email: typeof body?.email === "string" ? body.email : null,
            phone: typeof body?.phone === "string" ? body.phone : null,
            country: typeof body?.country === "string" ? body.country : null,
            travel_period_start: typeof body?.travel_period_start === "string" ? body.travel_period_start : null,
            travel_period_end: typeof body?.travel_period_end === "string" ? body.travel_period_end : null,
            adults: typeof body?.adults === "number" ? body.adults : null,
            children: typeof body?.children === "number" ? body.children : null,
            interests: Array.isArray(body?.interests) ? body.interests : [],
            notes: typeof body?.notes === "string" ? body.notes : null,
          });
          return Response.json(result);
        } catch (err: any) {
          console.error("[concierge] lead error:", err?.message ?? err);
          return Response.json({ error: err?.message ?? "Could not save your details." }, { status: 400 });
        }
      },
    },
  },
});