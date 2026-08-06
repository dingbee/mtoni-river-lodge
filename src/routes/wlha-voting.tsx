import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Placeholder route for the WLHA voting landing page.
 * Currently forwards to the existing campaign page at /vote; replace the
 * redirect with the embedded voting experience once it is available.
 */
export const Route = createFileRoute("/wlha-voting")({
  beforeLoad: () => {
    throw redirect({ to: "/vote", replace: true });
  },
});
