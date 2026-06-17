import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/booking-form")({
  beforeLoad: () => {
    throw redirect({ href: "/book", statusCode: 301 });
  },
});