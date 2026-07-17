import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge")({
  head: () => ({
    meta: [{ title: "AI Concierge — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: () => <Outlet />,
});