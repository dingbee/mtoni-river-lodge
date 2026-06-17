import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/about-us")({
  beforeLoad: () => {
    throw redirect({ href: "/lodge", statusCode: 301 });
  },
});