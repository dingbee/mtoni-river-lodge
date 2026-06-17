import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/journal/a-morning-with-the-beekeepers-of-gomba")({
  beforeLoad: () => {
    throw redirect({ href: "/journal/life-along-the-nduruma-river", statusCode: 301 });
  },
});