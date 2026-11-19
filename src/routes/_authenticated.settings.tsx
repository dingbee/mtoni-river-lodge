import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: () => {
    // Keep the legacy account-menu URL inside the authenticated OS shell.
    throw redirect({ to: "/admin/settings/" });
  },
});
