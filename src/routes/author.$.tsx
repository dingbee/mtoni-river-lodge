import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/author/$")({
  server: {
    handlers: {
      GET: () => new Response("Gone", { status: 410, headers: { "Content-Type": "text/plain" } }),
    },
  },
  component: () => null,
});
