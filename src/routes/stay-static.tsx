import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/stay-static")({
  beforeLoad: () => {
    throw redirect({ href: "/stay", statusCode: 301 });
  },
});
