import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/suites")({
  beforeLoad: () => {
    throw redirect({ href: "/rooms", statusCode: 301 });
  },
});
