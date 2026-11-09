import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/commercial")({
  beforeLoad: () => { throw redirect({ to: "/founder/plans" }); },
  component: () => null,
});
