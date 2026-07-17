import { createFileRoute, redirect } from "@tanstack/react-router";

// Sprint 9K — legacy Ops Calendar is consolidated into /admin/calendar.
// Route preserved to keep bookmarks working; it redirects on load.
export const Route = createFileRoute("/_authenticated/admin/operations/calendar")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/admin/calendar" });
  },
});
