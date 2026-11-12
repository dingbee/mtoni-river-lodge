import { createFileRoute, redirect } from "@tanstack/react-router";

/** Preserve the historic Distribution Centre URL while routing to the canonical DC-07 connection UI. */
export const Route = createFileRoute("/_authenticated/admin/distribution")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings/distribution" });
  },
  component: () => null,
});
