import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/category/$")({
  server: {
    handlers: {
      GET: () => new Response("Gone", { status: 410, headers: { "Content-Type": "text/plain" } }),
    },
  },
  component: () => null,
});
