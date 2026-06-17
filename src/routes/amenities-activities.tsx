import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/amenities-activities")({
  beforeLoad: () => {
    throw redirect({ href: "/experiences", statusCode: 301 });
  },
});