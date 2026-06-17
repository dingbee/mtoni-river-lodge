import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dining-leisure")({
  beforeLoad: () => {
    throw redirect({ href: "/dining", statusCode: 301 });
  },
});