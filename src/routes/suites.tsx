import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/suites")({
  beforeLoad: () => {
    throw redirect({ to: "/rooms" });
  },
});
