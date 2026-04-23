import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/suites")({
  component: SuitesLayout,
});

function SuitesLayout() {
  return <Outlet />;
}
