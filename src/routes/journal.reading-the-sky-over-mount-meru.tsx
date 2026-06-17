import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/journal/reading-the-sky-over-mount-meru")({
  beforeLoad: () => {
    throw redirect({ href: "/journal/building-with-the-community", statusCode: 301 });
  },
});