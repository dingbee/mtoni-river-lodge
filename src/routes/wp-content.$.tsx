import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/wp-content/$")({
  server: {
    handlers: {
      GET: () => new Response("Gone", { status: 410, headers: { "Content-Type": "text/plain" } }),
    },
  },
  component: () => null,
});
